// Sensores del móvil para los minijuegos: cuánto agita (acelerómetro, DeviceMotion) y cuánto lo inclina
// (DeviceOrientation). Solo funcionan con HTTPS, y en iOS hay que pedir permiso desde un toque del usuario.
// Sin sensor (un PC, o el móvil por HTTP) hay alternativas táctiles: tocar rápido para agitar y arrastrar
// el dedo para inclinar.

const FUERZA_MAX = 25; // m/s² de aceleración que cuentan como agitar al máximo
const REPOSO = 2; // por debajo, ruido del sensor con el móvil quieto
const CAIDA = 1.5; // cuánto baja la intensidad por segundo al dejar de agitar
const POR_TOQUE = 0.22; // lo que sube cada toque sin sensor
const ENVIO = 50; // ms entre envíos como mucho
const UMBRAL = 0.04; // compresión delta: solo se envía si cambia al menos esto
const SIN_SENSOR = 1500; // ms sin lecturas para dar el sensor por perdido

const GRADOS_MAX = 25; // inclinación que cuenta como inclinar al máximo
const ENVIO_INCLINACION = 33; // unos 30 por segundo como mucho
const UMBRAL_INCLINACION = 2; // compresión delta, en unidades cuantizadas a int8 (de -127 a 127)

const cuantizar = (v) => Math.round(v * 127);
const limitar = (v) => Math.max(-1, Math.min(1, v));

// iOS pide un permiso para cada sensor.
const conPermiso = [globalThis.DeviceMotionEvent, globalThis.DeviceOrientationEvent].filter(
  (E) => typeof E?.requestPermission === 'function',
);
export const necesitaPermiso = conPermiso.length > 0;
let permiso = necesitaPermiso ? 'pendiente' : 'concedido'; // pendiente | concedido | denegado

export const estadoPermiso = () => permiso;

// Hay que llamarla desde un toque (submit, click): si no, iOS la rechaza sin preguntar.
// Las dos peticiones salen a la vez, dentro del mismo toque.
export async function pedirPermiso() {
  if (permiso !== 'pendiente') return permiso;
  try {
    const respuestas = await Promise.all(conPermiso.map((E) => E.requestPermission()));
    permiso = respuestas.every((r) => r === 'granted') ? 'concedido' : 'denegado';
  } catch {
    // Llamada fuera de un toque: se podrá volver a pedir con el botón de las instrucciones.
  }
  return permiso;
}

// Agitar. alCambiar(nivel) para pintar el medidor; alEnviar(nivel) cuando hay que mandarlo al servidor.
export function medirAgitado({ alCambiar, alEnviar }) {
  let nivel = 0;
  let enviado = 0;
  let ultimaLectura = 0;
  let anterior = performance.now();

  function bajar(ahora) {
    nivel = Math.max(0, nivel - (CAIDA * (ahora - anterior)) / 1000);
    anterior = ahora;
  }

  function alMoverse(e) {
    // acceleration ya descuenta la gravedad; si el móvil no la da, se resta a mano.
    const a = e.acceleration?.x != null ? e.acceleration : e.accelerationIncludingGravity;
    if (a?.x == null) return;
    let fuerza = Math.hypot(a.x, a.y, a.z);
    if (a === e.accelerationIncludingGravity) fuerza = Math.abs(fuerza - 9.81);
    ultimaLectura = performance.now();
    bajar(ultimaLectura);
    if (fuerza > REPOSO) nivel = Math.max(nivel, Math.min(1, fuerza / FUERZA_MAX));
  }

  function tocar() {
    if (hayAcelerometro()) return;
    bajar(performance.now());
    nivel = Math.min(1, nivel + POR_TOQUE);
  }

  const hayAcelerometro = () => performance.now() - ultimaLectura < SIN_SENSOR;

  const intervalo = setInterval(() => {
    bajar(performance.now());
    alCambiar(nivel);
    if (Math.abs(nivel - enviado) >= UMBRAL || (nivel === 0 && enviado !== 0)) {
      enviado = nivel;
      alEnviar(nivel);
    }
  }, ENVIO);

  window.addEventListener('devicemotion', alMoverse);

  return {
    tocar,
    hayAcelerometro,
    parar() {
      clearInterval(intervalo);
      window.removeEventListener('devicemotion', alMoverse);
      if (enviado !== 0) alEnviar(0);
    },
  };
}

// Inclinar. x e y entre -1 y 1: x positivo hacia la derecha, y positivo hacia abajo (hacia el jugador).
// La postura con la que se empieza cuenta como plana, para no tener que sujetar el móvil horizontal.
// alCambiar(x, y) para pintar el nivel; alEnviar(x, y) cuando hay que mandarlo al servidor.
export function medirInclinacion({ alCambiar, alEnviar }) {
  let x = 0;
  let y = 0;
  let neutro = null;
  let enviado = { x: 0, y: 0 }; // cuantizado
  let ultimaLectura = 0;

  function alOrientar(e) {
    if (e.beta == null || e.gamma == null) return;
    ultimaLectura = performance.now();
    neutro ??= { beta: e.beta, gamma: e.gamma };
    x = limitar((e.gamma - neutro.gamma) / GRADOS_MAX);
    y = limitar((e.beta - neutro.beta) / GRADOS_MAX);
  }

  const hayGiroscopio = () => performance.now() - ultimaLectura < SIN_SENSOR;

  const intervalo = setInterval(() => {
    alCambiar(x, y);
    const qx = cuantizar(x);
    const qy = cuantizar(y);
    if (Math.abs(qx - enviado.x) >= UMBRAL_INCLINACION || Math.abs(qy - enviado.y) >= UMBRAL_INCLINACION) {
      enviado = { x: qx, y: qy };
      alEnviar(x, y);
    }
  }, ENVIO_INCLINACION);

  window.addEventListener('deviceorientation', alOrientar);

  return {
    hayGiroscopio,
    // Sin giroscopio, el dedo hace de joystick: dx y dy entre -1 y 1 desde el centro.
    arrastrar(dx, dy) {
      if (hayGiroscopio()) return;
      const largo = Math.hypot(dx, dy);
      x = largo > 1 ? dx / largo : dx;
      y = largo > 1 ? dy / largo : dy;
    },
    recalibrar() {
      neutro = null;
      if (!hayGiroscopio()) x = y = 0;
    },
    parar() {
      clearInterval(intervalo);
      window.removeEventListener('deviceorientation', alOrientar);
      if (enviado.x || enviado.y) alEnviar(0, 0);
    },
  };
}
