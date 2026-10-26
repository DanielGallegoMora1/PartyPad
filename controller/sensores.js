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
const ZONA_MUERTA = 0.05; // inclinaciones tan pequeñas cuentan como plano, para que la bola no se mueva sola
const ENVIO_INCLINACION = 33; // unos 30 por segundo como mucho
const UMBRAL_INCLINACION = 2; // compresión delta, en unidades cuantizadas a int8 (de -127 a 127)

const RAD = Math.PI / 180;
const cuantizar = (v) => Math.round(v * 127);
const limitar = (v) => Math.max(-1, Math.min(1, v));
const sinZonaMuerta = (v) => Math.sign(v) * Math.max(0, Math.abs(v) - ZONA_MUERTA) / (1 - ZONA_MUERTA);

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

// Para medir la compresión delta: cuántas lecturas se toman y cuántas se envían de verdad.
function contador(alEnviar) {
  let tomadas = 0;
  let enviadas = 0;
  return {
    muestra: () => tomadas++,
    enviar(...valores) {
      enviadas++;
      alEnviar(...valores);
    },
    estadisticas: () => ({ tomadas, enviadas }),
  };
}

// Agitar. alCambiar(nivel) para pintar el medidor; alEnviar(nivel) cuando hay que mandarlo al servidor.
export function medirAgitado({ alCambiar, alEnviar }) {
  let nivel = 0;
  let enviado = 0;
  const cuenta = contador(alEnviar);
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
    cuenta.muestra();
    if (Math.abs(nivel - enviado) >= UMBRAL || (nivel === 0 && enviado !== 0)) {
      enviado = nivel;
      cuenta.enviar(nivel);
    }
  }, ENVIO);

  window.addEventListener('devicemotion', alMoverse);

  return {
    tocar,
    hayAcelerometro,
    estadisticas: cuenta.estadisticas,
    parar() {
      clearInterval(intervalo);
      window.removeEventListener('devicemotion', alMoverse);
      if (enviado !== 0) cuenta.enviar(0);
    },
  };
}

// Dirección "hacia arriba" del mundo vista desde el móvil (ejes del móvil: x a la derecha, y hacia el borde
// de arriba, z saliendo de la pantalla), a partir de beta y gamma de DeviceOrientation.
function arriba(beta, gamma) {
  const b = beta * RAD;
  const g = gamma * RAD;
  return { x: -Math.cos(b) * Math.sin(g), y: Math.sin(b), z: Math.cos(b) * Math.cos(g) };
}

const punto = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const cruz = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

// Parte de v perpendicular a u, de largo 1.
function perpendicular(v, u) {
  const k = punto(v, u);
  const p = { x: v.x - k * u.x, y: v.y - k * u.y, z: v.z - k * u.z };
  const largo = Math.hypot(p.x, p.y, p.z);
  return { x: p.x / largo, y: p.y / largo, z: p.z / largo };
}

// Ejes de la postura neutra, con u el "arriba" en esa postura: e1 y e2 son las direcciones en las que se mide
// la inclinación, lo más parecidas posible a los ejes x e y del móvil. Si uno de ellos está casi vertical
// (móvil de lado), se parte del otro.
function ejes(u) {
  if (Math.abs(u.x) < 0.9) {
    const e1 = perpendicular({ x: 1, y: 0, z: 0 }, u);
    return { e1, e2: cruz(u, e1) };
  }
  const e2 = perpendicular({ x: 0, y: 1, z: 0 }, u);
  return { e1: cruz(e2, u), e2 };
}

// Giro de la pantalla en grados (0, 90, 180 o 270). iOS antiguo solo tiene window.orientation.
function giroPantalla() {
  const angulo = screen.orientation?.angle ?? globalThis.orientation ?? 0;
  return ((angulo % 360) + 360) % 360;
}

// Inclinar. x e y entre -1 y 1: x positivo hacia la derecha, y positivo hacia abajo (hacia el jugador).
// La postura con la que se empieza cuenta como plana, para no tener que sujetar el móvil horizontal.
// Se calcula con el vector de gravedad y no restando ángulos: así funciona igual aunque el móvil esté casi
// vertical, donde beta y gamma dan saltos. Si al calibrar el móvil está en horizontal, los ejes se giran con
// la pantalla; si gira después (al inclinarlo mucho), se mantienen, para que el control no cambie a mitad.
// alCambiar(x, y) para pintar el nivel; alEnviar(x, y) cuando hay que mandarlo al servidor.
export function medirInclinacion({ alCambiar, alEnviar }) {
  let x = 0;
  let y = 0;
  let neutro = null; // { e1, e2, giro }
  let enviado = { x: 0, y: 0 }; // cuantizado
  let ultimaLectura = 0;
  const escala = Math.sin(GRADOS_MAX * RAD);
  const cuenta = contador(alEnviar);

  function alOrientar(e) {
    if (e.beta == null || e.gamma == null) return;
    ultimaLectura = performance.now();
    const u = arriba(e.beta, e.gamma);
    neutro ??= { ...ejes(u), giro: giroPantalla() * RAD };
    // La bola rueda hacia donde baja el móvil: al contrario de "arriba".
    const px = limitar(-punto(u, neutro.e1) / escala);
    const py = limitar(punto(u, neutro.e2) / escala);
    const c = Math.cos(neutro.giro);
    const s = Math.sin(neutro.giro);
    x = sinZonaMuerta(limitar(px * c + py * s));
    y = sinZonaMuerta(limitar(-px * s + py * c));
  }

  const hayGiroscopio = () => performance.now() - ultimaLectura < SIN_SENSOR;

  const intervalo = setInterval(() => {
    alCambiar(x, y);
    cuenta.muestra();
    const qx = cuantizar(x);
    const qy = cuantizar(y);
    if (Math.abs(qx - enviado.x) >= UMBRAL_INCLINACION || Math.abs(qy - enviado.y) >= UMBRAL_INCLINACION) {
      enviado = { x: qx, y: qy };
      cuenta.enviar(x, y);
    }
  }, ENVIO_INCLINACION);

  window.addEventListener('deviceorientation', alOrientar);

  return {
    hayGiroscopio,
    estadisticas: cuenta.estadisticas,
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
      if (enviado.x || enviado.y) cuenta.enviar(0, 0);
    },
  };
}

const GRADOS_APUNTAR_X = 30; // giro a izquierda o derecha que lleva la mirilla al borde de la pantalla
const GRADOS_APUNTAR_Y = 20; // y arriba o abajo
const UMBRAL_APUNTAR = 1; // la puntería necesita más precisión que la inclinación
const SUAVIZADO_APUNTAR = 0.45; // de 0 a 1: cuánto se acerca la mirilla a la lectura nueva en cada paso (filtra el temblor)

// Apuntar: el móvil como un mando de la tele. x e y entre -1 y 1, 0 en el centro. Girar el móvil a los lados
// (alpha) mueve la mirilla en horizontal y levantar o bajar la punta (beta), en vertical. La postura con la que se
// empieza apunta al centro. Sin giroscopio, el dedo hace de ratón: mover(dx, dy) desplaza la mirilla.
export function medirApuntado({ alCambiar, alEnviar }) {
  let x = 0;
  let y = 0;
  let objetivo = { x: 0, y: 0 }; // lo que dice el sensor; la mirilla se acerca poco a poco para no temblar
  let neutro = null;
  let enviado = { x: 0, y: 0 }; // cuantizado
  let ultimaLectura = 0;
  const cuenta = contador(alEnviar);

  function alOrientar(e) {
    if (e.alpha == null || e.beta == null) return;
    ultimaLectura = performance.now();
    neutro ??= { alpha: e.alpha, beta: e.beta };
    const giro = ((e.alpha - neutro.alpha + 540) % 360) - 180; // de -180 a 180, sin saltos al pasar por 0
    objetivo = { x: limitar(-giro / GRADOS_APUNTAR_X), y: limitar(-(e.beta - neutro.beta) / GRADOS_APUNTAR_Y) };
  }

  const hayGiroscopio = () => performance.now() - ultimaLectura < SIN_SENSOR;

  const intervalo = setInterval(() => {
    if (hayGiroscopio()) {
      x += (objetivo.x - x) * SUAVIZADO_APUNTAR;
      y += (objetivo.y - y) * SUAVIZADO_APUNTAR;
    }
    alCambiar(x, y);
    cuenta.muestra();
    const qx = cuantizar(x);
    const qy = cuantizar(y);
    if (Math.abs(qx - enviado.x) >= UMBRAL_APUNTAR || Math.abs(qy - enviado.y) >= UMBRAL_APUNTAR) {
      enviado = { x: qx, y: qy };
      cuenta.enviar(x, y);
    }
  }, ENVIO_INCLINACION);

  window.addEventListener('deviceorientation', alOrientar);

  return {
    hayGiroscopio,
    estadisticas: cuenta.estadisticas,
    mover(dx, dy) {
      if (hayGiroscopio()) return;
      x = limitar(x + dx);
      y = limitar(y + dy);
    },
    recalibrar() {
      neutro = null;
      if (!hayGiroscopio()) x = y = 0;
    },
    parar() {
      clearInterval(intervalo);
      window.removeEventListener('deviceorientation', alOrientar);
    },
  };
}
