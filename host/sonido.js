// Efectos de sonido de la pantalla, sintetizados con Web Audio: no hay archivos que descargar.
// El navegador no deja sonar nada hasta que se toca la página, así que el contexto se crea en el primer clic
// (Crear partida, Empezar…). Se puede silenciar con el botón de la barra; se recuerda en este navegador.
const CLAVE = 'partypad:silencio';

let ctx = null;
let salida = null;
let silencio = leerSilencio();

function leerSilencio() {
  try {
    return localStorage.getItem(CLAVE) === '1';
  } catch {
    return false;
  }
}

export function desbloquear() {
  if (!ctx) {
    const Contexto = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Contexto) return;
    ctx = new Contexto();
    salida = ctx.createGain();
    salida.gain.value = silencio ? 0 : 0.5;
    salida.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
}

export const silenciado = () => silencio;

export function silenciar(si) {
  silencio = si;
  try {
    localStorage.setItem(CLAVE, si ? '1' : '0');
  } catch {}
  if (salida) salida.gain.value = si ? 0 : 0.5;
}

// Una nota: frecuencia en Hz, inicio y duración en segundos desde ahora, forma de onda y volumen.
function nota(frecuencia, inicio, duracion, tipo = 'sine', volumen = 0.3, hasta = null) {
  if (!ctx || silencio || ctx.state !== 'running') return;
  const t = ctx.currentTime + inicio;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = tipo;
  o.frequency.setValueAtTime(frecuencia, t);
  if (hasta) o.frequency.exponentialRampToValueAtTime(hasta, t + duracion);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(volumen, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + duracion);
  o.connect(g).connect(salida);
  o.start(t);
  o.stop(t + duracion + 0.05);
}

export const cuenta = () => nota(660, 0, 0.18, 'square', 0.12);
export const ya = () => [880, 1320].forEach((f) => nota(f, 0, 0.45, 'square', 0.12));
export const unirse = () => nota(500, 0, 0.15, 'sine', 0.3, 900);
export const salir = () => nota(500, 0, 0.2, 'sine', 0.2, 250);
export const meta = (puesto = 1) => [784, 988, 1175].forEach((f, i) => nota(f * (puesto === 1 ? 1 : 0.84), i * 0.07, 0.35, 'triangle', 0.25));
export const senal = () => nota(1046, 0, 0.3, 'square', 0.18);
export const pulsacion = () => nota(1500, 0, 0.06, 'sine', 0.15);
export const pronto = () => nota(140, 0, 0.35, 'sawtooth', 0.18, 90);
export const resultados = () => [523, 659, 784].forEach((f, i) => nota(f, i * 0.09, 0.3, 'triangle', 0.22));

export function fanfarria() {
  const melodia = [
    [523, 0, 0.18],
    [659, 0.18, 0.18],
    [784, 0.36, 0.18],
    [1046, 0.54, 0.5],
    [784, 0.9, 0.16],
    [1046, 1.06, 0.8],
  ];
  for (const [f, t, d] of melodia) {
    nota(f, t, d, 'square', 0.1);
    nota(f / 2, t, d, 'triangle', 0.2);
  }
}

// Simón dice: un tono por color, como el juguete.
const TONOS_SIMON = [415, 310, 252, 209];
export const tonoSimon = (i) => nota(TONOS_SIMON[i] ?? 300, 0, 0.42, 'triangle', 0.3);

// Ritmo: grados de la escala mayor de do (0 = do4) para la melodía, con un golpe de bombo suave.
const ESCALA = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
export function notaRitmo(grado) {
  const f = 261.63 * 2 ** ((ESCALA[grado] ?? 0) / 12);
  nota(f, 0, 0.22, 'square', 0.08);
  nota(f / 2, 0, 0.25, 'triangle', 0.18);
  nota(90, 0, 0.12, 'sine', 0.25, 45);
}

// Ruido blanco filtrado: la base de explosiones, golpes y silbidos de aire.
function ruido(inicio, duracion, { volumen = 0.3, filtro = 'lowpass', desde = 2000, hasta = 200 } = {}) {
  if (!ctx || silencio || ctx.state !== 'running') return;
  const t = ctx.currentTime + inicio;
  const muestras = Math.ceil(ctx.sampleRate * duracion);
  const buffer = ctx.createBuffer(1, muestras, ctx.sampleRate);
  const datos = buffer.getChannelData(0);
  for (let i = 0; i < muestras; i++) datos[i] = Math.random() * 2 - 1;
  const fuente = ctx.createBufferSource();
  fuente.buffer = buffer;
  const f = ctx.createBiquadFilter();
  f.type = filtro;
  f.frequency.setValueAtTime(desde, t);
  f.frequency.exponentialRampToValueAtTime(hasta, t + duracion);
  const g = ctx.createGain();
  g.gain.setValueAtTime(volumen, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duracion);
  fuente.connect(f).connect(g).connect(salida);
  fuente.start(t);
}

// Efectos propios de cada minijuego, para que cada uno suene distinto.
export const explosion = () => {
  ruido(0, 0.9, { volumen: 0.55, desde: 1800, hasta: 60 });
  nota(70, 0, 0.6, 'sine', 0.5, 30);
};
export const silbidoCaida = () => nota(1400, 0, 0.9, 'sine', 0.06, 300); // meteorito que cae
export const impacto = () => {
  ruido(0, 0.35, { volumen: 0.35, desde: 900, hasta: 80 });
  nota(90, 0, 0.3, 'sine', 0.35, 40);
};
export const tic = (agudo = true) => nota(agudo ? 1800 : 1200, 0, 0.04, 'square', 0.08);
export const pop = (subida = 0) => nota(300 + Math.min(900, subida * 12), 0, 0.07, 'sine', 0.25, 120); // globo
export const reventar = () => ruido(0, 0.15, { volumen: 0.4, filtro: 'highpass', desde: 800, hasta: 3000 });
export const gong = () => {
  nota(110, 0, 2.2, 'sine', 0.35);
  nota(165, 0, 1.6, 'sine', 0.15);
  nota(237, 0, 1.2, 'sine', 0.08);
};
export const campanilla = () => [1568, 2093].forEach((f, i) => nota(f, i * 0.12, 0.6, 'sine', 0.18));
export const bocina = () => [392, 392, 523].forEach((f, i) => nota(f, i * 0.16, i === 2 ? 0.6 : 0.13, 'sawtooth', 0.12));
export const disparo = () => {
  ruido(0, 0.25, { volumen: 0.5, filtro: 'highpass', desde: 400, hasta: 4000 });
  nota(160, 0, 0.18, 'square', 0.2, 50);
};
export const viento = () => ruido(0, 1.4, { volumen: 0.08, filtro: 'bandpass', desde: 500, hasta: 900 });
export const redoble = (segundos = 1.2) => {
  for (let t = 0; t < segundos; t += 0.05) ruido(t, 0.05, { volumen: 0.05 + 0.1 * (t / segundos), filtro: 'bandpass', desde: 200, hasta: 180 });
};
export const tadan = () => [523, 659, 784, 1046].forEach((f, i) => nota(f, i * 0.08, i === 3 ? 0.5 : 0.12, 'triangle', 0.22));
export const blip = (i = 0) => nota(500 + i * 90, 0, 0.08, 'triangle', 0.18);
export const tirar = () => nota(80 + Math.random() * 30, 0, 0.12, 'sawtooth', 0.05, 60); // esfuerzo en la cuerda
export const pincel = () => ruido(0, 0.08, { volumen: 0.03, filtro: 'bandpass', desde: 3000, hasta: 2500 });
export const motor = (fuerza = 1) => ruido(0, 0.18, { volumen: 0.05 + 0.1 * fuerza, desde: 320, hasta: 120 }); // cohetes
