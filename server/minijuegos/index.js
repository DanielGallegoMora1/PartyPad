// Minijuegos de la partida: los de base y los packs descargados. La partida los baraja (ver partida.js).
import { Carrera } from './carrera.js';
import { Laberinto } from './laberinto.js';
import { Reflejos } from './reflejos.js';
import { Machaca } from './machaca.js';
import { Cronometro } from './cronometro.js';
import { Sumo } from './sumo.js';
import { Esquiva } from './esquiva.js';
import { Quiz } from './quiz.js';
import { Colores } from './colores.js';
import { Patata } from './patata.js';
import { Tira } from './tira.js';
import { Simon } from './simon.js';
import { Cuantos } from './cuantos.js';
import { Ritmo } from './ritmo.js';
import { Dibuja } from './dibuja.js';
import { minijuegosDePacks } from '../packs.js';

const BASE = [Carrera, Laberinto, Reflejos, Machaca, Cronometro, Sumo, Esquiva, Quiz, Colores, Patata, Tira, Simon, Cuantos, Ritmo, Dibuja];

// Para probar solo algunos, por su id: MINIJUEGOS=laberinto npm run dev
const elegidos = process.env.MINIJUEGOS?.split(',').map((id) => id.trim());

// instalados: ids de los packs que la pantalla ya ha descargado. Solo esos se pueden jugar.
export function minijuegosPartida(instalados = new Set()) {
  const todos = [...BASE, ...minijuegosDePacks(instalados)];
  return elegidos ? todos.filter((M) => elegidos.includes(M.id)) : todos;
}
