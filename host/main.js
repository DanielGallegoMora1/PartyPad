// Pantalla principal de PartyPad: inicio, lobby con el QR y los jugadores, y partida.
// La partida la lleva el servidor; aquí se muestran sus fases y el minijuego se dibuja con Phaser (juego.js).
import { COLORES } from '/shared/colores.js';
import * as juego from './juego.js';
import { sincronizar } from './packs.js';
import * as sonido from './sonido.js';

const MAX_JUGADORES = 8;
const MIN_JUGADORES = 2;
const CLAVE_SALA = 'partypad:sala'; // para recuperar la sala al recargar la página

const $ = (id) => document.getElementById(id);

let socket = null;
let codigo = null;
let jugadores = new Map(); // id → { id, name, color, connected }
let packsListos = []; // ids de los packs descargados y cargados
let minijuegos = []; // los de la próxima partida, según el servidor

// Almacenamiento: si el navegador no lo permite, simplemente no se recupera la sala al recargar.
const sesion = {
  leer() {
    try {
      return JSON.parse(sessionStorage.getItem(CLAVE_SALA));
    } catch {
      return null;
    }
  },
  guardar(valor) {
    try {
      sessionStorage.setItem(CLAVE_SALA, JSON.stringify(valor));
    } catch {}
  },
  borrar() {
    try {
      sessionStorage.removeItem(CLAVE_SALA);
    } catch {}
  },
};

function mostrar(vista) {
  document.body.dataset.vista = vista;
}

let timerToast;
function avisar(texto, ms = 3000) {
  const toast = $('toast');
  toast.textContent = texto;
  toast.classList.add('visible');
  clearTimeout(timerToast);
  if (ms) timerToast = setTimeout(() => toast.classList.remove('visible'), ms);
}

const enviar = (msg) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(msg));
const colorDe = (j) => COLORES[j.color]?.hex ?? COLORES[0].hex;
const inicial = (nombre) => [...nombre][0]?.toUpperCase() ?? '?';

// Conexión

function conectar() {
  const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocolo}//${location.host}/ws?rol=pantalla`);
  socket.binaryType = 'arraybuffer';

  socket.addEventListener('open', () => {
    $('toast').classList.remove('visible');
    const guardada = sesion.leer();
    if (guardada) enviar({ type: 'resume_room', code: guardada.code, token: guardada.token });
    else mostrar('inicio');
  });

  socket.addEventListener('message', ({ data }) => {
    if (typeof data === 'string') alRecibir(JSON.parse(data));
  });

  socket.addEventListener('close', ({ code }) => {
    if (code === 4003) {
      sesion.borrar();
      codigo = null;
      juego.desmontar();
      mostrar('inicio');
      avisar('La sala se ha abierto en otra pantalla', 5000);
      return;
    }
    avisar('Conexión perdida. Reconectando…', 0);
    setTimeout(conectar, 1000);
  });
}

function alRecibir(msg) {
  switch (msg.type) {
    case 'room_created':
      sesion.guardar({ code: msg.code, token: msg.token });
      entrarEnSala(msg.code, 'lobby', []);
      enviar({ type: 'packs_installed', ids: packsListos });
      break;
    case 'room_resumed':
      entrarEnSala(msg.code, msg.state, msg.players);
      enviar({ type: 'packs_installed', ids: packsListos });
      break;
    case 'minigames':
      minijuegos = msg.list;
      pintarMinijuegos();
      break;
    case 'packs_updated':
      actualizarPacks();
      break;
    case 'resume_error':
      sesion.borrar();
      mostrar('inicio');
      break;
    case 'player_joined':
      jugadores.set(msg.player.id, msg.player);
      pintarLobby();
      sonido.unirse();
      break;
    case 'player_status': {
      const j = jugadores.get(msg.id);
      if (!j) break;
      j.connected = msg.connected;
      pintarLobby();
      juego.conexion(j.id, j.connected);
      break;
    }
    case 'player_left':
      jugadores.delete(msg.id);
      pintarLobby();
      sonido.salir();
      juego.quitar(msg.id);
      $('otra-vez').disabled = jugadores.size < MIN_JUGADORES;
      break;
    case 'game_start':
      empezarPartida();
      break;
    case 'round_intro':
      alIntro(msg);
      break;
    case 'countdown':
      alCuenta(msg);
      break;
    case 'round_start':
      alEmpezarRonda(msg);
      break;
    case 'state_update':
      ponerFin(msg.ms);
      juego.actualizar(msg);
      break;
    case 'round_end':
      alResultados(msg);
      break;
    case 'podium':
      alPodio(msg);
      break;
    case 'back_to_lobby':
      juego.desmontar();
      mostrar('lobby');
      break;
    case 'room_closed':
      sesion.borrar();
      codigo = null;
      juego.desmontar();
      mostrar('inicio');
      break;
  }
}

// Packs descargables

const nuevos = new Set(); // packs descargados en esta visita, para marcarlos en el lobby

async function actualizarPacks() {
  try {
    const listos = await sincronizar((id, estado, p) => {
      if (estado === 'descargando') avisar(`📦 Descargando ${p.name}…`, 0);
      else if (estado === 'nuevo') avisar(`📦 ¡Nuevo minijuego descargado: ${p.name}!`, 6000);
      else if (estado === 'actualizado') avisar(`📦 ${p.name} actualizado a la versión ${p.version}`, 6000);
      else if (estado === 'error') avisar(`No se ha podido descargar ${p.name}`, 6000);
      if (estado === 'nuevo' || estado === 'actualizado') nuevos.add(id);
    });
    for (const p of listos) await juego.registrar(p.id, p.Escena);
    packsListos = listos.map((p) => p.id);
  } catch (err) {
    console.warn('No se han podido sincronizar los packs:', err);
  }
  enviar({ type: 'packs_installed', ids: packsListos });
}

function pintarMinijuegos() {
  $('minijuegos').replaceChildren(
    ...minijuegos.map((m) => {
      const li = document.createElement('li');
      li.className = 'chip';
      li.textContent = `${ICONOS[m.control] ?? '🎮'} ${m.name}`;
      if (packsListos.includes(m.id)) {
        const marca = Object.assign(document.createElement('span'), { className: 'marca', textContent: nuevos.has(m.id) ? 'Nuevo' : 'Pack' });
        li.append(marca);
        li.classList.toggle('nuevo', nuevos.has(m.id));
      }
      return li;
    }),
  );
}

// Sala y lobby

function entrarEnSala(code, state, players) {
  codigo = code;
  jugadores = new Map(players.map((p) => [p.id, p]));

  $('codigo').replaceChildren(
    ...[...code].map((letra) => Object.assign(document.createElement('span'), { textContent: letra })),
  );
  $('codigo-partida').textContent = code;
  $('qr').src = `/qr.svg?sala=${code}`;
  fetch(`/api/conexion?sala=${code}`)
    .then((res) => res.json())
    .then(({ urlCorta }) => ($('url-corta').textContent = urlCorta))
    .catch(() => {});

  pintarLobby();
  // A mitad de partida, el servidor manda justo después la fase en la que está.
  if (state === 'jugando') empezarPartida();
  else mostrar('lobby');
}

function pintarLobby() {
  const lista = $('lista');
  const yaPintados = new Set([...lista.querySelectorAll('.jugador')].map((li) => Number(li.dataset.id)));
  const ordenados = [...jugadores.values()].sort((a, b) => a.id - b.id);

  const elementos = ordenados.map((j) => {
    const li = document.createElement('li');
    li.className = 'jugador';
    li.dataset.id = j.id;
    // Solo se anima la entrada de los jugadores nuevos.
    if (yaPintados.has(j.id)) li.style.animation = 'none';
    li.classList.toggle('desconectado', !j.connected);

    const avatar = document.createElement('span');
    avatar.className = 'avatar';
    avatar.style.setProperty('--color', colorDe(j));
    avatar.textContent = inicial(j.name);

    const nombre = document.createElement('span');
    nombre.className = 'nombre';
    nombre.textContent = j.name;

    const estado = document.createElement('span');
    estado.className = 'estado-jugador';
    estado.textContent = j.connected ? COLORES[j.color]?.nombre ?? '' : 'Reconectando…';

    const expulsar = document.createElement('button');
    expulsar.className = 'expulsar';
    expulsar.type = 'button';
    expulsar.textContent = '×';
    expulsar.title = `Expulsar a ${j.name}`;
    expulsar.setAttribute('aria-label', `Expulsar a ${j.name}`);
    expulsar.addEventListener('click', () => enviar({ type: 'kick', id: j.id }));

    li.append(expulsar, avatar, nombre, estado);
    return li;
  });

  for (let i = ordenados.length; i < MAX_JUGADORES; i++) {
    const li = document.createElement('li');
    li.className = 'hueco';
    li.innerHTML = '<span class="avatar">?</span><span>Libre</span>';
    elementos.push(li);
  }
  lista.replaceChildren(...elementos);

  const total = jugadores.size;
  $('contador').textContent = `${total} / ${MAX_JUGADORES}`;
  $('empezar').disabled = total < MIN_JUGADORES;
  const faltan = MIN_JUGADORES - total;
  $('pista-empezar').textContent =
    faltan > 0 ? `Falta${faltan > 1 ? 'n' : ''} ${faltan} jugador${faltan > 1 ? 'es' : ''} para empezar` : '¡Todo listo!';
}

// Partida

const ICONOS = { agitar: '📳', inclinar: '🎯', tocar: '👆', apuntar: '🏹' };
let fin = 0; // performance.now() en que acaba la fase actual, para los relojes
let ultimaCuenta = null;

const escenario = $('escenario');
const fase = (nombre) => (escenario.dataset.fase = nombre);
const jugadoresJuego = () => [...jugadores.values()].map((j) => ({ id: j.id, name: j.name, hex: colorDe(j), connected: j.connected }));

// Vuelve a lanzar la animación CSS de un elemento.
function reanimar(el) {
  el.classList.remove('anima');
  void el.offsetWidth;
  el.classList.add('anima');
}

function ponerFin(ms) {
  fin = performance.now() + ms;
  pintarRelojes();
}

function pintarRelojes() {
  const s = Math.max(0, Math.ceil((fin - performance.now()) / 1000));
  for (const el of document.querySelectorAll('[data-reloj]')) el.textContent = s;
  escenario.classList.toggle('apurado', s <= 5);
  if (escenario.dataset.fase === 'cuenta' && s > 0 && s !== ultimaCuenta) {
    ultimaCuenta = s;
    $('cuenta').textContent = s;
    reanimar($('cuenta'));
    sonido.cuenta();
  }
}
setInterval(pintarRelojes, 100);

function empezarPartida() {
  fase('');
  $('ronda').textContent = '';
  mostrar('partida');
}

// Común a todas las fases de una ronda: monta su minijuego (si no lo estaba ya) y pone el reloj.
function enRonda(msg) {
  $('ronda').textContent = `Ronda ${msg.round} de ${msg.rounds}`;
  juego.montar(msg.minigame.id, msg.round, jugadoresJuego(), msg);
  juego.actualizar(msg);
  ponerFin(msg.ms);
}

function alIntro(msg) {
  enRonda(msg);
  $('intro-ronda').textContent = `Ronda ${msg.round} de ${msg.rounds}`;
  $('intro-icono').textContent = ICONOS[msg.minigame.control] ?? '🎮';
  $('intro-nombre').textContent = msg.minigame.name;
  $('intro-texto').textContent = msg.minigame.instructions;
  $('intro-tiempo').style.animationDuration = `${msg.ms}ms`;
  reanimar($('intro-tiempo'));
  fase('intro');
}

function alCuenta(msg) {
  ultimaCuenta = null;
  fase('cuenta');
  enRonda(msg);
}

function alEmpezarRonda(msg) {
  enRonda(msg);
  if (escenario.dataset.fase === 'cuenta') sonido.ya(); // no al recargar a mitad de ronda
  fase('jugando');
  reanimar(escenario.querySelector('.ya'));
}

function avatar(j) {
  const el = document.createElement('span');
  el.className = 'avatar';
  el.style.setProperty('--color', colorDe(j));
  el.textContent = inicial(j.name);
  return el;
}

// Una fila de la clasificación. puntos es lo ganado en la ronda; en el podio no se muestra.
function fila({ id, place, total }, puntos, i) {
  const j = jugadores.get(id);
  const li = document.createElement('li');
  li.style.animationDelay = `${i * 90}ms`;
  const puesto = Object.assign(document.createElement('span'), { className: 'puesto', textContent: `${place}º` });
  const nombre = Object.assign(document.createElement('span'), { className: 'nombre', textContent: j?.name ?? '' });
  li.append(puesto, avatar(j ?? { name: '?', color: 0 }), nombre);
  if (puntos !== undefined) li.append(Object.assign(document.createElement('span'), { className: 'ganados', textContent: `+${puntos}` }));
  li.append(Object.assign(document.createElement('span'), { className: 'total', textContent: `${total} pts` }));
  return li;
}

function alResultados(msg) {
  enRonda(msg);
  $('resultados-ronda').textContent = `${msg.minigame.name} · Ronda ${msg.round} de ${msg.rounds}`;
  $('resultados-siguiente').textContent = msg.last ? 'El podio, en' : 'Siguiente ronda en';
  const puntos = new Map(msg.results.map((r) => [r.id, r.points]));
  if (escenario.dataset.fase !== 'resultados') sonido.resultados();
  $('resultados-lista').replaceChildren(...msg.ranking.filter((c) => jugadores.has(c.id)).map((c, i) => fila(c, puntos.get(c.id) ?? 0, i)));
  fase('resultados');
}

function alPodio(msg) {
  ponerFin(0);
  juego.desmontar();
  $('ronda').textContent = '';
  const ranking = msg.ranking.filter((c) => jugadores.has(c.id));
  const primeros = ranking.slice(0, 3);
  // De izquierda a derecha: segundo, primero y tercero.
  const escalones = [primeros[1], primeros[0], primeros[2]].filter(Boolean).map((c) => {
    const j = jugadores.get(c.id);
    const el = document.createElement('div');
    el.className = 'escalon';
    el.dataset.puesto = Math.min(c.place, 3);
    const nombre = Object.assign(document.createElement('span'), { className: 'nombre', textContent: j.name });
    const total = Object.assign(document.createElement('span'), { className: 'total', textContent: `${c.total} pts` });
    const bloque = Object.assign(document.createElement('span'), { className: 'bloque', textContent: `${c.place}º` });
    el.append(avatar(j), nombre, total, bloque);
    return el;
  });
  $('podio').replaceChildren(...escalones);
  $('podio-resto').replaceChildren(...ranking.slice(3).map((c, i) => fila(c, undefined, i)));
  $('otra-vez').disabled = jugadores.size < MIN_JUGADORES;
  if (escenario.dataset.fase !== 'podio') sonido.fanfarria();
  fase('podio');
}

// Botones

// El navegador solo deja sonar algo después de un toque en la página.
document.addEventListener('pointerdown', sonido.desbloquear);
const botonSonido = $('sonido');
function pintarSonido() {
  botonSonido.textContent = sonido.silenciado() ? '🔇' : '🔊';
  botonSonido.setAttribute('aria-label', sonido.silenciado() ? 'Activar el sonido' : 'Silenciar');
  botonSonido.title = botonSonido.getAttribute('aria-label');
}
botonSonido.addEventListener('click', () => {
  sonido.silenciar(!sonido.silenciado());
  pintarSonido();
});
pintarSonido();

$('crear').addEventListener('click', () => enviar({ type: 'create_room' }));
$('empezar').addEventListener('click', () => enviar({ type: 'start_game' }));
$('volver').addEventListener('click', () => enviar({ type: 'back_to_lobby' }));
$('otra-vez').addEventListener('click', () => enviar({ type: 'start_game' }));
const dialogoCerrar = $('dialogo-cerrar');

$('cerrar').addEventListener('click', () => {
  const total = jugadores.size;
  $('dialogo-cerrar-texto').textContent =
    total === 0
      ? 'Se perderá el código de esta sala.'
      : `${total === 1 ? 'El jugador saldrá' : `Los ${total} jugadores saldrán`} de la sala y tendrán que unirse a una nueva.`;
  dialogoCerrar.returnValue = '';
  dialogoCerrar.showModal();
});

// Pulsar fuera del diálogo equivale a cancelar. El fondo cuenta como el propio <dialog>,
// así que se mira si el clic cae fuera de su recuadro.
dialogoCerrar.addEventListener('click', (e) => {
  if (e.target !== dialogoCerrar) return;
  const r = dialogoCerrar.getBoundingClientRect();
  const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  if (!dentro) dialogoCerrar.close('cancelar');
});

dialogoCerrar.addEventListener('close', () => {
  if (dialogoCerrar.returnValue === 'cerrar') enviar({ type: 'close_room' });
});

conectar();
actualizarPacks();
