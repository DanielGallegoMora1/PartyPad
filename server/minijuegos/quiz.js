// Quiz: preguntas de cultura general con 4 respuestas, al estilo Kahoot. La pregunta y las respuestas se ven en la
// pantalla grande; en el mando solo están los 4 botones con su color y su forma. Acertar rápido da más puntos.
import { PorTurnos } from './turnos.js';
import { PREGUNTAS } from './preguntas.js';

const PUNTOS_BASE = 500; // por acertar
const PUNTOS_RAPIDEZ = 500; // de más, según lo rápido (todos si se responde al instante, ninguno al final)

function barajar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[k]] = [copia[k], copia[i]];
  }
  return copia;
}

export class Quiz extends PorTurnos {
  static id = 'quiz';
  static nombre = 'Quiz';
  static instrucciones = 'Lee la pregunta en la pantalla y pulsa en el móvil el botón de la respuesta. ¡Rápido!';
  static turnos = 6;
  static tPregunta = 12;
  static tRespuesta = 4;

  constructor(ids, opciones) {
    super(ids, opciones);
    this.preguntas = barajar(PREGUNTAS).slice(0, Quiz.turnos);
    this.actual = null; // { texto, opciones, correcta }
  }

  preparar(turno) {
    const [texto, ...respuestas] = this.preguntas[turno];
    const opciones = barajar(respuestas);
    this.actual = { texto, opciones, correcta: opciones.indexOf(respuestas[0]) };
  }

  tituloTurno() {
    return `Pregunta ${this.turno + 1} de ${Quiz.turnos}`;
  }

  textoTurno() {
    return 'Lee la pregunta en la pantalla y elige la respuesta';
  }

  puntuar(j) {
    if (j.eleccion !== this.actual.correcta) return 0;
    return Math.round(PUNTOS_BASE + PUNTOS_RAPIDEZ * Math.max(0, 1 - j.segundos / Quiz.tPregunta));
  }

  alCerrar(id, j) {
    const texto = j.eleccion === null ? 'No has respondido' : j.ganados ? `+${j.ganados} puntos` : 'Esa no era';
    this.avisar(id, { type: 'hint', title: j.ganados ? '¡Correcto!' : 'Fallo', text: texto, mood: j.ganados ? 'bien' : 'mal', lock: true });
  }

  estado() {
    return {
      ...this.estadoTurno(),
      question: this.actual?.texto ?? null,
      options: this.actual?.opciones ?? [],
      correct: this.fase === 'respuesta' ? this.actual.correcta : null,
    };
  }
}
