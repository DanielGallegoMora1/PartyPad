// Phaser en la pantalla principal: cada minijuego es una escena con la misma clave que su id en el servidor.
// El juego se crea al empezar la primera ronda y se reutiliza en las siguientes.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { Carrera } from './juegos/carrera.js';
import { Laberinto } from './juegos/laberinto.js';
import { Reflejos } from './juegos/reflejos.js';
import { Machaca } from './juegos/machaca.js';
import { Cronometro } from './juegos/cronometro.js';
import { Sumo } from './juegos/sumo.js';
import { Esquiva } from './juegos/esquiva.js';
import { Quiz } from './juegos/quiz.js';
import { Colores } from './juegos/colores.js';
import { Patata } from './juegos/patata.js';
import { Tira } from './juegos/tira.js';
import { Simon } from './juegos/simon.js';
import { Cuantos } from './juegos/cuantos.js';
import { Ritmo } from './juegos/ritmo.js';
import { Dibuja } from './juegos/dibuja.js';

const ESCENAS = {
  carrera: Carrera,
  laberinto: Laberinto,
  reflejos: Reflejos,
  machaca: Machaca,
  cronometro: Cronometro,
  sumo: Sumo,
  esquiva: Esquiva,
  quiz: Quiz,
  colores: Colores,
  patata: Patata,
  tira: Tira,
  simon: Simon,
  cuantos: Cuantos,
  ritmo: Ritmo,
  dibuja: Dibuja,
};

let juego = null;
let listo = null; // promesa que se cumple cuando Phaser ha arrancado
let actual = null; // clave de la escena que se está jugando, o que se va a jugar en cuanto arranque Phaser
let ronda = 0; // cada ronda empieza la escena de cero, aunque se repita el minijuego
let alFallar = (err) => console.error(err);

// Para enterarse de los errores de las escenas (main.js los enseña en pantalla).
export const alError = (f) => (alFallar = f);

// Phaser dibuja cada fotograma antes de pedir el siguiente: un solo error en una escena pararía el juego entero
// para el resto de la partida. Por eso cada escena se envuelve: si falla, se avisa y el resto sigue. Importa sobre
// todo con los packs, que traen código descargado.
const METODOS = ['init', 'preload', 'create', 'update', 'actualizar', 'conexion', 'quitar', 'dibujo'];
const blindadas = new WeakMap();

function blindar(Escena, clave) {
  if (blindadas.has(Escena)) return blindadas.get(Escena);
  class Blindada extends Escena {}
  for (const metodo of METODOS) {
    const original = Escena.prototype[metodo];
    if (typeof original !== 'function') continue;
    Blindada.prototype[metodo] = function (...args) {
      if (metodo === 'init') this.rota = false; // Phaser reutiliza la escena en cada ronda
      if (this.rota && metodo === 'update') return; // no repetir el mismo error 60 veces por segundo
      try {
        return original.apply(this, args);
      } catch (err) {
        if (metodo === 'create' || metodo === 'update') this.rota = true;
        alFallar(err, clave, metodo);
      }
    };
  }
  blindadas.set(Escena, Blindada);
  return Blindada;
}

function crear() {
  juego = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'juego',
    transparent: true,
    // Con un tamaño mínimo: un lienzo de 0 × 0 (con la vista oculta) rompe los búferes de WebGL.
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%', min: { width: 320, height: 200 } },
    banner: false,
  });
  // Las escenas se añaden sin arrancar: si fueran en la configuración, Phaser arrancaría la primera
  // él solo, sin los jugadores. Solo se arrancan con montar().
  const arrancado = new Promise((r) =>
    juego.events.once('ready', () => {
      for (const [key, Escena] of Object.entries(ESCENAS)) juego.scene.add(key, blindar(Escena, key), false);
      juego.canvas.addEventListener('webglcontextlost', () => alFallar(new Error('Se ha perdido el contexto gráfico (WebGL)'), 'phaser', 'render'));
      r();
    }),
  );
  // Los textos de Phaser usan Fredoka: hay que esperar a que la fuente esté cargada.
  const fuente = document.fonts.load('600 1rem Fredoka').catch(() => {});
  listo = Promise.all([arrancado, fuente]);
  return listo;
}

const escena = () => (actual ? juego?.scene.getScene(actual) : null);

// Escena de un pack descargado (ver packs.js). Si ya existía una versión anterior, la sustituye.
export async function registrar(id, Escena) {
  if (ESCENAS[id] === Escena) return;
  ESCENAS[id] = Escena;
  if (!listo) return; // se añadirá al arrancar Phaser
  await listo;
  if (actual === id) return; // no se cambia a mitad de ronda; la nueva se usará la próxima vez
  if (juego.scene.getScene(id)) juego.scene.remove(id);
  juego.scene.add(id, blindar(Escena, id), false);
}

// jugadores: [{ id, name, hex, connected }]. inicio: el mensaje de la fase, con el escenario (setup)
// y el estado del minijuego. Si ya se está jugando esa ronda, no hace nada.
export async function montar(id, numero, jugadores, inicio) {
  if (!ESCENAS[id] || (actual === id && ronda === numero)) return;
  if (actual && juego) juego.scene.stop(actual);
  actual = id;
  ronda = numero;
  await (listo ?? crear());
  if (actual !== id || ronda !== numero || !juego) return;
  try {
    juego.scene.start(id, { jugadores, inicio });
  } catch (err) {
    alFallar(err, id, 'start');
  }
}

// Al salir de la partida (lobby, podio) se destruye Phaser y en la siguiente se crea de nuevo. Si se quedara
// vivo con la vista oculta, su lienzo pasaría a medir 0 × 0 y WebGL dejaría de dibujar: la siguiente partida
// sonaba pero se veía vacía.
export function desmontar() {
  actual = null;
  ronda = 0;
  if (!juego) return;
  const viejo = juego;
  juego = null;
  listo = null;
  viejo.destroy(true);
}

// Las escenas solo reciben mensajes cuando ya han hecho create().
function llamar(metodo, ...args) {
  const e = escena();
  if (e?.sys.isActive() && e.listo) e[metodo]?.(...args);
}

export const actualizar = (estado) => llamar('actualizar', estado);
export const conexion = (id, conectado) => llamar('conexion', id, conectado);
export const quitar = (id) => llamar('quitar', id);
export const dibujo = (msg) => llamar('dibujo', msg); // trazos en directo de Dibuja
