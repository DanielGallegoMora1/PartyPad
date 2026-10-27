// Simón dice: la pantalla enciende una secuencia de colores y hay que repetirla con los 4 botones del mando. Cada
// nivel la secuencia tiene un color más. Quien se equivoca o no la termina a tiempo, queda eliminado.
import { Minijuego, conPuestos } from './minijuego.js';

const INICIAL = 3; // colores del primer nivel
const MAXIMO = 14;
const PASO = 0.65; // s entre colores al enseñar la secuencia
const ENCENDIDO = 0.45; // s que está encendido cada color
const POR_COLOR = 0.9; // s para repetir cada color, más un margen
const MARGEN = 2;
const PAUSA = 1.8;

export class Simon extends Minijuego {
  static id = 'simon';
  static nombre = 'Simón dice';
  static instrucciones = 'Fíjate en la secuencia de colores y repítela con los botones. ¡Cada vez es más larga!';
  static control = 'opciones';
  static opciones = 'respuestas';
  static multiples = true;
  static duracion = 180_000;
  static envio = 1000;

  constructor(ids, opciones) {
    super(ids, opciones);
    this.secuencia = Array.from({ length: INICIAL - 1 }, () => Math.floor(Math.random() * 4));
    this.fase = null; // mostrar | repetir | pausa
    this.inicioFase = 0;
    this.finFase = 0;
    this.encendido = null;
    // nivel: largo de la última secuencia que repitió bien; progreso: colores acertados en la actual
    this.jugadores = new Map(ids.map((id) => [id, { nivel: 0, fuera: false, progreso: 0, hecho: false, conectado: true }]));
  }

  vivos() {
    return [...this.jugadores].filter(([, j]) => !j.fuera);
  }

  cambiar(fase, segundos) {
    this.fase = fase;
    this.inicioFase = this.tiempo;
    this.finFase = this.tiempo + segundos;
    this.limite = this.finFase + (fase === 'mostrar' ? MARGEN + POR_COLOR * this.secuencia.length + PAUSA : fase === 'repetir' ? PAUSA : 0) + 1;
    this.enviarAhora = true;
  }

  siguienteNivel() {
    this.secuencia.push(Math.floor(Math.random() * 4));
    for (const [id, j] of this.jugadores) {
      j.progreso = 0;
      j.hecho = false;
      if (!j.fuera) this.avisar(id, { type: 'hint', title: `Nivel ${this.secuencia.length - INICIAL + 1}`, text: '¡Mira la secuencia!', lock: true });
    }
    this.cambiar('mostrar', this.secuencia.length * PASO + 0.4);
  }

  tick() {
    if (this.fase === null) return this.siguienteNivel();
    if (this.fase === 'mostrar') {
      // Qué color está encendido ahora: el servidor lo dice para que todas las pantallas vayan igual.
      const t = this.tiempo - this.inicioFase - 0.3;
      const paso = Math.floor(t / PASO);
      const encendido = t >= 0 && paso < this.secuencia.length && t - paso * PASO < ENCENDIDO ? paso : null;
      if (encendido !== this.encendido) {
        this.encendido = encendido;
        this.enviarAhora = true;
      }
    }
    if (this.tiempo < this.finFase) return;
    if (this.fase === 'mostrar') {
      this.encendido = null;
      for (const [id] of this.vivos()) {
        this.avisar(id, { type: 'hint', title: `Repite ${this.secuencia.length} colores`, text: `0 de ${this.secuencia.length}`, lock: false });
      }
      this.cambiar('repetir', MARGEN + POR_COLOR * this.secuencia.length);
    } else if (this.fase === 'repetir') {
      // Quien no ha terminado a tiempo, fuera.
      for (const [id, j] of this.vivos()) {
        if (j.hecho) continue;
        j.fuera = true;
        this.vibrar(id, 400);
        this.avisar(id, { type: 'hint', title: '¡Se acabó el tiempo!', text: 'Estás eliminado', mood: 'mal', lock: true });
      }
      this.cambiar('pausa', PAUSA);
    } else if (this.vivos().length && this.secuencia.length < MAXIMO) {
      this.siguienteNivel();
    } else {
      this.limite = this.tiempo; // nadie sigue en pie o se llegó al máximo
    }
  }

  onInput(id, entrada) {
    const j = this.jugadores.get(id);
    if (entrada.type !== 'button' || !entrada.pressed || !j || j.fuera || j.hecho || this.fase !== 'repetir') return;
    if (entrada.button === this.secuencia[j.progreso]) {
      j.progreso++;
      if (j.progreso === this.secuencia.length) {
        j.hecho = true;
        j.nivel = this.secuencia.length;
        this.avisar(id, { type: 'hint', title: '¡Bien!', text: 'Espera al siguiente nivel', mood: 'bien', lock: true });
      } else {
        this.avisar(id, { type: 'hint', title: `Repite ${this.secuencia.length} colores`, text: `${j.progreso} de ${this.secuencia.length}` });
      }
    } else {
      j.fuera = true;
      this.vibrar(id, 400);
      this.avisar(id, { type: 'hint', title: '¡Fallaste!', text: 'Estás eliminado', mood: 'mal', lock: true });
    }
    // Si ya han terminado o fallado todos, no hace falta esperar.
    if (!this.vivos().some(([, o]) => o.conectado && !o.hecho)) this.finFase = this.tiempo;
    this.enviarAhora = true;
  }

  terminado() {
    return this.tiempo >= this.limite;
  }

  estado() {
    return {
      phase: this.fase ?? 'preparados',
      level: Math.max(0, this.secuencia.length - INICIAL + 1),
      length: this.secuencia.length,
      lit: this.encendido === null ? null : this.secuencia[this.encendido],
      step: this.encendido,
      players: [...this.jugadores].map(([id, j]) => ({ id, out: j.fuera, progress: j.progreso, done: j.hecho, best: j.nivel })),
    };
  }

  conectado(id) {
    const j = this.jugadores.get(id);
    if (j) j.conectado = true;
  }

  desconectado(id) {
    const j = this.jugadores.get(id);
    if (j) j.conectado = false;
  }

  quitar(id) {
    this.jugadores.delete(id);
  }

  // Más lejos llega, mejor; los que acaban en el mismo nivel empatan.
  getResults() {
    const orden = [...this.jugadores].map(([id, j]) => ({ id, nivel: j.nivel })).sort((a, b) => b.nivel - a.nivel);
    return conPuestos(orden, (a, b) => a.nivel === b.nivel).map(({ id, puesto }) => ({ id, puesto }));
  }
}
