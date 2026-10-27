// Ritmo en la pantalla: las notas bajan por un carril hasta la línea; al llegar suena la melodía. El reloj de la
// canción es el del servidor (time), avanzado aquí entre mensajes para que las notas bajen suaves.
// A la derecha, el marcador con los puntos, la racha y la última pulsación de cada uno.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { TEXTO, cara, estilo, jugadoresDe, texturas } from './comun.js';
import * as sonido from '../sonido.js';

const COLORES_NOTA = [0xff4d6d, 0xff8c42, 0xffd23f, 0x3ddc84, 0x2ec4b6, 0x4d96ff, 0xb388ff, 0xf15bb5];
const MARCAS = { perfecto: '✨', bien: '👍', vale: '👌', fallo: '❌' };

export class Ritmo extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.notas = inicio.setup?.notes ?? [];
    this.caida = inicio.setup?.fall ?? 1.8;
    this.tiempo = inicio.time ?? 0;
    this.corriendo = inicio.running ?? false;
    this.recibido = performance.now();
    this.sonadas = new Set();
    this.jugadores = jugadoresDe(jugadores, () => ({ puntos: 0, racha: 0, ultimo: null, n: 0 }));
    this.objetos = [];
    this.filas = [];
  }

  create() {
    texturas(this);
    this.construir();
    this.scale.on('resize', this.construir, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.construir, this));
    this.listo = true;
    // Las notas que ya habían pasado al montar la escena no suenan.
    for (const n of this.notas) if (n.t <= this.ahora()) this.sonadas.add(n.n);
    this.actualizar(this.inicio, false);
  }

  ahora() {
    if (!this.corriendo) return this.tiempo;
    return this.tiempo + (performance.now() - this.recibido) / 1000;
  }

  construir() {
    for (const o of [...this.objetos, ...this.filas]) o.destroy();
    this.objetos = [];
    this.filas = [];
    const { width, height } = this.scale;
    this.carril = { x: width * 0.32, w: Math.min(220, width * 0.16), arriba: 70, linea: height * 0.84 };
    const { x, w, arriba, linea } = this.carril;
    // Escenario: fondo oscuro, focos que laten con cada nota, altavoces a los lados y el carril de neón.
    const fondo = this.add.graphics();
    fondo.fillGradientStyle(0x2a0f4a, 0x2a0f4a, 0x07040f, 0x07040f, 1).fillRect(0, 0, width, height);
    this.focos = this.add.graphics();
    this.altavoces = [x - w / 2 - 90, x + w / 2 + 90].map((ax) => {
      const caja = this.add.container(ax, linea - 70, [
        this.add.rectangle(0, 0, 90, 140, 0x1a1a24).setStrokeStyle(3, 0x3a3a50),
        this.add.circle(0, -32, 22, 0x2a2a38).setStrokeStyle(4, 0x555570),
        this.add.circle(0, 30, 32, 0x2a2a38).setStrokeStyle(4, 0x555570),
      ]);
      return caja;
    });
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.5).fillRoundedRect(x - w / 2, arriba, w, height - arriba - 20, 16);
    g.lineStyle(4, 0x2ee6ff, 0.9).strokeRoundedRect(x - w / 2, arriba, w, height - arriba - 20, 16);
    g.lineStyle(10, 0x2ee6ff, 0.15).strokeRoundedRect(x - w / 2, arriba, w, height - arriba - 20, 16);
    g.lineStyle(8, 0xff4fb4, 1).lineBetween(x - w / 2 - 20, linea, x + w / 2 + 20, linea);
    g.lineStyle(20, 0xff4fb4, 0.2).lineBetween(x - w / 2 - 20, linea, x + w / 2 + 20, linea);
    this.objetos.push(fondo, this.focos, ...this.altavoces);
    this.pulso = 0;
    this.destello = this.add.rectangle(x, linea, w + 40, 26, 0xffd23f, 0);
    this.notasG = this.add.graphics();
    this.objetos.push(g, this.destello, this.notasG);
    this.marcadorX = width * 0.56;
    this.marcadorW = width * 0.4;
    this.pintarMarcador();
  }

  pintarMarcador() {
    for (const o of this.filas) o.destroy();
    this.filas = [];
    const { height } = this.scale;
    const lista = [...this.jugadores.values()].sort((a, b) => b.puntos - a.puntos || a.id - b.id);
    const fila = Math.min(46, (height - 100) / Math.max(6, lista.length));
    lista.forEach((j, i) => {
      const y = 90 + i * fila;
      const x = this.marcadorX;
      this.filas.push(
        this.add.circle(x + fila * 0.4, y, fila * 0.38, j.color).setAlpha(j.conectado ? 1 : 0.4),
        this.add.text(x + fila * 0.4, y, cara(j), estilo(fila * 0.42)).setOrigin(0.5),
        this.add.text(x + fila * 1.0, y, j.name, estilo(fila * 0.42)).setOrigin(0, 0.5),
        this.add.text(x + this.marcadorW * 0.55, y, j.racha > 2 ? `x${j.racha}` : '', estilo(fila * 0.4, '#ffb547', '700')).setOrigin(0, 0.5),
        this.add.text(x + this.marcadorW * 0.72, y, MARCAS[j.ultimo] ?? '', estilo(fila * 0.45)).setOrigin(0.5),
        this.add.text(x + this.marcadorW, y, String(j.puntos), estilo(fila * 0.48, TEXTO, '700')).setOrigin(1, 0.5),
      );
    });
  }

  update() {
    if (!this.notasG) return;
    const t = this.ahora();
    const { x, w, arriba, linea } = this.carril;
    // Focos y altavoces laten con la música.
    this.pulso = Math.max(0, this.pulso - 0.06);
    const f = this.focos;
    f.clear();
    const { width, height } = this.scale;
    for (const [i, color] of [[0, 0xff4fb4], [1, 0x2ee6ff], [2, 0xffd23f]]) {
      const ox = width * (0.15 + i * 0.35);
      const balanceo = Math.sin(t * 1.5 + i) * width * 0.08;
      f.fillStyle(color, 0.05 + this.pulso * 0.12).fillTriangle(ox, 0, ox + balanceo - 120, height, ox + balanceo + 120, height);
    }
    for (const a of this.altavoces) a.setScale(1 + this.pulso * 0.08);
    const g = this.notasG;
    g.clear();
    for (const n of this.notas) {
      const falta = n.t - t;
      if (falta > this.caida) break;
      if (falta < -0.3) continue;
      const y = linea - (falta / this.caida) * (linea - arriba);
      g.fillStyle(COLORES_NOTA[n.p % COLORES_NOTA.length], falta < 0 ? 0.3 : 1).fillRoundedRect(x - w / 2 + 10, y - 12, w - 20, 24, 12);
      if (falta <= 0 && !this.sonadas.has(n.n)) {
        this.sonadas.add(n.n);
        sonido.notaRitmo(n.p);
        this.pulso = 1;
        this.destello.setAlpha(0.6);
        this.tweens.add({ targets: this.destello, alpha: 0, duration: 160 });
      }
    }
  }

  // time, players: [{ id, score, combo, last, n }]
  actualizar({ time, running, players = [] }) {
    if (time === undefined) return;
    this.tiempo = time;
    this.corriendo = running;
    this.recibido = performance.now();
    let cambia = false;
    for (const p of players) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      if (j.puntos !== p.score || j.n !== p.n) cambia = true;
      Object.assign(j, { puntos: p.score, racha: p.combo, ultimo: p.last, n: p.n });
    }
    if (cambia) this.pintarMarcador();
  }

  conexion(id, conectado) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = conectado;
    this.pintarMarcador();
  }

  quitar(id) {
    if (!this.jugadores.delete(id)) return;
    this.pintarMarcador();
  }
}
