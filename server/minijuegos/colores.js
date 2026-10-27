// Colores: en la pantalla aparece el nombre de un color escrito con tinta de otro. Hay que pulsar el botón del
// color de la TINTA, no el de la palabra (el efecto Stroop). Acertar rápido da más puntos y fallar resta.
import { PorTurnos } from './turnos.js';
import { TINTAS } from '../../shared/opciones.js';

// En el mismo orden que los botones del mando (shared/opciones.js).
const COLORES = TINTAS.map((t) => t.nombre.toUpperCase());
const PUNTOS = 100;
const PUNTOS_RAPIDEZ = 100;
const FALLO = -50;
const COINCIDEN = 0.2; // a veces la palabra y la tinta coinciden, para que no se pueda responder sin leer

export class Colores extends PorTurnos {
  static id = 'colores';
  static nombre = 'Colores';
  static instrucciones = 'Pulsa el botón del color de la TINTA, no el de la palabra. ¡No te dejes engañar!';
  static turnos = 10;
  static tPregunta = 3;
  static opciones = 'tintas';
  static tRespuesta = 1;

  preparar() {
    const n = COLORES.length;
    const tinta = Math.floor(Math.random() * n);
    let palabra = tinta;
    if (Math.random() >= COINCIDEN) palabra = (tinta + 1 + Math.floor(Math.random() * (n - 1))) % n;
    this.actual = { palabra, tinta };
  }

  tituloTurno() {
    return `${this.turno + 1} de ${Colores.turnos}`;
  }

  textoTurno() {
    return 'Pulsa el color de la tinta';
  }

  puntuar(j) {
    if (j.eleccion === null) return 0;
    if (j.eleccion !== this.actual.tinta) return FALLO;
    return Math.round(PUNTOS + PUNTOS_RAPIDEZ * Math.max(0, 1 - j.segundos / Colores.tPregunta));
  }

  // Aquí se dice al momento si se ha acertado: el juego va muy rápido.
  alResponder(id, j) {
    const acierto = j.eleccion === this.actual.tinta;
    this.avisar(id, { type: 'hint', title: acierto ? '¡Bien!' : '¡Era otro!', text: '', mood: acierto ? 'bien' : 'mal', lock: true });
  }

  estado() {
    return {
      ...this.estadoTurno(),
      word: this.actual ? COLORES[this.actual.palabra] : null,
      ink: this.actual?.tinta ?? null,
    };
  }
}
