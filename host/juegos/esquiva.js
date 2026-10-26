// Esquiva en la pantalla: el campo visto desde arriba. Antes de cada meteorito aparece su sombra, que se oscurece
// mientras se cierra un anillo rojo; al caer, explota. Las bolas se interpolan entre mensajes del servidor.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { PANEL, TEXTO_SUAVE, estilo, ficha, jugadoresDe, texturas } from './comun.js';

const SUAVIZADO = 15;

export class Esquiva extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.mapa = inicio.setup ?? { width: 16, height: 9, ball: 0.4 };
    this.jugadores = jugadoresDe(jugadores, () => ({ x: null, y: null, fuera: false }));
    this.meteoritos = [];
    this.explotados = new Set(); // impactos ya animados
    this.objetos = [];
  }

  create() {
    texturas(this);
    this.construir();
    this.scale.on('resize', this.construir, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.construir, this));
    this.listo = true;
    this.actualizar(this.inicio, false);
  }

  px(x) {
    return this.ox + x * this.escala;
  }

  py(y) {
    return this.oy + y * this.escala;
  }

  construir() {
    for (const o of this.objetos) o.destroy();
    this.objetos = [];
    const { width, height } = this.scale;
    const reloj = 64;
    const margen = 24;
    this.escala = Math.min((width - 2 * margen) / this.mapa.width, (height - reloj - margen) / this.mapa.height);
    this.ox = (width - this.mapa.width * this.escala) / 2;
    this.oy = reloj + (height - reloj - margen - this.mapa.height * this.escala) / 2;

    const g = this.add.graphics();
    g.fillStyle(PANEL, 0.95).fillRoundedRect(this.ox, this.oy, this.mapa.width * this.escala, this.mapa.height * this.escala, 16);
    g.lineStyle(1, 0xffffff, 0.05);
    for (let x = 1; x < this.mapa.width; x++) g.lineBetween(this.px(x), this.oy, this.px(x), this.py(this.mapa.height));
    for (let y = 1; y < this.mapa.height; y++) g.lineBetween(this.ox, this.py(y), this.px(this.mapa.width), this.py(y));
    this.sombras = this.add.graphics();
    this.objetos.push(g, this.sombras);

    for (const j of this.jugadores.values()) {
      j.ficha = ficha(this, 0, 0, this.mapa.ball * this.escala, j).setVisible(false);
      if (j.x !== null) j.ficha.setPosition(this.px(j.x), this.py(j.y)).setVisible(true);
      j.ficha.setAlpha(j.fuera ? 0.25 : j.conectado ? 1 : 0.4);
      this.objetos.push(j.ficha);
    }
    this.contador = this.add.text(24, 20, '', estilo(Math.max(18, height * 0.03), TEXTO_SUAVE)).setOrigin(0);
    this.objetos.push(this.contador);
    this.pintarContador();
  }

  pintarContador() {
    this.contador.setText(`Quedan ${[...this.jugadores.values()].filter((j) => !j.fuera).length}`);
  }

  update(time, delta) {
    const k = 1 - Math.exp((-SUAVIZADO * delta) / 1000);
    for (const j of this.jugadores.values()) {
      if (j.fuera || j.x === null || !j.ficha?.visible) continue;
      j.ficha.x += (this.px(j.x) - j.ficha.x) * k;
      j.ficha.y += (this.py(j.y) - j.ficha.y) * k;
    }
    // Sombras: más oscuras y con el anillo más cerrado cuanto más cerca está el impacto.
    const g = this.sombras;
    g.clear();
    for (const m of this.meteoritos) {
      const r = m.r * this.escala;
      g.fillStyle(0x000000, 0.15 + 0.45 * m.t).fillCircle(this.px(m.x), this.py(m.y), r);
      g.lineStyle(4, 0xff5c5c, 0.9).strokeCircle(this.px(m.x), this.py(m.y), r * (1.6 - 0.6 * m.t));
    }
  }

  // players: [{ id, x, y, out }], meteors: [{ n, x, y, r, t }], impacts: [{ n, x, y, r }]
  actualizar({ players = [], meteors, impacts = [] }, animar = true) {
    if (!meteors) return;
    this.meteoritos = meteors;
    for (const p of players) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      const primera = j.x === null;
      j.x = p.x;
      j.y = p.y;
      if (primera && j.ficha) j.ficha.setPosition(this.px(j.x), this.py(j.y)).setVisible(true);
      if (p.out && !j.fuera) {
        j.fuera = true;
        if (j.ficha) this.tweens.add({ targets: j.ficha, alpha: 0.25, scale: 0.8, duration: 300 });
        this.pintarContador();
      }
    }
    for (const e of impacts) {
      if (this.explotados.has(e.n)) continue;
      this.explotados.add(e.n);
      if (animar) this.explotar(e);
    }
  }

  explotar(e) {
    const x = this.px(e.x);
    const y = this.py(e.y);
    const r = e.r * this.escala;
    const onda = this.add.circle(x, y, r, 0xffb547, 0.8);
    this.tweens.add({ targets: onda, scale: 1.4, alpha: 0, duration: 400, onComplete: () => onda.destroy() });
    const chispas = this.add.particles(x, y, 'punto', {
      emitting: false,
      lifespan: 500,
      speed: { min: 80, max: 260 },
      scale: { start: r / 60, end: 0 },
      tint: [0xff5a1f, 0xffb547, 0xffffff],
    });
    chispas.explode(20);
    this.time.delayedCall(600, () => chispas.destroy());
  }

  conexion(id, conectado) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = conectado;
    if (!j.fuera) j.ficha?.setAlpha(conectado ? 1 : 0.4);
  }

  quitar(id) {
    if (!this.jugadores.delete(id)) return;
    this.construir();
  }
}
