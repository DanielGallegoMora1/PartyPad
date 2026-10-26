// Cronómetro: en la pantalla corre un reloj que desaparece a los pocos segundos. Hay que pulsar cuando se crea
// que marca justo OBJETIVO segundos. Gana quien más se acerca; los tiempos se descubren al final.
import { Minijuego, conPuestos } from './minijuego.js';

const OBJETIVO = 7; // s
const VISIBLE = 2.5; // s que se ve el reloj antes de ocultarse
const MAXIMO = 13; // s: quien no ha pulsado para entonces, se queda sin tiempo
const REVELAR = 3.5; // s enseñando los tiempos antes de acabar la ronda

export class Cronometro extends Minijuego {
  static id = 'cronometro';
  static nombre = 'Cronómetro a ciegas';
  static instrucciones = `Pulsa cuando creas que el reloj marca ${OBJETIVO},00 segundos. ¡Se oculta enseguida!`;
  static control = 'tocar';
  static duracion = (MAXIMO + REVELAR) * 1000;
  static envio = 100;
  static reloj = false; // con la cuenta atrás de la ronda a la vista sería muy fácil

  constructor(ids, opciones) {
    super(ids, opciones);
    this.inicio = null; // performance.now() al empezar: el tiempo de cada pulsación se mide con él, no por pasos
    this.revelar = null; // segundo de ronda en que se descubren los tiempos
    this.jugadores = new Map(ids.map((id) => [id, { parada: null, conectado: true }]));
  }

  tick() {
    // Se descubren los tiempos cuando han parado todos los conectados o se acaba el tiempo para parar.
    const faltan = [...this.jugadores.values()].some((j) => j.conectado && j.parada === null);
    if (this.revelar === null && this.inicio !== null && (!faltan || this.tiempo >= MAXIMO)) {
      this.revelar = this.tiempo;
      this.limite = this.tiempo + REVELAR;
      this.enviarAhora = true;
    }
    if (this.inicio !== null) return;
    this.inicio = performance.now() - this.tiempo * 1000;
    this.avisarTodos({ type: 'hint', title: `¡Para en ${OBJETIVO},00 s!`, text: 'Pulsa el botón una sola vez', lock: false });
  }

  onInput(id, entrada) {
    const j = this.jugadores.get(id);
    if (entrada.type !== 'button' || !entrada.pressed || !j || j.parada !== null || this.inicio === null || this.revelar !== null) return;
    j.parada = (performance.now() - this.inicio) / 1000;
    this.avisar(id, { type: 'hint', title: '¡Parado!', text: 'Los tiempos se ven al final en la pantalla', lock: true });
    this.enviarAhora = true;
  }

  estado() {
    const fin = this.revelar !== null;
    return {
      target: OBJETIVO,
      time: Math.round(this.tiempo * 100) / 100,
      hidden: this.tiempo >= VISIBLE,
      done: fin,
      // Los tiempos solo se mandan al final, para que nadie los vea en la pantalla antes de tiempo.
      players: [...this.jugadores].map(([id, j]) => ({
        id,
        stopped: j.parada !== null,
        at: fin && j.parada !== null ? Math.round(j.parada * 1000) / 1000 : null,
      })),
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

  getResults() {
    const orden = [...this.jugadores]
      .map(([id, j]) => ({ id, error: j.parada === null ? Infinity : Math.round(Math.abs(j.parada - OBJETIVO) * 1000) }))
      .sort((a, b) => a.error - b.error);
    return conPuestos(orden, (a, b) => a.error === b.error).map(({ id, puesto }) => ({ id, puesto }));
  }
}
