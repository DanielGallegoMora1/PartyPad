// Minijuegos de la partida, en el orden en que se juegan.
import { Carrera } from './carrera.js';
import { Laberinto } from './laberinto.js';
import { Reflejos } from './reflejos.js';

const TODOS = [Carrera, Laberinto, Reflejos];

// Para probar solo algunos, por su id: MINIJUEGOS=laberinto npm run dev
const elegidos = process.env.MINIJUEGOS?.split(',').map((id) => id.trim());
export const MINIJUEGOS = elegidos ? TODOS.filter((M) => elegidos.includes(M.id)) : TODOS;
