// Reflejos: tras una espera al azar, la pantalla grande da la señal y hay que pulsar el botón cuanto antes.
// Se juegan varias señales y gana quien menos tiempo suma. Pulsar antes de la señal vibra y penaliza.
// El tiempo se mide en el servidor, desde que manda la señal a la pantalla hasta que le llega la pulsación:
// la señal solo se ve en la pantalla grande, así que su retraso es el mismo para todos los jugadores.
import { Minijuego, conPuestos } from './minijuego.js';

const SENALES = 5;
const ESPERA_MIN = 1.5; // s antes de cada señal, al azar entre el mínimo y el máximo
const ESPERA_MAX = 4.5;
const VENTANA = 1.5; // s para pulsar tras la señal; quien no pulsa suma este tiempo
const PAUSA = 2.5; // s mostrando los tiempos de la señal antes de la siguiente
const PENALIZACION = 2000; // ms que suma quien pulsa antes de la señal

export class Reflejos extends Minijuego {
  static id = 'reflejos';
  static nombre = 'Reflejos';
  static instrucciones = 'Cuando la pantalla se ponga verde, ¡pulsa! Si pulsas antes de tiempo, te penaliza';
  static control = 'tocar';
  // Cada cambio (la señal, una pulsación) se manda al momento con enviarAhora; el envío periódico solo
  // hace falta para el reloj.
  static envio = 1000;

  constructor(ids, opciones) {
    super(ids, opciones);
    this.esperas = Array.from({ length: SENALES }, () => ESPERA_MIN + Math.random() * (ESPERA_MAX - ESPERA_MIN));
    this.senal = -1; // índice de la señal actual
    this.fase = null; // espera | ya | pausa
    this.finFase = 0; // en segundos de ronda
    this.inicioYa = 0; // performance.now() al dar la señal
    this.ganador = null; // el más rápido de la última señal
    // actual: lo de la señal en curso, { ms, early, missed } o null si aún no ha pulsado
    this.jugadores = new Map(ids.map((id) => [id, { actual: null, total: 0, conectado: true }]));
    this.recalcularLimite();
  }

  // Lo que queda de ronda: la fase actual y las señales que faltan. Con él se pone el reloj de la pantalla.
  recalcularLimite() {
    const resto = { null: 0, espera: VENTANA + PAUSA, ya: PAUSA, pausa: 0 }[this.fase];
    let limite = (this.fase ? this.finFase : this.tiempo) + resto;
    for (let i = this.senal + 1; i < SENALES; i++) limite += this.esperas[i] + VENTANA + PAUSA;
    this.limite = limite;
  }

  cambiar(fase, segundos) {
    this.fase = fase;
    this.finFase = this.tiempo + segundos;
    this.recalcularLimite();
    this.enviarAhora = true;
  }

  tick() {
    if (this.fase === null) return this.siguienteSenal();
    if (this.tiempo < this.finFase) return;
    if (this.fase === 'espera') {
      this.inicioYa = performance.now();
      this.cambiar('ya', VENTANA);
    } else if (this.fase === 'ya') {
      this.cerrarSenal();
      this.cambiar('pausa', PAUSA);
    } else if (this.senal < SENALES - 1) {
      this.siguienteSenal();
    }
  }

  siguienteSenal() {
    this.senal++;
    this.ganador = null;
    for (const j of this.jugadores.values()) j.actual = null;
    this.cambiar('espera', this.esperas[this.senal]);
    for (const id of this.jugadores.keys()) this.avisar(id, { type: 'reflex_wait', signal: this.senal + 1, signals: SENALES });
  }

  // Quien no ha pulsado suma la ventana entera. Se apunta al más rápido.
  cerrarSenal() {
    let mejor = null;
    for (const [id, j] of this.jugadores) {
      if (!j.actual) {
        j.actual = { ms: VENTANA * 1000, missed: true };
        this.avisar(id, { type: 'reaction', missed: true });
      }
      j.total += j.actual.ms;
      if (!j.actual.early && !j.actual.missed && (!mejor || j.actual.ms < mejor.ms)) mejor = { id, ms: j.actual.ms };
    }
    this.ganador = mejor?.id ?? null;
  }

  onInput(id, entrada) {
    const j = this.jugadores.get(id);
    if (entrada.type !== 'button' || !entrada.pressed || !j || j.actual) return;
    if (this.fase === 'espera') {
      j.actual = { ms: PENALIZACION, early: true };
      this.vibrar(id, 400);
      this.avisar(id, { type: 'reaction', early: true, ms: PENALIZACION });
    } else if (this.fase === 'ya') {
      j.actual = { ms: Math.round(performance.now() - this.inicioYa) };
      this.avisar(id, { type: 'reaction', ms: j.actual.ms });
      // Si ya han pulsado todos los conectados, no hace falta esperar a que acabe la ventana.
      const faltan = [...this.jugadores.values()].some((o) => o.conectado && !o.actual);
      if (!faltan) this.finFase = this.tiempo;
    } else {
      return;
    }
    this.enviarAhora = true;
  }

  estado() {
    return {
      phase: this.fase ?? 'preparados',
      signal: this.senal + 1,
      signals: SENALES,
      winner: this.ganador,
      players: [...this.jugadores].map(([id, j]) => ({
        id,
        ms: j.actual?.ms ?? null,
        early: j.actual?.early ?? false,
        missed: j.actual?.missed ?? false,
        total: j.total,
      })),
    };
  }

  // Al reconectarse a mitad de una señal, el mando vuelve a saber en cuál está y si ya ha pulsado.
  conectado(id) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = true;
    if (this.fase === null || this.terminado()) return;
    this.avisar(id, { type: 'reflex_wait', signal: this.senal + 1, signals: SENALES });
    if (j.actual) this.avisar(id, { type: 'reaction', ...j.actual });
  }

  desconectado(id) {
    const j = this.jugadores.get(id);
    if (j) j.conectado = false;
  }

  quitar(id) {
    this.jugadores.delete(id);
  }

  // De menos a más tiempo total; con el mismo total, comparten puesto.
  getResults() {
    const orden = [...this.jugadores].map(([id, j]) => ({ id, total: j.total })).sort((a, b) => a.total - b.total);
    return conPuestos(orden, (a, b) => a.total === b.total).map(({ id, puesto }) => ({ id, puesto }));
  }
}
