// Base de los minijuegos por turnos con 4 opciones (Quiz y Colores): en cada turno se muestra algo en la pantalla,
// cada jugador elige una opción con los 4 botones del mando y después se enseña el resultado.
// Fases de cada turno: 'pregunta' (se puede responder; acaba antes si ya han respondido todos) y 'respuesta'.
// La subclase pone static turnos, tPregunta y tRespuesta (en s) e implementa preparar(turno) y puntuar(j).
import { Minijuego, conPuestos } from './minijuego.js';
import { CONJUNTOS } from '../../shared/opciones.js';

export class PorTurnos extends Minijuego {
  static control = 'opciones';
  static opciones = 'respuestas';
  static envio = 1000; // los cambios se mandan al momento con enviarAhora; el envío periódico es para el reloj
  static turnos = 5;
  static tPregunta = 10;
  static tRespuesta = 3;

  constructor(ids, opciones) {
    super(ids, opciones);
    this.turno = -1;
    this.fase = null; // pregunta | respuesta
    this.finFase = 0; // en segundos de ronda
    this.inicioPregunta = 0; // performance.now() al mostrar la pregunta
    // eleccion: opción del turno (0 a 3) o null; segundos: cuánto tardó; ganados: puntos del turno
    this.jugadores = new Map(ids.map((id) => [id, { puntos: 0, eleccion: null, segundos: null, ganados: 0, conectado: true }]));
    this.recalcularLimite();
  }

  // Lo que queda de ronda, para el reloj de la pantalla: el resto de la fase actual y los turnos que faltan.
  recalcularLimite() {
    const { turnos, tPregunta, tRespuesta } = this.constructor;
    const resto = { null: 0, pregunta: tRespuesta, respuesta: 0 }[this.fase];
    this.limite = (this.fase ? this.finFase : this.tiempo) + resto + (turnos - this.turno - 1) * (tPregunta + tRespuesta);
  }

  cambiar(fase, segundos) {
    this.fase = fase;
    this.finFase = this.tiempo + segundos;
    this.recalcularLimite();
    this.enviarAhora = true;
  }

  tick() {
    if (this.fase === null) return this.siguienteTurno();
    if (this.tiempo < this.finFase) return;
    if (this.fase === 'pregunta') {
      this.cerrarTurno();
      this.cambiar('respuesta', this.constructor.tRespuesta);
    } else if (this.turno < this.constructor.turnos - 1) {
      this.siguienteTurno();
    }
  }

  siguienteTurno() {
    this.turno++;
    for (const j of this.jugadores.values()) Object.assign(j, { eleccion: null, segundos: null, ganados: 0 });
    this.preparar(this.turno);
    this.inicioPregunta = performance.now();
    this.cambiar('pregunta', this.constructor.tPregunta);
    this.avisarTodos({ type: 'hint', title: this.tituloTurno(), text: this.textoTurno(), lock: false });
  }

  tituloTurno() {
    return `${this.turno + 1} de ${this.constructor.turnos}`;
  }

  textoTurno() {
    return 'Mira la pantalla y elige';
  }

  cerrarTurno() {
    for (const [id, j] of this.jugadores) {
      j.ganados = this.puntuar(j);
      j.puntos += j.ganados;
      this.alCerrar(id, j);
    }
  }

  // Lo que se le dice al mando de cada jugador al enseñar el resultado del turno.
  alCerrar(id, j) {}

  // Lo que se le dice al mando al responder.
  alResponder(id, j) {
    this.avisar(id, { type: 'hint', title: 'Respuesta enviada', text: 'Mira la pantalla', lock: true });
  }

  onInput(id, entrada) {
    const j = this.jugadores.get(id);
    if (entrada.type !== 'button' || !entrada.pressed || !j || this.fase !== 'pregunta' || j.eleccion !== null) return;
    if (entrada.button < 0 || entrada.button >= CONJUNTOS[this.constructor.opciones].length) return;
    j.eleccion = entrada.button;
    j.segundos = (performance.now() - this.inicioPregunta) / 1000;
    this.alResponder(id, j);
    // Si ya han respondido todos los conectados, no hace falta esperar al final del tiempo.
    if (![...this.jugadores.values()].some((o) => o.conectado && o.eleccion === null)) this.finFase = this.tiempo;
    this.enviarAhora = true;
  }

  // Lo común del estado; la subclase añade lo suyo.
  estadoTurno() {
    const enRespuesta = this.fase === 'respuesta';
    return {
      phase: this.fase ?? 'preparados',
      turn: this.turno + 1,
      turns: this.constructor.turnos,
      players: [...this.jugadores].map(([id, j]) => ({
        id,
        answered: j.eleccion !== null,
        choice: enRespuesta ? j.eleccion : null,
        gained: enRespuesta ? j.ganados : null,
        points: j.puntos,
      })),
    };
  }

  // Al reconectarse a mitad de un turno, el mando vuelve a ver qué hacer.
  conectado(id) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = true;
    if (this.fase === 'pregunta' && !this.terminado()) {
      this.avisar(id, { type: 'hint', title: this.tituloTurno(), text: this.textoTurno(), lock: j.eleccion !== null });
    }
  }

  desconectado(id) {
    const j = this.jugadores.get(id);
    if (j) j.conectado = false;
  }

  quitar(id) {
    this.jugadores.delete(id);
  }

  getResults() {
    const orden = [...this.jugadores].map(([id, j]) => ({ id, puntos: j.puntos })).sort((a, b) => b.puntos - a.puntos);
    return conPuestos(orden, (a, b) => a.puntos === b.puntos).map(({ id, puesto }) => ({ id, puesto }));
  }
}
