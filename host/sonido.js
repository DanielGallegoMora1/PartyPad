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
