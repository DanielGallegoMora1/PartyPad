// Partida de una sala: las rondas de minijuegos, sus fases y las puntuaciones (ver docs/02-arquitectura.md).
// Fases de cada ronda: instrucciones → cuenta → jugando → resultados. Tras la última ronda, podio.
import { minijuegosPartida } from './minijuegos/index.js';
import { conPuestos } from './minijuegos/minijuego.js';
import { Medicion, medirLatencia } from './medidas.js';

const T_INSTRUCCIONES = 5000;
const T_CUENTA = 3000;
const T_RESULTADOS = 8000;
const TICK = 50; // ms entre pasos de la simulación
const PUNTOS = [15, 12, 10, 8, 7, 6, 5, 4, 3, 2, 1]; // por puesto en la ronda; del 12º en adelante, 0

// Fisher-Yates: cada partida, los minijuegos en un orden distinto.
function barajar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[k]] = [copia[k], copia[i]];
  }
  return copia;
}

export class Partida {
  // rondas: cuántos minijuegos se juegan (al azar y sin repetir); sin número, todos.
  constructor(sala, rondas) {
    this.sala = sala;
    const todos = barajar(minijuegosPartida(sala.packs));
    this.rondas = Number.isInteger(rondas) && rondas > 0 ? todos.slice(0, rondas) : todos;
    this.ronda = -1;
    this.fase = null; // instrucciones | cuenta | jugando | resultados | podio
    this.finFase = 0;
    this.juego = null;
    this.puntos = new Map([...sala.jugadores.keys()].map((id) => [id, 0]));
    this.resultados = []; // [{ id, place, points }] de la última ronda
    this.timer = null;
    this.intervalo = null;
    this.medicion = null; // tráfico de la ronda en juego, o de la última (ver medidas.js)
    this.pings = null;
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
    clearInterval(this.pings);
    this.medicion?.cerrar();
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
    const { id, control } = this.juego.constructor;
    this.medicion = new Medicion({ sala: this.sala.code, minijuego: id, control, jugadores: this.puntos.size });
    this.pings = medirLatencia(() => [...this.sala.jugadores.values()].map((j) => j.socket));
    let anterior = Date.now();
    let ultimoEnvio = 0;
    const { envio } = this.juego.constructor; // ms entre state_update a la pantalla
    this.intervalo = setInterval(() => {
      const ahora = Date.now();
      this.juego.avanzar((ahora - anterior) / 1000);
      anterior = ahora;
      if (this.juego.terminado()) return this.terminarRonda();
      // enviarAhora: el minijuego pide mandar ya el estado, sin esperar al siguiente envío (la señal de Reflejos).
      if (ahora - ultimoEnvio >= envio || this.juego.enviarAhora) {
        ultimoEnvio = ahora;
        this.juego.enviarAhora = false;
        this.enviarEstado();
      }
    }, TICK);
  }

  estado() {
    return { type: 'state_update', ms: Math.round(this.juego.restante * 1000), ...this.juego.estado() };
  }

  enviarEstado() {
    const msg = this.estado();
    this.medicion?.estado(msg);
    this.sala.aPantalla(msg);
  }

  terminarRonda() {
    clearInterval(this.intervalo);
    clearInterval(this.pings);
    this.enviarEstado();
    this.medicion.cerrar();
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
    // La pantalla recibe también el escenario del minijuego (lo que no cambia en la ronda) y su estado,
    // para dibujarlo desde las instrucciones o si se recarga a mitad.
    const msg = { type: TIPOS[this.fase], ...this.base(), setup: this.juego.escenario(), ...this.juego.estado() };
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
    // Si se reconecta tras llegar a la meta, que vea su puesto y no el control otra vez.
    const puesto = this.fase === 'jugando' && this.juego.puesto(j.id);
    if (puesto) this.sala.aJugador(j.id, { type: 'finished', place: puesto });
  }

  // bytes: tamaño del mensaje binario, para las mediciones.
  entrada(id, entrada, bytes) {
    if (this.fase !== 'jugando') return;
    this.juego.onInput(id, entrada);
    this.medicion?.entrada(id, bytes, entrada);
  }

  conectado(j) {
    this.avisarMando(j);
    // Después de la fase, para que el minijuego pueda reenviarle lo que haga falta (la señal de Reflejos).
    this.juego?.conectado(j.id);
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
