// Pantalla principal de PartyPad: inicio, lobby con el QR y los jugadores, y partida.
// La partida todavía es el prototipo: cada jugador avanza por su carril al pulsar el botón.
import { decode, encodeVibrate } from '/shared/protocol.js';
import { COLORES } from '/shared/colores.js';

const MAX_JUGADORES = 8;
const MIN_JUGADORES = 2;
const PASOS = 10; // pulsaciones para llegar a la meta
const CLAVE_SALA = 'partypad:sala'; // para recuperar la sala al recargar la página

const $ = (id) => document.getElementById(id);

let socket = null;
let codigo = null;
let jugadores = new Map(); // id → { id, name, color, connected, pasos, ficha }

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
    if (typeof data === 'string') return alRecibir(JSON.parse(data));
    const msg = decode(data);
    if (msg?.type === 'button') alPulsar(msg.player, msg.pressed);
  });

  socket.addEventListener('close', ({ code }) => {
    if (code === 4003) {
      sesion.borrar();
      codigo = null;
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
      break;
    case 'room_resumed':
      entrarEnSala(msg.code, msg.state, msg.players);
      break;
    case 'resume_error':
      sesion.borrar();
      mostrar('inicio');
      break;
    case 'player_joined':
      jugadores.set(msg.player.id, { ...msg.player, pasos: 0 });
      pintarLobby();
      break;
    case 'player_status': {
      const j = jugadores.get(msg.id);
      if (!j) break;
      j.connected = msg.connected;
      pintarLobby();
      j.ficha?.closest('.carril').classList.toggle('desconectado', !j.connected);
      break;
    }
    case 'player_left':
      jugadores.delete(msg.id);
      pintarLobby();
      pintarCarriles();
      break;
    case 'game_start':
      empezarPartida();
      break;
    case 'back_to_lobby':
      mostrar('lobby');
      break;
    case 'room_closed':
      sesion.borrar();
      codigo = null;
      mostrar('inicio');
      break;
  }
}

// Sala y lobby

function entrarEnSala(code, state, players) {
  codigo = code;
  jugadores = new Map(players.map((p) => [p.id, { ...p, pasos: 0 }]));

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

function empezarPartida() {
  for (const j of jugadores.values()) j.pasos = 0;
  pintarCarriles();
  mostrar('partida');
}

function pintarCarriles() {
  const carriles = [...jugadores.values()]
    .sort((a, b) => a.id - b.id)
    .map((j) => {
      const carril = document.createElement('div');
      carril.className = 'carril';
      carril.classList.toggle('desconectado', !j.connected);

      const ficha = document.createElement('span');
      ficha.className = 'avatar';
      ficha.style.setProperty('--color', colorDe(j));
      ficha.textContent = inicial(j.name);

      const nombre = document.createElement('span');
      nombre.className = 'nombre';
      nombre.textContent = j.name;

      carril.append(nombre, ficha);
      j.ficha = ficha;
      colocar(j);
      return carril;
    });
  $('carriles').replaceChildren(...carriles);
}

function colocar(j) {
  // De la salida a la meta, descontando el ancho de la ficha y los márgenes.
  j.ficha.style.left = `calc(0.5rem + (100% - 5.5rem) * ${j.pasos / PASOS})`;
}

function alPulsar(id, pressed) {
  const j = jugadores.get(id);
  if (!j?.ficha || document.body.dataset.vista !== 'partida') return;
  j.ficha.classList.toggle('pulsado', pressed);
  if (!pressed) return;

  j.pasos = (j.pasos + 1) % (PASOS + 1);
  colocar(j);
  if (j.pasos === PASOS) socket.send(encodeVibrate(id, 200));
}

// Botones

$('crear').addEventListener('click', () => enviar({ type: 'create_room' }));
$('empezar').addEventListener('click', () => enviar({ type: 'start_game' }));
$('volver').addEventListener('click', () => enviar({ type: 'back_to_lobby' }));
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
