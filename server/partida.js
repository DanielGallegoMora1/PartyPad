// Partida de una sala: las rondas de minijuegos, sus fases y las puntuaciones (ver docs/02-arquitectura.md).
// Fases de cada ronda: instrucciones → cuenta → jugando → resultados. Tras la última ronda, podio.
import { MINIJUEGOS } from './minijuegos/index.js';
import { conPuestos } from './minijuegos/minijuego.js';

const T_INSTRUCCIONES = 5000;
const T_CUENTA = 3000;
const T_RESULTADOS = 8000;
const TICK = 50; // ms entre pasos de la simulación
const ENVIO = 100; // ms entre state_update a la pantalla
const PUNTOS = [10, 8, 6, 5, 4, 3, 2, 1]; // por puesto en la ronda

export class Partida {
  constructor(sala) {
    this.sala = sala;
    this.rondas = MINIJUEGOS;
    this.ronda = -1;
    this.fase = null; // instrucciones | cuenta | jugando | resultados | podio
    this.finFase = 0;
    this.juego = null;
    this.puntos = new Map([...sala.jugadores.keys()].map((id) => [id, 0]));
    this.resultados = []; // [{ id, place, points }] de la última ronda
    this.timer = null;
    this.intervalo = null;
  }

  empezar() {
    const msg = { type: 'game_start', rounds: this.rondas.map((M) => M.info()) };
    this.sala.aPantalla(msg);
    this.sala.aMandos(msg);
    this.siguienteRonda();
  }

  parar() {
    clearTimeout(this.timer);
    clearInterval(this.intervalo);
  }

  siguienteRonda() {
    this.ronda++;
    if (this.ronda >= this.rondas.length) return this.cambiarFase('podio');
    const M = this.rondas[this.ronda];
    this.juego = new M([...this.puntos.keys()], {
      vibrar: (id, ms) => this.sala.vibrarJugador(id, ms),
      avisar: (id, msg) => this.sala.aJugador(id, msg),
    });
    for (const j of this.sala.jugadores.values()) if (!j.socket) this.juego.desconectado(j.id);
    this.cambiarFase('instrucciones', T_INSTRUCCIONES, () => this.cambiarFase('cuenta', T_CUENTA, () => this.jugar()));
  }

  cambiarFase(fase, ms = 0, despues) {
    clearTimeout(this.timer);
    this.fase = fase;
    this.finFase = Date.now() + ms;
    if (despues) this.timer = setTimeout(despues, ms);
    this.avisarPantalla();
    for (const j of this.sala.jugadores.values()) this.avisarMando(j);
  }

  jugar() {
    this.cambiarFase('jugando');
    let anterior = Date.now();
    let ultimoEnvio = 0;
    this.intervalo = setInterval(() => {
      const ahora = Date.now();
      this.juego.avanzar((ahora - anterior) / 1000);
      anterior = ahora;
      if (this.juego.terminado()) return this.terminarRonda();
      if (ahora - ultimoEnvio >= ENVIO) {
        ultimoEnvio = ahora;
        this.sala.aPantalla(this.estado());
      }
    }, TICK);
  }

  estado() {
    return { type: 'state_update', ms: Math.round(this.juego.restante * 1000), ...this.juego.estado() };
  }

  terminarRonda() {
    clearInterval(this.intervalo);
    this.sala.aPantalla(this.estado());
    this.resultados = this.juego
      .getResults()
      .filter((r) => this.puntos.has(r.id))
      .map(({ id, puesto }) => ({ id, place: puesto, points: PUNTOS[puesto - 1] ?? 0 }));
    for (const r of this.resultados) this.puntos.set(r.id, this.puntos.get(r.id) + r.points);
    this.cambiarFase('resultados', T_RESULTADOS, () => this.siguienteRonda());
  }

  // Clasificación general: [{ id, total, place }] de más a menos puntos.
  clasificacion() {
    const orden = [...this.puntos].map(([id, total]) => ({ id, total })).sort((a, b) => b.total - a.total);
    return conPuestos(orden, (a, b) => a.total === b.total).map(({ id, total, puesto }) => ({ id, total, place: puesto }));
  }

  // Lo que se envía al cambiar de fase, y otra vez a quien se reconecta a mitad.
  base() {
    const M = this.rondas[this.ronda];
    return {
      round: this.ronda + 1,
      rounds: this.rondas.length,
      minigame: M?.info(),
      ms: Math.max(0, this.fase === 'jugando' ? Math.round(this.juego.restante * 1000) : this.finFase - Date.now()),
    };
  }

  avisarPantalla() {
    if (this.fase === 'podio') return this.sala.aPantalla({ type: 'podium', ranking: this.clasificacion() });
    const msg = { type: TIPOS[this.fase], ...this.base() };
    if (this.fase === 'jugando') Object.assign(msg, this.juego.estado());
    if (this.fase === 'resultados') {
      msg.last = this.ronda === this.rondas.length - 1;
      msg.results = this.resultados;
      msg.ranking = this.clasificacion();
    }
    this.sala.aPantalla(msg);
  }

  avisarMando(j) {
    const general = this.clasificacion().find((c) => c.id === j.id);
    if (!general) return;
    if (this.fase === 'podio') {
      return this.sala.aJugador(j.id, { type: 'podium', place: general.place, total: general.total });
    }
    const msg = { type: TIPOS[this.fase], ...this.base() };
    if (this.fase === 'resultados') {
      const r = this.resultados.find((r) => r.id === j.id);
      Object.assign(msg, { place: r?.place, points: r?.points ?? 0, total: general.total, overall: general.place });
    }
    this.sala.aJugador(j.id, msg);
  }

  entrada(id, entrada) {
    if (this.fase === 'jugando') this.juego.onInput(id, entrada);
  }

  conectado(j) {
    this.juego?.conectado(j.id);
    this.avisarMando(j);
  }

  desconectado(id) {
    this.juego?.desconectado(id);
  }

  quitar(id) {
    this.puntos.delete(id);
    this.juego?.quitar(id);
  }
}

const TIPOS = { instrucciones: 'round_intro', cuenta: 'countdown', jugando: 'round_start', resultados: 'round_end' };
