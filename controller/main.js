// Mando de PartyPad: se abre en el móvil al escanear el QR.
// Flujo: código de sala → nombre y color → espera en el lobby → partida.
import { decode, encodeButton } from '/shared/protocol.js';
import { COLORES } from '/shared/colores.js';

const CLAVE_SESION = 'partypad:sesion'; // { code, token } para reconectarse a la misma sala
const CLAVE_NOMBRE = 'partypad:nombre'; // para no tener que escribirlo cada vez

const $ = (id) => document.getElementById(id);

let socket = null;
let yo = null; // { id, name, color } cuando ya está dentro de una sala
let salaPendiente = normalizar(new URLSearchParams(location.search).get('sala'));
let ocupados = new Set();
let colorElegido = null;
let pulsado = false;

// Almacenamiento: si el navegador no lo permite, solo se pierde la reconexión automática.
const guardado = {
  leer(clave) {
    try {
      return JSON.parse(localStorage.getItem(clave));
    } catch {
      return null;
    }
  },
  guardar(clave, valor) {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch {}
  },
  borrar(clave) {
    try {
      localStorage.removeItem(clave);
    } catch {}
  },
};

function normalizar(code) {
  const limpio = String(code ?? '').toUpperCase().replace(/[^A-Z]/g, '');
  return limpio.length === 4 ? limpio : null;
}

const enviar = (msg) => socket?.readyState === WebSocket.OPEN && socket.send(JSON.stringify(msg));
const inicial = (nombre) => [...nombre.trim()][0]?.toUpperCase() ?? '?';

function mostrar(vista) {
  document.body.dataset.vista = vista;
}

function ponerColor(indice) {
  document.documentElement.style.setProperty('--jugador', COLORES[indice]?.hex ?? '');
}

// La URL refleja la sala, para que al recargar se vuelva a ella.
function urlSala(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('sala', code);
  else url.searchParams.delete('sala');
  history.replaceState(null, '', url);
}

// Conexión

function conectar() {
  const protocolo = location.protocol === 'https:' ? 'wss:' : 'ws:';
  socket = new WebSocket(`${protocolo}//${location.host}/ws?rol=mando`);
  socket.binaryType = 'arraybuffer';

  socket.addEventListener('open', () => {
    $('reconectando').hidden = true;
    const sesion = guardado.leer(CLAVE_SESION);
    if (sesion && (!salaPendiente || salaPendiente === sesion.code)) {
      enviar({ type: 'rejoin', code: sesion.code, token: sesion.token });
    } else if (salaPendiente) {
      pedirInfo(salaPendiente);
    } else {
      mostrar('codigo');
    }
  });

  socket.addEventListener('message', ({ data }) => {
    if (typeof data === 'string') return alRecibir(JSON.parse(data));
    const msg = decode(data);
    if (msg?.type === 'vibrate') vibrar(msg.ms);
  });

  socket.addEventListener('close', ({ code }) => {
    soltar();
    if (code === 4004) {
      yo = null;
      mensaje('📱', 'Has entrado desde otro sitio', 'Has abierto esta sala en otra pestaña o dispositivo.', 'Usar este móvil', conectar);
      return;
    }
    if (yo) $('reconectando').hidden = false;
    setTimeout(conectar, 1000);
  });
}

function alRecibir(msg) {
  switch (msg.type) {
    case 'room_info':
      if (!msg.exists) return errorCodigo('No hay ninguna sala con ese código', msg.code);
      if (msg.state !== 'lobby') return errorCodigo('La partida de esta sala ya ha empezado', msg.code);
      if (msg.full) return errorCodigo('La sala está llena', msg.code);
      ocupados = new Set(msg.takenColors);
      if (document.body.dataset.vista === 'perfil') pintarPaleta();
      else abrirPerfil(msg.code);
      break;

    case 'joined':
      yo = msg.player;
      salaPendiente = msg.code;
      guardado.guardar(CLAVE_SESION, { code: msg.code, token: msg.token });
      urlSala(msg.code);
      ponerColor(yo.color);
      $('espera-avatar').textContent = inicial(yo.name);
      $('espera-nombre').textContent = yo.name;
      $('espera-sala').textContent = msg.code;
      $('partida-avatar').textContent = inicial(yo.name);
      $('partida-nombre').textContent = yo.name;
      $('aviso-pantalla').hidden = msg.hostConnected;
      mostrar(msg.state === 'jugando' ? 'partida' : 'espera');
      break;

    case 'join_error':
      $('unirme').disabled = false;
      if (msg.reason === 'color_taken') {
        $('error-perfil').textContent = 'Alguien acaba de coger ese color. Elige otro.';
        pedirInfo(salaPendiente);
      } else if (msg.reason === 'invalid_name') {
        $('error-perfil').textContent = 'Escribe un nombre';
      } else {
        const textos = { not_found: 'La sala ya no existe', started: 'La partida ya ha empezado', full: 'La sala está llena' };
        errorCodigo(textos[msg.reason] ?? 'No se ha podido entrar', salaPendiente);
      }
      break;

    case 'rejoin_error':
      // La sesión guardada ya no vale: se entra como jugador nuevo.
      guardado.borrar(CLAVE_SESION);
      yo = null;
      if (salaPendiente) pedirInfo(salaPendiente);
      else mostrar('codigo');
      break;

    case 'game_start':
      if (yo) mostrar('partida');
      break;

    case 'back_to_lobby':
      if (yo) mostrar('espera');
      break;

    case 'host_status':
      $('aviso-pantalla').hidden = msg.connected;
      break;

    case 'kicked': {
      const code = salaPendiente;
      salirDeLaSala(false);
      mensaje('🚫', 'Te han expulsado', 'El anfitrión te ha sacado de la sala.', 'Volver a entrar', () => pedirInfo(code));
      break;
    }

    case 'room_closed':
      if (!yo && document.body.dataset.vista !== 'perfil') break;
      salirDeLaSala(true);
      mensaje('👋', 'La sala se ha cerrado', '¡Gracias por jugar!', 'Unirme a otra sala', () => mostrar('codigo'));
      break;
  }
}

function salirDeLaSala(olvidarSala) {
  guardado.borrar(CLAVE_SESION);
  yo = null;
  ponerColor(colorElegido);
  $('aviso-pantalla').hidden = true;
  if (olvidarSala) {
    salaPendiente = null;
    urlSala(null);
  }
}

function pedirInfo(code) {
  salaPendiente = code;
  enviar({ type: 'room_info', code });
}

function mensaje(icono, titulo, texto, accion, alPulsar) {
  $('mensaje-icono').textContent = icono;
  $('mensaje-titulo').textContent = titulo;
  $('mensaje-texto').textContent = texto;
  $('mensaje-boton').textContent = accion;
  $('mensaje-boton').onclick = alPulsar;
  mostrar('mensaje');
}

// Código de sala

function errorCodigo(texto, code) {
  salaPendiente = null;
  urlSala(null);
  $('campo-codigo').value = code ?? '';
  $('error-codigo').textContent = texto;
  mostrar('codigo');
}

$('campo-codigo').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  $('error-codigo').textContent = '';
});

$('form-codigo').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = normalizar($('campo-codigo').value);
  if (!code) {
    $('error-codigo').textContent = 'El código tiene 4 letras';
    return;
  }
  pedirInfo(code);
});

// Nombre y color

function crearPaleta() {
  const etiquetas = COLORES.map(({ nombre, hex }, i) => {
    const label = document.createElement('label');
    label.style.setProperty('--color', hex);
    label.title = nombre;
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'color';
    input.value = i;
    input.setAttribute('aria-label', nombre);
    input.addEventListener('change', () => elegirColor(i));
    label.append(input);
    return label;
  });
  $('colores').replaceChildren(...etiquetas);
}

function pintarPaleta() {
  const inputs = $('colores').querySelectorAll('input');
  inputs.forEach((input, i) => (input.disabled = ocupados.has(i)));
  if (colorElegido === null || ocupados.has(colorElegido)) {
    const libre = COLORES.findIndex((_, i) => !ocupados.has(i));
    elegirColor(libre === -1 ? null : libre);
  }
  if (colorElegido !== null) inputs[colorElegido].checked = true;
}

function elegirColor(i) {
  colorElegido = i;
  ponerColor(i);
  $('error-perfil').textContent = '';
}

function abrirPerfil(code) {
  $('perfil-sala').textContent = code;
  $('error-perfil').textContent = '';
  $('unirme').disabled = false;
  if (!$('campo-nombre').value) $('campo-nombre').value = guardado.leer(CLAVE_NOMBRE) ?? '';
  $('vista-previa').textContent = inicial($('campo-nombre').value);
  urlSala(code);
  pintarPaleta();
  mostrar('perfil');
}

$('campo-nombre').addEventListener('input', (e) => {
  $('vista-previa').textContent = inicial(e.target.value);
  $('error-perfil').textContent = '';
});

$('form-perfil').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('campo-nombre').value.trim();
  if (!name) {
    $('error-perfil').textContent = 'Escribe un nombre';
    return;
  }
  if (colorElegido === null) {
    $('error-perfil').textContent = 'Elige un color';
    return;
  }
  guardado.guardar(CLAVE_NOMBRE, name);
  $('unirme').disabled = true;
  enviar({ type: 'join_room', code: salaPendiente, name, color: colorElegido });
});

// Espera

$('salir').addEventListener('click', () => {
  enviar({ type: 'leave_room' });
  salirDeLaSala(true);
  $('campo-codigo').value = '';
  mostrar('codigo');
});

// Partida

const boton = $('boton');

function enviarBoton(pressed) {
  if (!yo || socket.readyState !== WebSocket.OPEN) return;
  socket.send(encodeButton(yo.id, 0, pressed));
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

crearPaleta();
conectar();
