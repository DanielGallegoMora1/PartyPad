// Mando de PartyPad: se abre en el móvil al escanear el QR.
import { decode, encodeButton, encodeJoin } from '/shared/protocol.js';

const estado = document.getElementById('estado');
const boton = document.getElementById('boton');

let socket = null;
let myId = null;
let pulsado = false;

function conectar() {
  const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocolo}//${location.host}/ws?rol=mando`);
  socket.binaryType = 'arraybuffer';

  socket.addEventListener('message', ({ data }) => {
    if (typeof data === 'string') {
      const msg = JSON.parse(data);
      if (msg.type === 'joined') {
        myId = msg.id;
        estado.textContent = `Jugador ${myId}`;
        boton.disabled = false;
        // Todavía no hay pantalla para elegir nombre y color.
        socket.send(encodeJoin(myId - 1, `Jugador ${myId}`));
      }
      return;
    }
    const msg = decode(data);
    if (msg?.type === 'vibrate') vibrar(msg.ms);
  });

  socket.addEventListener('close', ({ code, reason }) => {
    myId = null;
    soltar();
    boton.disabled = true;
    if (code === 4001) {
      estado.textContent = reason;
      return;
    }
    estado.textContent = 'Reconectando…';
    setTimeout(conectar, 1000);
  });
}

function enviarBoton(pressed) {
  if (myId === null || socket.readyState !== WebSocket.OPEN) return;
  socket.send(encodeButton(myId, 0, pressed));
}

// iOS Safari no tiene navigator.vibrate: en su lugar la pantalla del móvil destella.
function vibrar(ms) {
  if (navigator.vibrate?.(ms)) return;
  document.body.classList.remove('vibra');
  void document.body.offsetWidth; // reinicia la animación
  document.body.classList.add('vibra');
}

function pulsar(e) {
  if (pulsado) return;
  pulsado = true;
  boton.setPointerCapture?.(e.pointerId);
  boton.classList.add('pulsado');
  enviarBoton(true);
}

function soltar() {
  if (!pulsado) return;
  pulsado = false;
  boton.classList.remove('pulsado');
  enviarBoton(false);
}

boton.addEventListener('pointerdown', pulsar);
boton.addEventListener('pointerup', soltar);
boton.addEventListener('pointercancel', soltar);
boton.addEventListener('contextmenu', (e) => e.preventDefault());

conectar();
