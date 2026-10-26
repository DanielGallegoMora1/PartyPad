// Minijuegos de la partida, en el orden en que se juegan: los tres de base y después los packs descargados.
import { Carrera } from './carrera.js';
import { Laberinto } from './laberinto.js';
import { Reflejos } from './reflejos.js';
import { minijuegosDePacks } from '../packs.js';

const BASE = [Carrera, Laberinto, Reflejos];

// Para probar solo algunos, por su id: MINIJUEGOS=laberinto npm run dev
const elegidos = process.env.MINIJUEGOS?.split(',').map((id) => id.trim());

// instalados: ids de los packs que la pantalla ya ha descargado. Solo esos se pueden jugar.
export function minijuegosPartida(instalados = new Set()) {
  const todos = [...BASE, ...minijuegosDePacks(instalados)];
  return elegidos ? todos.filter((M) => elegidos.includes(M.id)) : todos;
}
