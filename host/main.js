// Pantalla principal de PartyPad.
// Prototipo: muestra el QR del mando y un cuadrado por jugador que avanza cada vez que pulsa.
import { decode, encodeVibrate } from '/shared/protocol.js';

const COLORES = ['#e94560', '#f5a623', '#f8e71c', '#7ed321', '#50e3c2', '#4a90e2', '#bd10e0', '#ff7eb6'];
const PASOS = 10; // pulsaciones para llegar al final del carril

const estado = document.getElementById('estado');
const pista = document.getElementById('pista');
const jugadores = new Map(); // id → { carril, cuadrado, nombre, pasos }

let socket = null;

fetch('/api/conexion')
  .then((res) => res.json())
  .then(({ urlMando }) => {
    document.getElementById('url-mando').textContent = urlMando;
  });

function conectar() {
  const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocolo}//${location.host}/ws?rol=pantalla`);
  socket.binaryType = 'arraybuffer';

  socket.addEventListener('open', () => {
    estado.textContent = 'Conectada al servidor';
  });

  socket.addEventListener('message', ({ data }) => {
    if (typeof data === 'string') {
      const msg = JSON.parse(data);
      if (msg.type === 'players') msg.ids.forEach(añadirJugador);
      if (msg.type === 'player_joined') añadirJugador(msg.id);
      if (msg.type === 'player_left') quitarJugador(msg.id);
      return;
    }
    const msg = decode(data);
    if (msg?.type === 'join') renombrar(msg.player, msg.name, msg.color);
    if (msg?.type === 'button') boton(msg.player, msg.pressed);
  });

  socket.addEventListener('close', () => {
    estado.textContent = 'Sin conexión, reintentando…';
    for (const id of [...jugadores.keys()]) quitarJugador(id);
    setTimeout(conectar, 1000);
  });
}

function añadirJugador(id) {
  if (jugadores.has(id)) return;
  const carril = document.createElement('div');
  carril.className = 'carril';
  const cuadrado = document.createElement('div');
  cuadrado.className = 'jugador';
  cuadrado.textContent = id;
  const nombre = document.createElement('span');
  nombre.className = 'nombre';
  nombre.textContent = `Jugador ${id}`;
  carril.append(nombre, cuadrado);
  pista.append(carril);
  jugadores.set(id, { carril, cuadrado, nombre, pasos: 0 });
  pintar(id, (id - 1) % COLORES.length);
}

function quitarJugador(id) {
  jugadores.get(id)?.carril.remove();
  jugadores.delete(id);
}

function renombrar(id, nombre, color) {
  const j = jugadores.get(id);
  if (!j) return;
  j.nombre.textContent = nombre;
  pintar(id, color);
}

function pintar(id, color) {
  jugadores.get(id).cuadrado.style.background = COLORES[color % COLORES.length];
}

function boton(id, pressed) {
  const j = jugadores.get(id);
  if (!j) return;
  j.cuadrado.classList.toggle('pulsado', pressed);
  if (!pressed) return;

  j.pasos = (j.pasos + 1) % (PASOS + 1);
  // Del borde izquierdo (0) al derecho, descontando el ancho del cuadrado.
  j.cuadrado.style.left = `calc(0.25rem + (100% - 3.5rem) * ${j.pasos / PASOS})`;
  if (j.pasos === PASOS) socket.send(encodeVibrate(id, 200));
}

conectar();
