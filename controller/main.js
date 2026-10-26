// Mando de PartyPad: se abre en el móvil al escanear el QR.
// Flujo: código de sala → nombre y color → espera en el lobby → partida.
// En la partida, cada ronda: instrucciones → cuenta atrás → control del minijuego → resultados. Al final, podio.
import { decode, encodeButton, encodeShake, encodeTilt } from '/shared/protocol.js';
import { COLORES } from '/shared/colores.js';
import { estadoPermiso, medirAgitado, medirInclinacion, necesitaPermiso, pedirPermiso } from './sensores.js';

const CLAVE_SESION = 'partypad:sesion'; // { code, token } para reconectarse a la misma sala
const CLAVE_NOMBRE = 'partypad:nombre'; // para no tener que escribirlo cada vez

const $ = (id) => document.getElementById(id);

let socket = null;
let yo = null; // { id, name, color } cuando ya está dentro de una sala
let salaPendiente = normalizar(new URLSearchParams(location.search).get('sala'));
let ocupados = new Set();
let colorElegido = null;
let pulsado = false;
let medicion = null; // medición del sensor mientras se juega un minijuego de agitar o inclinar

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
      // A mitad de partida, el servidor manda justo después la fase en la que está.
      mostrar('espera');
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
      mantenerPantalla();
      break;

    case 'round_intro':
      alIntro(msg);
      break;

    case 'countdown':
      pararMedicion();
      ponerFin(msg.ms);
      mostrar('cuenta');
      pintarCuenta();
      break;

    case 'round_start':
      empezarControl(msg.minigame.control);
      break;

    case 'finished':
      alLlegar(msg.place);
      break;

    case 'reflex_wait':
      alEsperarSenal(msg);
      break;

    case 'reaction':
      alReaccionar(msg);
      break;

    case 'round_end':
      alResultados(msg);
      break;

    case 'podium':
      alPodio(msg);
      break;

    case 'back_to_lobby':
      pararMedicion();
      soltarPantalla();
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
  pararMedicion();
  soltarPantalla();
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
  // El envío del formulario es un toque: buen momento para que iOS pida el permiso de movimiento.
  pedirPermiso();
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

const ICONOS = { agitar: '📳', inclinar: '🎯', tocar: '👆' };
const MEDALLAS = ['🥇', '🥈', '🥉'];
let fin = 0; // performance.now() en que acaba la fase actual
let ultimaCuenta = null;

function ponerFin(ms) {
  fin = performance.now() + ms;
  ultimaCuenta = null;
}

function pintarCuenta() {
  if (document.body.dataset.vista !== 'cuenta') return;
  const s = Math.max(1, Math.ceil((fin - performance.now()) / 1000));
  if (s === ultimaCuenta) return;
  ultimaCuenta = s;
  const cuenta = $('cuenta');
  cuenta.textContent = s;
  cuenta.classList.remove('anima');
  void cuenta.offsetWidth; // reinicia la animación
  cuenta.classList.add('anima');
}
setInterval(pintarCuenta, 100);

// Que no se apague la pantalla mientras se juega, aunque nadie la toque al agitar.
let bloqueo = null;
async function mantenerPantalla() {
  if (bloqueo && !bloqueo.released) return;
  try {
    bloqueo = await navigator.wakeLock?.request('screen');
  } catch {}
}

function soltarPantalla() {
  bloqueo?.release().catch(() => {});
  bloqueo = null;
}

// El bloqueo se pierde al cambiar de app; se recupera al volver si sigue la partida.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && bloqueo) {
    bloqueo = null;
    mantenerPantalla();
  }
});

function alIntro(msg) {
  pararMedicion();
  mantenerPantalla();
  const { minigame } = msg;
  $('instr-ronda').textContent = `Ronda ${msg.round} de ${msg.rounds}`;
  $('instr-icono').textContent = ICONOS[minigame.control] ?? '🎮';
  $('instr-nombre').textContent = minigame.name;
  $('instr-texto').textContent = minigame.instructions;
  pintarPermiso(minigame.control);
  mostrar('instrucciones');
}

// Qué hacer sin sensor de movimiento en cada control.
const SIN_SENSOR = {
  agitar: 'Sin sensor de movimiento: toca la pantalla muy rápido para avanzar.',
  inclinar: 'Sin sensor de movimiento: arrastra el dedo por el círculo para mover tu bola.',
};
let controlActual = null;

// En iOS, si aún no se ha dado permiso de movimiento, se ofrece el botón para darlo.
function pintarPermiso(control) {
  controlActual = control;
  const usaMovimiento = control in SIN_SENSOR;
  const permiso = estadoPermiso();
  $('activar-movimiento').hidden = !usaMovimiento || !necesitaPermiso || permiso !== 'pendiente';
  $('sin-movimiento').hidden = !usaMovimiento || permiso !== 'denegado';
  $('sin-movimiento').textContent = SIN_SENSOR[control] ?? '';
}

$('activar-movimiento').addEventListener('click', async () => {
  await pedirPermiso();
  pintarPermiso(controlActual);
});

const enviarBinario = (datos) => yo && socket.readyState === WebSocket.OPEN && socket.send(datos);

function empezarControl(control) {
  pararMedicion();
  if (control === 'agitar') empezarAgitar();
  else if (control === 'inclinar') empezarInclinar();
  else empezarToque();
}

// Tocar: un botón grande. En Reflejos, el servidor avisa de cada señal y responde con el tiempo de cada pulsación.
function empezarToque() {
  $('toque-senal').textContent = '';
  pintarToque('', '');
  mostrar('partida');
}

function pintarToque(texto, clase) {
  const estado = $('toque-estado');
  estado.textContent = texto;
  estado.className = `toque-estado ${clase}`;
  boton.classList.toggle('usado', clase !== '');
}

function alEsperarSenal(msg) {
  $('toque-senal').textContent = `Señal ${msg.signal} de ${msg.signals}`;
  pintarToque('Mira la pantalla grande y pulsa cuando se ponga verde', '');
}

function alReaccionar(msg) {
  if (msg.early) pintarToque(`¡Demasiado pronto! +${msg.ms / 1000} s`, 'mal');
  else if (msg.missed) pintarToque('¡Se te ha pasado!', 'mal');
  else pintarToque(`⚡ ${msg.ms} ms`, 'bien');
}

function empezarAgitar() {
  medicion = medirAgitado({
    alCambiar(nivel) {
      $('medidor').style.transform = `scale(${0.25 + nivel * 0.75})`;
      $('agitar-pista').textContent = medicion?.hayAcelerometro() ? 'Más fuerte, más rápido' : 'Toca la pantalla muy rápido';
    },
    alEnviar(nivel) {
      enviarBinario(encodeShake(yo.id, nivel));
    },
  });
  mostrar('agitar');
}

function empezarInclinar() {
  const nivel = $('nivel');
  medicion = medirInclinacion({
    alCambiar(x, y) {
      // La bola del nivel va hacia donde rodará la bola de la pantalla.
      $('burbuja').style.left = `${50 + x * 35}%`;
      $('burbuja').style.top = `${50 + y * 35}%`;
      $('inclinar-pista').textContent = medicion?.hayGiroscopio()
        ? 'Si la bola se mueve sola, pulsa Recalibrar con el móvil en reposo'
        : 'Arrastra el dedo por el círculo';
    },
    alEnviar(x, y) {
      enviarBinario(encodeTilt(yo.id, x, y));
    },
  });
  nivel.onpointerdown = nivel.onpointermove = (e) => {
    if (e.type === 'pointermove' && !e.buttons && e.pointerType === 'mouse') return;
    nivel.setPointerCapture?.(e.pointerId);
    const r = nivel.getBoundingClientRect();
    medicion?.arrastrar(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
  };
  nivel.onpointerup = nivel.onpointercancel = () => medicion?.arrastrar(0, 0);
  mostrar('inclinar');
}

$('recalibrar').addEventListener('click', () => medicion?.recalibrar());

function pararMedicion() {
  medicion?.parar();
  medicion = null;
}

$('zona-agitar').addEventListener('pointerdown', () => medicion?.tocar());

function alLlegar(puesto) {
  pararMedicion();
  $('meta-puesto').textContent = `${puesto}º`;
  mostrar('meta');
}

function alResultados(msg) {
  pararMedicion();
  $('res-ronda').textContent = `Ronda ${msg.round} de ${msg.rounds}`;
  $('res-puesto').textContent = msg.place ? `${msg.place}º` : '–';
  $('res-puntos').textContent = `+${msg.points} puntos`;
  $('res-total').textContent = `Llevas ${msg.total} puntos · vas ${msg.overall}º`;
  mostrar('resultados');
}

function alPodio(msg) {
  pararMedicion();
  $('podio-medalla').textContent = MEDALLAS[msg.place - 1] ?? '🎉';
  $('podio-titulo').textContent = msg.place === 1 ? '¡Has ganado!' : `Has quedado ${msg.place}º`;
  $('podio-total').textContent = `${msg.total} puntos`;
  mostrar('podio');
}

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
