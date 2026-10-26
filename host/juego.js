// Phaser en la pantalla principal: cada minijuego es una escena con la misma clave que su id en el servidor.
// El juego se crea al empezar la primera ronda y se reutiliza en las siguientes.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { Carrera } from './juegos/carrera.js';
import { Laberinto } from './juegos/laberinto.js';
import { Reflejos } from './juegos/reflejos.js';

const ESCENAS = { carrera: Carrera, laberinto: Laberinto, reflejos: Reflejos };

let juego = null;
let listo = null; // promesa que se cumple cuando Phaser ha arrancado
let actual = null; // clave de la escena que se está jugando, o que se va a jugar en cuanto arranque Phaser
let ronda = 0; // cada ronda empieza la escena de cero, aunque se repita el minijuego

function crear() {
  juego = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'juego',
    transparent: true,
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    banner: false,
  });
  // Las escenas se añaden sin arrancar: si fueran en la configuración, Phaser arrancaría la primera
  // él solo, sin los jugadores. Solo se arrancan con montar().
  const arrancado = new Promise((r) =>
    juego.events.once('ready', () => {
      for (const [key, Escena] of Object.entries(ESCENAS)) juego.scene.add(key, Escena, false);
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
  juego.scene.add(id, Escena, false);
}

// jugadores: [{ id, name, hex, connected }]. inicio: el mensaje de la fase, con el escenario (setup)
// y el estado del minijuego. Si ya se está jugando esa ronda, no hace nada.
export async function montar(id, numero, jugadores, inicio) {
  if (!ESCENAS[id] || (actual === id && ronda === numero)) return;
  if (actual && juego) juego.scene.stop(actual);
  actual = id;
  ronda = numero;
  await (listo ?? crear());
  if (actual === id && ronda === numero) juego.scene.start(id, { jugadores, inicio });
}

export function desmontar() {
  if (actual && juego) juego.scene.stop(actual);
  actual = null;
  ronda = 0;
}

// Las escenas solo reciben mensajes cuando ya han hecho create().
function llamar(metodo, ...args) {
  const e = escena();
  if (e?.sys.isActive() && e.listo) e[metodo]?.(...args);
}

export const actualizar = (estado) => llamar('actualizar', estado);
export const conexion = (id, conectado) => llamar('conexion', id, conectado);
export const quitar = (id) => llamar('quitar', id);
