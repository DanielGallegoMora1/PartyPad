// Esquiva en la pantalla: la superficie de un planeta de noche, vista desde arriba. Cada meteorito se ve caer en
// diagonal con su cola de fuego mientras su sombra crece en el suelo; al caer, explota y deja un cráter.
// Las bolas se interpolan entre mensajes del servidor.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { estilo, ficha, jugadoresDe, texturas } from './comun.js';
import * as sonido from '../sonido.js';

const SUAVIZADO = 15;

export class Esquiva extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.mapa = inicio.setup ?? { width: 16, height: 9, ball: 0.4 };
    this.jugadores = jugadoresDe(jugadores, () => ({ x: null, y: null, fuera: false }));
    this.meteoritos = [];
    this.explotados = new Set(); // impactos ya animados
    this.vistos = new Set(); // meteoritos que ya han sonado al aparecer
    this.crateres = []; // donde ya ha caído alguno, para dibujarlos al redimensionar
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

    // Cielo con estrellas y, encima, el suelo rocoso del planeta.
    const g = this.add.graphics();
    g.fillGradientStyle(0x070a24, 0x070a24, 0x2a1a4a, 0x2a1a4a, 1).fillRect(0, 0, width, height);
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
    for (let i = 0; i < 120; i++) g.fillStyle(0xffffff, 0.3 + azar() * 0.6).fillCircle(azar() * width, azar() * height, azar() * 1.8 + 0.4);
    const w = this.mapa.width * this.escala;
    const h = this.mapa.height * this.escala;
    g.fillStyle(0x000000, 0.4).fillRoundedRect(this.ox + 6, this.oy + 10, w, h, 22);
    g.fillStyle(0x5a4a6e).fillRoundedRect(this.ox, this.oy, w, h, 22);
    for (let i = 0; i < 40; i++) {
      g.fillStyle(azar() < 0.5 ? 0x4c3e60 : 0x6a5a80, 0.8);
      g.fillEllipse(this.ox + 20 + azar() * (w - 40), this.oy + 20 + azar() * (h - 40), 10 + azar() * 30, 6 + azar() * 16);
    }
    this.marcas = this.add.graphics(); // cráteres
    this.sombras = this.add.graphics();
    this.rocas = this.add.graphics(); // los meteoritos en el aire, encima de todo
    this.objetos.push(g, this.marcas, this.sombras);
    for (const c of this.crateres) this.crater(c);

    for (const j of this.jugadores.values()) {
      j.ficha = ficha(this, 0, 0, this.mapa.ball * this.escala, j).setVisible(false);
      if (j.x !== null) j.ficha.setPosition(this.px(j.x), this.py(j.y)).setVisible(true);
      j.ficha.setAlpha(j.fuera ? 0.25 : j.conectado ? 1 : 0.4);
      this.objetos.push(j.ficha);
    }
    this.contador = this.add.text(24, 20, '', estilo(Math.max(18, height * 0.03), '#d9d2ff')).setOrigin(0);
    this.objetos.push(this.rocas, this.contador);
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
    // Sombras: más oscuras y con el anillo más cerrado cuanto más cerca está el impacto. El meteorito baja en
    // diagonal desde arriba a la derecha hasta su sombra, con una cola de fuego.
    const g = this.sombras;
    const rocas = this.rocas;
    g.clear();
    rocas.clear();
    for (const m of this.meteoritos) {
      const r = m.r * this.escala;
      const x = this.px(m.x);
      const y = this.py(m.y);
      g.fillStyle(0x000000, 0.15 + 0.45 * m.t).fillCircle(x, y, r);
      g.lineStyle(4, 0xff5c5c, 0.9).strokeCircle(x, y, r * (1.6 - 0.6 * m.t));
      const falta = 1 - m.t;
      const mx = x + falta * this.escala * 5;
      const my = y - falta * this.escala * 9;
      const tam = r * (0.35 + 0.25 * m.t);
      for (let k = 6; k >= 1; k--) {
        rocas.fillStyle(k > 3 ? 0xff5a1f : 0xffb547, 0.12 * (7 - k));
        rocas.fillCircle(mx + k * tam * 0.45, my - k * tam * 0.8, tam * (1 - k * 0.1));
      }
      rocas.fillStyle(0x6b4a3a).fillCircle(mx, my, tam);
      rocas.fillStyle(0x8a6a52).fillCircle(mx - tam * 0.3, my - tam * 0.3, tam * 0.4);
    }
  }

  // players: [{ id, x, y, out }], meteors: [{ n, x, y, r, t }], impacts: [{ n, x, y, r }]
  actualizar({ players = [], meteors, impacts = [] }, animar = true) {
    if (!meteors) return;
    this.meteoritos = meteors;
    for (const m of meteors) {
      if (this.vistos.has(m.n)) continue;
      this.vistos.add(m.n);
      if (animar) sonido.silbidoCaida();
    }
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

  crater(e) {
    const r = e.r * this.escala * 0.8;
    this.marcas.fillStyle(0x3a2e4a, 0.9).fillEllipse(this.px(e.x), this.py(e.y), r * 2, r * 1.6);
    this.marcas.fillStyle(0x2a2036, 0.9).fillEllipse(this.px(e.x), this.py(e.y) + r * 0.1, r * 1.4, r * 1.1);
  }

  explotar(e) {
    const x = this.px(e.x);
    const y = this.py(e.y);
    const r = e.r * this.escala;
    this.crateres.push(e);
    this.crater(e);
    sonido.impacto();
    this.cameras.main.shake(120, 0.004);
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
