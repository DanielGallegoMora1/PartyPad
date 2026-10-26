// Machaca: gana quien más veces pulsa el botón antes de que acabe el tiempo.
import { Minijuego, conPuestos } from './minijuego.js';

const ENTRE_TOQUES = 0.04; // s mínimos entre dos pulsaciones que cuentan: más de 25 por segundo no es un dedo

export class Machaca extends Minijuego {
  static id = 'machaca';
  static nombre = 'Machaca el botón';
  static instrucciones = '¡Pulsa el botón todas las veces que puedas antes de que se acabe el tiempo!';
  static control = 'tocar';
  static duracion = 10_000;
  static envio = 100;

  constructor(ids, opciones) {
    super(ids, opciones);
    this.jugadores = new Map(ids.map((id) => [id, { toques: 0, ultimo: -1 }]));
  }

  onInput(id, entrada) {
    const j = this.jugadores.get(id);
    if (entrada.type !== 'button' || !entrada.pressed || !j) return;
    if (this.tiempo - j.ultimo < ENTRE_TOQUES) return;
    j.ultimo = this.tiempo;
    j.toques++;
  }

  estado() {
    return { players: [...this.jugadores].map(([id, j]) => ({ id, taps: j.toques })) };
  }

  quitar(id) {
    this.jugadores.delete(id);
  }

  getResults() {
    const orden = [...this.jugadores].map(([id, j]) => ({ id, toques: j.toques })).sort((a, b) => b.toques - a.toques);
    return conPuestos(orden, (a, b) => a.toques === b.toques).map(({ id, puesto }) => ({ id, puesto }));
  }
}
