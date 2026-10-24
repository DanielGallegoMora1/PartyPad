// Medir cuánto agita el jugador el móvil, de 0 a 1, con el acelerómetro (DeviceMotion).
// Solo funciona con HTTPS, y en iOS hay que pedir permiso desde un toque del usuario.
// Sin sensor (un PC, o el móvil por HTTP), tocar la pantalla rápido cuenta como agitar.

const FUERZA_MAX = 25; // m/s² de aceleración que cuentan como agitar al máximo
const REPOSO = 2; // por debajo, ruido del sensor con el móvil quieto
const CAIDA = 1.5; // cuánto baja la intensidad por segundo al dejar de agitar
const POR_TOQUE = 0.22; // lo que sube cada toque sin sensor
const ENVIO = 50; // ms entre envíos como mucho
const UMBRAL = 0.04; // compresión delta: solo se envía si cambia al menos esto
const SIN_SENSOR = 1500; // ms sin lecturas para dar el sensor por perdido

export const necesitaPermiso = typeof DeviceMotionEvent?.requestPermission === 'function';
let permiso = necesitaPermiso ? 'pendiente' : 'concedido'; // pendiente | concedido | denegado

export const estadoPermiso = () => permiso;

// Hay que llamarla desde un toque (submit, click): si no, iOS la rechaza sin preguntar.
export async function pedirPermiso() {
  if (permiso !== 'pendiente') return permiso;
  try {
    permiso = (await DeviceMotionEvent.requestPermission()) === 'granted' ? 'concedido' : 'denegado';
  } catch {
    // Llamada fuera de un toque: se podrá volver a pedir con el botón de las instrucciones.
  }
  return permiso;
}

// alCambiar(nivel) para pintar el medidor; alEnviar(nivel) cuando hay que mandarlo al servidor.
export function medir({ alCambiar, alEnviar }) {
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
