// Machaca en la pantalla: un globo por jugador que se hincha con cada pulsación. El que va primero lleva corona.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { TEXTO, TEXTO_SUAVE, cara, estilo, jugadoresDe, rejilla, texturas, TEXTO_OSCURO } from './comun.js';

const LLENO = 70; // toques con los que el globo llega a su tamaño máximo
const SUAVIZADO = 10;

export class Machaca extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.jugadores = jugadoresDe(jugadores, () => ({ toques: 0, mostrado: 0 }));
    this.objetos = [];
  }

  create() {
    texturas(this);
    this.construir();
    this.scale.on('resize', this.construir, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.construir, this));
    this.listo = true;
    this.actualizar(this.inicio);
  }

  construir() {
    for (const o of this.objetos) o.destroy();
    this.objetos = [];
    const { width, height } = this.scale;
    const lista = [...this.jugadores.values()].sort((a, b) => a.id - b.id);
    const { posiciones, lado } = rejilla(lista.length, 20, 70, width - 40, height - 90, 8);
    this.lado = lado;
    lista.forEach((j, i) => {
      const { x, y } = posiciones[i];
      j.base = { x, y: y + lado * 0.1 };
      j.hilo = this.add.graphics();
      j.globo = this.add.container(x, y, [
        this.add.ellipse(0, 0, 100, 118, j.color),
        this.add.ellipse(0, 0, 30, 36, 0xffffff, 0.25),
        this.add.text(0, 0, cara(j), estilo(lado * 0.2, TEXTO_OSCURO, '700')).setOrigin(0.5),
      ]);
      j.nombre = this.add.text(x, y + lado * 0.42, j.name, estilo(Math.min(lado * 0.11, 22))).setOrigin(0.5);
      j.cuenta = this.add.text(x, y + lado * 0.42 + Math.min(lado * 0.13, 26), '0', estilo(Math.min(lado * 0.13, 26), TEXTO_SUAVE, '700')).setOrigin(0.5);
      j.corona = this.add.text(x, y, '👑', estilo(lado * 0.16)).setOrigin(0.5).setVisible(false);
      if (j.nombre.width > lado * 0.95) j.nombre.setScale((lado * 0.95) / j.nombre.width);
      this.objetos.push(j.hilo, j.globo, j.nombre, j.cuenta, j.corona);
      j.globo.setAlpha(j.conectado ? 1 : 0.4);
    });
    this.pintar();
  }

  // Tamaño del globo según los toques: crece rápido al principio y se va frenando.
  pintar() {
    const max = Math.max(1, ...[...this.jugadores.values()].map((j) => j.toques));
    for (const j of this.jugadores.values()) {
      if (!j.globo) continue;
      const lleno = Math.min(1, Math.sqrt(j.mostrado / LLENO));
      const ancho = this.lado * (0.18 + 0.5 * lleno);
      const [cuerpo, brillo, texto] = j.globo.list;
      cuerpo.setScale(ancho / 100);
      brillo.setScale(ancho / 100).setPosition(-ancho * 0.2, -ancho * 0.25);
      texto.setFontSize(Math.max(12, ancho * 0.42));
      const cima = j.base.y - this.lado * 0.08 - ancho * 0.59;
      j.globo.setPosition(j.base.x, cima + ancho * 0.59 - this.lado * 0.1);
      j.hilo.clear().lineStyle(2, 0xffffff, 0.4).lineBetween(j.base.x, j.globo.y + ancho * 0.59, j.base.x, j.base.y + this.lado * 0.3);
      j.corona.setVisible(j.toques > 0 && j.toques === max).setPosition(j.base.x, j.globo.y - ancho * 0.59 - this.lado * 0.08);
      j.cuenta.setText(String(j.toques));
    }
  }

  update(time, delta) {
    const k = 1 - Math.exp((-SUAVIZADO * delta) / 1000);
    let cambia = false;
    for (const j of this.jugadores.values()) {
      if (Math.abs(j.toques - j.mostrado) < 0.01) continue;
      j.mostrado += (j.toques - j.mostrado) * k;
      cambia = true;
    }
    if (cambia) this.pintar();
  }

  // players: [{ id, taps }]
  actualizar({ players = [] }) {
    for (const p of players) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      if (p.taps > j.toques && j.globo) this.tweens.add({ targets: j.globo, angle: { from: -4, to: 4 }, duration: 80, yoyo: true });
      j.toques = p.taps;
    }
    this.pintar();
  }

  conexion(id, conectado) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = conectado;
    j.globo?.setAlpha(conectado ? 1 : 0.4);
  }

  quitar(id) {
    if (!this.jugadores.delete(id)) return;
    this.construir();
  }
}
