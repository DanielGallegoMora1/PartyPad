// Esquiva: caen meteoritos sobre el campo. Antes de cada impacto se ve en el suelo dónde va a caer; inclinando el
// móvil hay que apartarse. Quien recibe un impacto queda fuera. Cada vez caen más y más seguido.
import { Minijuego, conPuestos } from './minijuego.js';
import { chocarTodas, mover, puestosSupervivencia } from './fisica.js';

const ANCHO = 16;
const ALTO = 9;
const BOLA = 0.4;
const FISICA = { aceleracion: 14, roce: 1.6, velocidadMax: 7 };
const PASO = 0.01;
const AVISO = 1.2; // s entre que se ve la sombra y cae el meteorito
const CADA_INICIAL = 1.0; // s entre meteoritos al principio
const CADA_FINAL = 0.25; // y al final
const RADIO_MIN = 0.9;
const RADIO_MAX = 1.7;
const EXPLOSION = 0.5; // s que se ve la explosión

export class Esquiva extends Minijuego {
  static id = 'esquiva';
  static nombre = 'Esquiva meteoritos';
  static instrucciones = 'Inclina el móvil para esquivar los meteoritos. ¡Fíjate en las sombras del suelo!';
  static control = 'inclinar';
  static duracion = 40_000;
  static envio = 50;

  constructor(ids, opciones) {
    super(ids, opciones);
    const columnas = Math.ceil(Math.sqrt(ids.length * 2));
    const filas = Math.ceil(ids.length / columnas);
    this.jugadores = new Map(
      ids.map((id, i) => [
        id,
        {
          x: ((i % columnas) + 0.5) * (ANCHO / columnas),
          y: (Math.floor(i / columnas) + 0.5) * (ALTO / filas),
          vx: 0,
          vy: 0,
          inclinacion: { x: 0, y: 0 },
          fuera: null,
          conectado: true,
        },
      ]),
    );
    this.meteoritos = []; // { n, x, y, r, cae }
    this.explosiones = []; // { n, x, y, r, hasta }
    this.siguiente = 1.5;
    this.numero = 0;
  }

  onInput(id, entrada) {
    const j = this.jugadores.get(id);
    if (entrada.type !== 'tilt' || !j || j.fuera !== null) return;
    j.inclinacion = { x: entrada.x, y: entrada.y };
  }

  tick(dt) {
    const pasos = Math.max(1, Math.ceil(dt / PASO));
    for (let i = 0; i < pasos; i++) this.paso(dt / pasos);
    this.lanzar();
    this.explosiones = this.explosiones.filter((e) => e.hasta > this.tiempo);
  }

  paso(dt) {
    const dentro = [...this.jugadores.values()].filter((j) => j.fuera === null);
    for (const j of dentro) {
      mover(j, dt, FISICA);
      // Paredes del campo
      if (j.x < BOLA) [j.x, j.vx] = [BOLA, Math.abs(j.vx) * 0.4];
      if (j.x > ANCHO - BOLA) [j.x, j.vx] = [ANCHO - BOLA, -Math.abs(j.vx) * 0.4];
      if (j.y < BOLA) [j.y, j.vy] = [BOLA, Math.abs(j.vy) * 0.4];
      if (j.y > ALTO - BOLA) [j.y, j.vy] = [ALTO - BOLA, -Math.abs(j.vy) * 0.4];
    }
    chocarTodas(dentro, BOLA, 0.5);
  }

  // Meteoritos nuevos (la mitad, apuntando a alguien que siga dentro) e impactos de los que ya tocan.
  lanzar() {
    const progreso = Math.min(1, this.tiempo / this.limite);
    if (this.tiempo >= this.siguiente) {
      this.siguiente = this.tiempo + CADA_INICIAL - (CADA_INICIAL - CADA_FINAL) * progreso;
      const dentro = [...this.jugadores.values()].filter((j) => j.fuera === null);
      const r = RADIO_MIN + Math.random() * (RADIO_MAX - RADIO_MIN);
      const objetivo = dentro.length && Math.random() < 0.5 ? dentro[Math.floor(Math.random() * dentro.length)] : null;
      const x = objetivo ? objetivo.x + (Math.random() - 0.5) * 2 : Math.random() * ANCHO;
      const y = objetivo ? objetivo.y + (Math.random() - 0.5) * 2 : Math.random() * ALTO;
      this.meteoritos.push({ n: ++this.numero, x: Math.max(0, Math.min(ANCHO, x)), y: Math.max(0, Math.min(ALTO, y)), r, cae: this.tiempo + AVISO });
    }
    for (const m of this.meteoritos.filter((m) => m.cae <= this.tiempo)) {
      this.explosiones.push({ n: m.n, x: m.x, y: m.y, r: m.r, hasta: this.tiempo + EXPLOSION });
      for (const [id, j] of this.jugadores) {
        if (j.fuera !== null || Math.hypot(j.x - m.x, j.y - m.y) > m.r + BOLA * 0.6) continue;
        j.fuera = this.tiempo;
        j.inclinacion = { x: 0, y: 0 };
        this.vibrar(id, 400);
        this.avisar(id, { type: 'hint', title: '¡Te ha dado un meteorito!', text: 'Mira cómo acaba en la pantalla', mood: 'mal' });
      }
      this.enviarAhora = true;
    }
    this.meteoritos = this.meteoritos.filter((m) => m.cae > this.tiempo);
  }

  terminado() {
    const dentro = [...this.jugadores.values()].filter((j) => j.fuera === null && j.conectado).length;
    return super.terminado() || (this.jugadores.size > 1 && dentro <= 1) || (this.jugadores.size === 1 && dentro === 0);
  }

  escenario() {
    return { width: ANCHO, height: ALTO, ball: BOLA };
  }

  estado() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      players: [...this.jugadores].map(([id, j]) => ({ id, x: r(j.x), y: r(j.y), out: j.fuera !== null })),
      meteors: this.meteoritos.map((m) => ({ n: m.n, x: r(m.x), y: r(m.y), r: r(m.r), t: r(1 - (m.cae - this.tiempo) / AVISO) })),
      impacts: this.explosiones.map((e) => ({ n: e.n, x: r(e.x), y: r(e.y), r: r(e.r) })),
    };
  }

  conectado(id) {
    const j = this.jugadores.get(id);
    if (j) j.conectado = true;
  }

  desconectado(id) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = false;
    j.inclinacion = { x: 0, y: 0 };
  }

  quitar(id) {
    this.jugadores.delete(id);
  }

  getResults() {
    return puestosSupervivencia(this.jugadores, conPuestos);
  }
}
