// Simulador de jugadores: una pantalla y varios mandos falsos que juegan una partida entera contra el servidor.
// Sirve para probar los minijuegos sin tener 8 móviles y para medir el tráfico con 2, 4 u 8 jugadores.
//
//   node scripts/simular.js [--jugadores 4] [--url ws://localhost:3000] [--partidas 1] [--quieto]
//
// Los bots juegan "bien": en la Carrera agitan, en el Laberinto buscan el camino a la meta con el mapa que
// recibe la pantalla, y en Reflejos pulsan tras la señal (alguna vez antes de tiempo, para probar la penalización).
// Con --quieto los bots apenas se mueven, para ver cuánto ahorra la compresión delta.
// Imita al mando real: envía como mucho cada 33 ms (inclinar) o 50 ms (agitar) y solo si el valor cambia.
import WebSocket from 'ws';
import { decode, encodeButton, encodeShake, encodeTilt } from '../shared/protocol.js';

const args = process.argv.slice(2);
const opcion = (nombre, defecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i === -1 ? defecto : args[i + 1];
};
const N = Number(opcion('jugadores', 4));
const URL_WS = opcion('url', 'ws://localhost:3000').replace(/^http/, 'ws');
const PARTIDAS = Number(opcion('partidas', 1));
const QUIETO = args.includes('--quieto');

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const abrir = (rol) =>
  new Promise((resolve, reject) => {
    const s = new WebSocket(`${URL_WS}/ws?rol=${rol}`);
    s.binaryType = 'arraybuffer';
    s.once('open', () => resolve(s));
    s.once('error', reject);
  });
const json = (s, msg) => s.readyState === WebSocket.OPEN && s.send(JSON.stringify(msg));

// Lo que va viendo la pantalla: los bots lo usan para "mirar" la pantalla grande.
const vista = { fase: null, minijuego: null, setup: null, estado: null, problemas: [] };

function log(...x) {
  console.log(new Date().toISOString().slice(11, 23), ...x);
}

// Pantalla

async function pantalla() {
  const s = await abrir('pantalla');
  let resolverSala;
  const sala = new Promise((r) => (resolverSala = r));
  let resolverPodio;
  let podio = null;
  const jugadores = new Map();

  s.on('message', (data, binario) => {
    if (binario) return;
    const msg = JSON.parse(data);
    switch (msg.type) {
      case 'room_created':
        resolverSala(msg.code);
        break;
      case 'player_joined':
        jugadores.set(msg.player.id, msg.player.name);
        break;
      case 'round_intro':
      case 'countdown':
      case 'round_start':
        if (msg.type === 'round_intro') log(`Ronda ${msg.round}/${msg.rounds}: ${msg.minigame.name}`);
        vista.fase = msg.type;
        vista.minijuego = msg.minigame.id;
        vista.setup = msg.setup;
        vista.estado = msg;
        break;
      case 'state_update':
        if (vista.minijuego === 'reflejos' && msg.phase === 'pausa' && vista.estado?.phase !== 'pausa') {
          const tiempos = msg.players.map((p) => `${jugadores.get(p.id)}: ${p.early ? 'antes' : p.missed ? 'nada' : `${p.ms} ms`}`);
          log(`  Señal ${msg.signal}: ${tiempos.join(', ')}`);
        }
        vista.estado = msg;
        comprobar(msg);
        break;
      case 'round_end': {
        vista.fase = msg.type;
        const nombres = msg.results.map((r) => `${r.place}º ${jugadores.get(r.id)} (+${r.points})`).join(', ');
        log(`  Resultados: ${nombres}`);
        break;
      }
      case 'podium':
        vista.fase = msg.type;
        log(`Podio: ${msg.ranking.map((r) => `${r.place}º ${jugadores.get(r.id)} ${r.total} pts`).join(', ')}`);
        podio?.(msg);
        break;
    }
  });

  json(s, { type: 'create_room' });
  return {
    socket: s,
    code: await sala,
    terminar: () => new Promise((r) => (podio = r)),
  };
}

// Cosas que no deberían pasar nunca, vistas desde la pantalla.
function comprobar(msg) {
  if (vista.minijuego !== 'laberinto' || !vista.setup) return;
  const { cols, rows, radius, wall, walls } = vista.setup;
  for (const p of msg.players) {
    if (p.place) continue;
    if (p.x < radius - 0.05 || p.y < radius - 0.05 || p.x > cols - radius + 0.05 || p.y > rows - radius + 0.05) {
      vista.problemas.push(`Bola ${p.id} fuera del tablero en (${p.x}, ${p.y})`);
    }
    // Hundida en una pared bastante más de lo que permite el redondeo de las posiciones.
    for (const [x1, y1, x2, y2] of walls) {
      const cx = Math.max(x1 - wall / 2, Math.min(p.x, x2 + wall / 2));
      const cy = Math.max(y1 - wall / 2, Math.min(p.y, y2 + wall / 2));
      if (Math.hypot(p.x - cx, p.y - cy) < radius * 0.6) {
        vista.problemas.push(`Bola ${p.id} dentro de la pared [${x1},${y1},${x2},${y2}] en (${p.x}, ${p.y})`);
      }
    }
  }
}

// Mandos

class Bot {
  constructor(i) {
    this.i = i;
    this.nombre = `Bot ${i + 1}`;
    this.id = null;
    this.control = null;
    this.timer = null;
    this.vibraciones = 0;
    this.enviados = 0;
    this.bytes = 0;
  }

  async conectar(code) {
    this.s = await abrir('mando');
    this.s.on('message', (data, binario) => {
      if (binario) {
        if (decode(new Uint8Array(data))?.type === 'vibrate') this.vibraciones++;
        return;
      }
      this.alRecibir(JSON.parse(data));
    });
    json(this.s, { type: 'join_room', code, name: this.nombre, avatar: this.i });
    await new Promise((r) => (this.unido = r));
  }

  binario(datos) {
    if (this.s.readyState !== WebSocket.OPEN) return;
    this.s.send(datos);
    this.enviados++;
    this.bytes += datos.byteLength;
  }

  alRecibir(msg) {
    switch (msg.type) {
      case 'joined':
        this.id = msg.player.id;
        this.unido();
        break;
      case 'join_error':
        throw new Error(`${this.nombre} no ha podido unirse: ${msg.reason}`);
      case 'round_intro':
      case 'countdown':
      case 'round_end':
      case 'podium':
      case 'finished':
        this.parar();
        break;
      case 'round_start':
        this.empezar(msg.minigame.control, msg.minigame.id);
        break;
      case 'reflex_wait':
        this.pulsadoEnSenal = false;
        break;
      case 'vote_start':
        // Dibuja: vota a alguien al azar al cabo de un rato.
        if (msg.candidates.length) {
          const elegido = msg.candidates[Math.floor(Math.random() * msg.candidates.length)];
          setTimeout(() => this.binario(encodeButton(this.id, elegido.id, true)), 1000 + Math.random() * 3000);
        }
        break;
    }
  }

  // Como el mando real: al dejar de leer el sensor cuenta cuántas lecturas tomó y cuántas envió.
  parar() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.muestras?.tomadas) {
      json(this.s, { type: 'input_stats', samples: this.muestras.tomadas, sent: this.muestras.enviadas });
    }
    this.muestras = null;
  }

  // Una lectura del sensor; si hay que enviarla, datos es el mensaje.
  muestra(datos) {
    this.muestras.tomadas++;
    if (!datos) return;
    this.muestras.enviadas++;
    this.binario(datos);
  }

  empezar(control, juego) {
    this.parar();
    this.muestras = { tomadas: 0, enviadas: 0 };
    if (control === 'agitar') this.agitar();
    else if (control === 'inclinar') this.inclinar(juego);
    else if (juego === 'machaca') this.machacar();
    else if (juego === 'patata') this.patata();
    else if (juego === 'simon') this.simon();
    else if (juego === 'ritmo') this.ritmo();
    else if (juego === 'dibuja') this.dibujar();
    else if (juego === 'cronometro') this.cronometrar();
    else if (control === 'tocar') this.tocar();
    else if (control === 'opciones') this.elegir(juego);
  }

  // Patata caliente: si le llega la bomba, la pasa al cabo de un rato (a veces tarda demasiado).
  patata() {
    let esperando = false;
    this.timer = setInterval(() => {
      if (vista.estado?.holder !== this.id || esperando) return;
      esperando = true;
      setTimeout(() => {
        esperando = false;
        if (vista.estado?.holder === this.id) this.pulsar();
      }, 350 + Math.random() * 1500);
    }, 50);
  }

  // Simón dice: apunta la secuencia que ve en la pantalla y la repite; a veces se equivoca.
  simon() {
    let secuencia = [];
    let paso = null;
    let nivel = 0;
    this.timer = setInterval(() => {
      const e = vista.estado;
      if (!e || e.phase === undefined) return;
      if (e.phase === 'mostrar') {
        if (e.length !== nivel) {
          nivel = e.length;
          secuencia = [];
        }
        if (e.step !== null && e.step !== paso) secuencia[e.step] = e.lit;
        paso = e.step;
      }
      if (e.phase === 'repetir' && secuencia.length === nivel && nivel) {
        const repetir = secuencia;
        secuencia = [];
        repetir.forEach((color, i) => {
          const fallo = Math.random() < 0.04;
          setTimeout(() => {
            const boton = fallo ? (color + 1) % 4 : color;
            this.binario(encodeButton(this.id, boton, true));
          }, 400 + i * 350);
        });
      }
    }, 20);
  }

  // Ritmo: pulsa en el momento de cada nota con un error de hasta ±90 ms (y alguna se le escapa).
  ritmo() {
    const notas = vista.setup?.notes ?? [];
    const base = performance.now() - (vista.estado?.time ?? 0) * 1000;
    for (const nota of notas) {
      if (Math.random() < 0.1) continue;
      const cuando = base + (nota.t + 0.06 + (Math.random() - 0.5) * 0.18) * 1000 - performance.now();
      if (cuando > 0) setTimeout(() => this.pulsar(), cuando);
    }
    this.timer = setInterval(() => {}, 1000);
  }

  // Dibuja: unos cuantos garabatos.
  dibujar() {
    let trazos = 0;
    this.timer = setInterval(() => {
      if (trazos++ > 12) return;
      const x = 100 + Math.random() * 800;
      const y = 100 + Math.random() * 800;
      json(this.s, { type: 'draw', op: 'start', c: Math.floor(Math.random() * 8), w: Math.floor(Math.random() * 3), p: [Math.round(x), Math.round(y)] });
      const puntos = [];
      for (let i = 1; i <= 20; i++) puntos.push(Math.round(Math.min(1000, Math.max(0, x + Math.cos(i / 3) * i * 8))), Math.round(Math.min(1000, Math.max(0, y + Math.sin(i / 3) * i * 8))));
      json(this.s, { type: 'draw', op: 'add', p: puntos });
    }, 600);
  }

  // Machaca: entre 6 y 10 toques por segundo.
  machacar() {
    const ritmo = 100 + Math.random() * 70;
    this.timer = setInterval(() => !QUIETO && this.pulsar(), ritmo);
  }

  // Cronómetro: pulsa una vez cerca de los 7 s (con un error humano de hasta medio segundo).
  cronometrar() {
    const cuando = (7 + (Math.random() - 0.5)) * 1000;
    this.timer = setTimeout(() => this.pulsar(), cuando);
  }

  // Quiz y Colores: responde en cada turno. En Colores mira la tinta y acierta casi siempre; en el Quiz, al azar.
  elegir(juego) {
    let turno = -1;
    this.timer = setInterval(() => {
      const e = vista.estado;
      if (!e || e.phase !== 'pregunta' || e.looking || e.turn === turno) return;
      turno = e.turn;
      const acierta = juego === 'colores' && Math.random() < 0.8;
      const opcion = acierta ? e.ink : Math.floor(Math.random() * (juego === 'colores' ? 8 : 4));
      const espera = juego === 'colores' ? 400 + Math.random() * 1200 : 1000 + Math.random() * 4000;
      setTimeout(() => {
        this.binario(encodeButton(this.id, opcion, true));
        setTimeout(() => this.binario(encodeButton(this.id, opcion, false)), 60);
      }, espera);
    }, 50);
  }

  agitar() {
    let enviado = 0;
    const fuerza = QUIETO ? 0 : 0.6 + Math.random() * 0.4;
    this.timer = setInterval(() => {
      const nivel = QUIETO ? 0 : Math.max(0, Math.min(1, fuerza + (Math.random() - 0.5) * 0.3));
      if (Math.abs(nivel - enviado) >= 0.04) {
        enviado = nivel;
        this.muestra(encodeShake(this.id, nivel));
      } else {
        this.muestra(null);
      }
    }, 50);
  }

  inclinar(juego) {
    let enviado = { x: 0, y: 0 };
    let anterior = null;
    this.timer = setInterval(() => {
      const yo = vista.estado?.players?.find((p) => p.id === this.id);
      if (!yo || !vista.setup || yo.out) return;
      let x = 0;
      let y = 0;
      if (!QUIETO) {
        const destino = juego === 'sumo' ? destinoSumo(yo) : juego === 'esquiva' ? destinoEsquiva(yo) : siguienteCelda(vista.setup, yo);
        // Hacia el centro de la siguiente celda, frenando con la velocidad que lleva (control PD).
        const v = anterior ? { x: (yo.x - anterior.x) / 0.033, y: (yo.y - anterior.y) / 0.033 } : { x: 0, y: 0 };
        x = Math.max(-1, Math.min(1, (destino.x - yo.x) * 1.6 - v.x * 0.25 + (Math.random() - 0.5) * 0.1));
        y = Math.max(-1, Math.min(1, (destino.y - yo.y) * 1.6 - v.y * 0.25 + (Math.random() - 0.5) * 0.1));
      }
      anterior = { x: yo.x, y: yo.y };
      const q = { x: Math.round(x * 127), y: Math.round(y * 127) };
      if (Math.abs(q.x - enviado.x) >= 2 || Math.abs(q.y - enviado.y) >= 2) {
        enviado = q;
        this.muestra(encodeTilt(this.id, x, y));
      } else {
        this.muestra(null);
      }
    }, 33);
  }

  tocar() {
    // Reflejos: mira la pantalla y pulsa tras la señal con un tiempo de reacción humano.
    // De vez en cuando se adelanta, para probar la penalización.
    this.pulsadoEnSenal = false;
    let senal = -1;
    this.timer = setInterval(() => {
      const e = vista.estado;
      if (!e || e.signal === undefined) return;
      if (e.signal !== senal) {
        senal = e.signal;
        this.pulsadoEnSenal = false;
        this.reaccion = 180 + Math.random() * 250;
        this.adelantarse = !QUIETO && Math.random() < 0.1;
        this.vistoYa = null;
      }
      if (this.pulsadoEnSenal) return;
      if (e.phase === 'espera' && this.adelantarse && Math.random() < 0.05) {
        this.adelantos = (this.adelantos ?? 0) + 1;
        return this.pulsar();
      }
      if (e.phase === 'ya') {
        this.vistoYa ??= performance.now();
        if (performance.now() - this.vistoYa >= this.reaccion) this.pulsar();
      }
    }, 10);
  }

  pulsar() {
    this.pulsadoEnSenal = true;
    this.binario(encodeButton(this.id, 0, true));
    setTimeout(() => this.binario(encodeButton(this.id, 0, false)), 80);
  }
}

// Sumo: hacia el rival más cercano, salvo si está cerca del borde, que vuelve al centro.
function destinoSumo(yo) {
  const { radius, players } = vista.estado;
  if (Math.hypot(yo.x, yo.y) > radius * 0.7) return { x: 0, y: 0 };
  const rivales = players.filter((p) => p.id !== yo.id && !p.out);
  if (!rivales.length) return { x: 0, y: 0 };
  const cerca = rivales.sort((a, b) => Math.hypot(a.x - yo.x, a.y - yo.y) - Math.hypot(b.x - yo.x, b.y - yo.y))[0];
  return { x: cerca.x, y: cerca.y };
}

// Esquiva: se aparta del meteorito más cercano que le vaya a caer encima; si no, vuelve hacia el centro.
function destinoEsquiva(yo) {
  const { meteors = [] } = vista.estado;
  const { width, height } = vista.setup;
  const peligro = meteors.find((m) => Math.hypot(m.x - yo.x, m.y - yo.y) < m.r + 1);
  if (!peligro) return { x: width / 2, y: height / 2 };
  const dx = yo.x - peligro.x || 0.1;
  const dy = yo.y - peligro.y || 0.1;
  const d = Math.hypot(dx, dy);
  return { x: yo.x + (dx / d) * 3, y: yo.y + (dy / d) * 3 };
}

// Siguiente celda del camino más corto hasta la meta, con las paredes del escenario.
const caminos = new WeakMap();
function siguienteCelda(setup, bola) {
  let mapa = caminos.get(setup);
  if (!mapa) {
    mapa = distanciasMeta(setup);
    caminos.set(setup, mapa);
  }
  const cx = Math.min(setup.cols - 1, Math.max(0, Math.floor(bola.x)));
  const cy = Math.min(setup.rows - 1, Math.max(0, Math.floor(bola.y)));
  let mejor = { x: cx, y: cy, d: mapa.d[cx][cy] };
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = cx + dx;
    const ny = cy + dy;
    if (!mapa.abierto(cx, cy, nx, ny)) continue;
    if (mapa.d[nx][ny] < mejor.d) mejor = { x: nx, y: ny, d: mapa.d[nx][ny] };
  }
  return { x: mejor.x + 0.5, y: mejor.y + 0.5 };
}

function distanciasMeta({ cols, rows, walls, goal }) {
  const bloqueado = new Set();
  for (const [x1, y1, x2, y2] of walls) {
    if (x1 === x2) for (let y = y1; y < y2; y++) bloqueado.add(`v${x1},${y}`);
    else for (let x = x1; x < x2; x++) bloqueado.add(`h${x},${y1}`);
  }
  const abierto = (x, y, nx, ny) => {
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return false;
    if (nx !== x) return !bloqueado.has(`v${Math.max(x, nx)},${y}`);
    return !bloqueado.has(`h${x},${Math.max(y, ny)}`);
  };
  const d = Array.from({ length: cols }, () => Array(rows).fill(Infinity));
  const meta = { x: Math.floor(goal.x), y: Math.floor(goal.y) };
  d[meta.x][meta.y] = 0;
  const cola = [meta];
  while (cola.length) {
    const { x, y } = cola.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (abierto(x, y, nx, ny) && d[nx][ny] === Infinity) {
        d[nx][ny] = d[x][y] + 1;
        cola.push({ x: nx, y: ny });
      }
    }
  }
  return { d, abierto };
}

// Partida

const host = await pantalla();
log(`Sala ${host.code} con ${N} bots`);
const bots = Array.from({ length: N }, (_, i) => new Bot(i));
for (const b of bots) await b.conectar(host.code);

for (let p = 0; p < PARTIDAS; p++) {
  const inicio = performance.now();
  const fin = host.terminar();
  json(host.socket, { type: 'start_game' });
  await fin;
  const segundos = (performance.now() - inicio) / 1000;
  const enviados = bots.reduce((a, b) => a + b.enviados, 0);
  const bytes = bots.reduce((a, b) => a + b.bytes, 0);
  log(`Partida ${p + 1} en ${segundos.toFixed(1)} s · ${enviados} mensajes binarios de los mandos, ${bytes} B`);
  log(`Vibraciones recibidas: ${bots.map((b) => b.vibraciones).join(', ')}`);
  log(`Adelantos a propósito: ${bots.map((b) => b.adelantos ?? 0).join(', ')}`);
}

// Lo que ha medido el servidor en cada ronda (ver server/medidas.js).
const medidas = await fetch(`${URL_WS.replace(/^ws/, 'http')}/api/medidas?sala=${host.code}`)
  .then((r) => r.json())
  .catch(() => []);
if (medidas.length) {
  console.log('\nMediciones (bytes por segundo, contando las cabeceras de WebSocket en la subida):');
  console.table(
    medidas.map((m) => ({
      minijuego: m.minijuego,
      jugadores: m.jugadores,
      segundos: m.segundos,
      'msg/s': m.subida.mensajesPorSegundo,
      'JSON': m.subida.bytesPorSegundo.json,
      'MsgPack': m.subida.bytesPorSegundo.msgpack,
      'bin sin delta': m.subida.bytesPorSegundo.binarioSinDelta ?? '-',
      'bin': m.subida.bytesPorSegundo.binario,
      'ahorro delta %': m.muestras.ahorroDelta ?? '-',
      'pantalla JSON': m.bajada.bytesPorSegundo.json,
      'pantalla MsgPack': m.bajada.bytesPorSegundo.msgpack,
      'pantalla deflate': m.bajada.bytesPorSegundo.deflateContexto,
      'RTT ms': m.rtt.media ?? '-',
    })),
  );
}

if (vista.problemas.length) {
  console.error(`\n${vista.problemas.length} problemas:`);
  for (const p of [...new Set(vista.problemas)].slice(0, 20)) console.error(`  ${p}`);
  process.exitCode = 1;
}

json(host.socket, { type: 'close_room' });
await esperar(200);
process.exit();
