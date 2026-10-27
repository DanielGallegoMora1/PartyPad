// Patata caliente en la pantalla: los jugadores en corro y la bomba en el centro, apuntando a quien la tiene.
// Cuanto más quemada está la mecha, más rápido late la bomba. Al explotar, el jugador queda en gris.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { TEXTO_SUAVE, confeti, estilo, ficha, jugadoresDe, texturas } from './comun.js';
import * as sonido from '../sonido.js';

export class Patata extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.portador = null;
    this.mecha = 0;
    this.explosion = 0; // número de la última explosión animada
    this.jugadores = jugadoresDe(jugadores, () => ({ fuera: false }));
    this.objetos = [];
  }

  create() {
    texturas(this);
    this.construir();
    this.scale.on('resize', this.construir, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.construir, this));
    this.listo = true;
    this.explosion = this.inicio.boom?.n ?? 0; // las anteriores no se vuelven a animar
    this.actualizar(this.inicio, false);
  }

  construir() {
    for (const o of this.objetos) o.destroy();
    this.objetos = [];
    this.tweens.killAll();
    const { width, height } = this.scale;
    const reloj = 64;
    this.cx = width / 2;
    this.cy = reloj + (height - reloj) / 2;
    const lista = [...this.jugadores.values()].sort((a, b) => a.id - b.id);
    const radio = Math.min(width * 0.38, (height - reloj) * 0.4);
    const r = Math.min(radio * 0.16, 46);
    lista.forEach((j, i) => {
      const a = -Math.PI / 2 + (i / lista.length) * Math.PI * 2;
      j.pos = { x: this.cx + Math.cos(a) * radio, y: this.cy + Math.sin(a) * radio * 0.85 };
      j.ficha = ficha(this, j.pos.x, j.pos.y, r, j).setAlpha(j.fuera ? 0.25 : 1);
      j.nombre = this.add.text(j.pos.x, j.pos.y + r * 1.35, j.name, estilo(Math.max(14, r * 0.42))).setOrigin(0.5).setAlpha(j.fuera ? 0.3 : 1);
      j.cruz = this.add.text(j.pos.x, j.pos.y, '💥', estilo(r * 1.2)).setOrigin(0.5).setVisible(j.fuera);
      this.objetos.push(j.ficha, j.nombre, j.cruz);
    });
    // Un halo naranja detrás de la bomba, que si no se pierde sobre el fondo oscuro.
    this.halo = this.add.circle(this.cx, this.cy, Math.min(radio * 0.3, 85), 0xff8c42, 0.35);
    this.bomba = this.add.text(this.cx, this.cy, '💣', estilo(Math.min(radio * 0.42, 120))).setOrigin(0.5);
    this.chispa = this.add.circle(0, 0, 8, 0xffd23f).setVisible(false);
    this.pases = this.add.text(24, 20, '', estilo(Math.max(18, height * 0.03), TEXTO_SUAVE)).setOrigin(0);
    this.objetos.push(this.halo, this.bomba, this.chispa, this.pases);
    this.colocarBomba(false);
  }

  // La bomba va junto a quien la tiene, un poco hacia el centro.
  colocarBomba(animar) {
    const j = this.jugadores.get(this.portador);
    const destino = j ? { x: j.pos.x + (this.cx - j.pos.x) * 0.3, y: j.pos.y + (this.cy - j.pos.y) * 0.3 } : { x: this.cx, y: this.cy };
    this.bomba.setVisible(this.portador !== null);
    if (animar) this.tweens.add({ targets: this.bomba, x: destino.x, y: destino.y, duration: 180, ease: 'Quad.easeOut' });
    else this.bomba.setPosition(destino.x, destino.y);
  }

  update(time) {
    if (!this.bomba) return;
    this.halo?.setPosition(this.bomba.x, this.bomba.y).setVisible(this.bomba.visible);
    if (!this.bomba?.visible) return this.chispa?.setVisible(false);
    // Late más deprisa cuanto más quemada está la mecha.
    const ritmo = 2 + this.mecha * 10;
    this.bomba.setScale(1 + 0.08 * Math.sin((time / 1000) * ritmo * Math.PI));
    this.halo.setScale(1 + 0.15 * Math.sin((time / 1000) * ritmo * Math.PI)).setAlpha(0.25 + 0.35 * this.mecha);
    this.chispa.setVisible(true).setPosition(this.bomba.x + this.bomba.displayWidth * 0.28, this.bomba.y - this.bomba.displayHeight * 0.38);
    this.chispa.setRadius(5 + Math.random() * 5);
  }

  // holder, fuse, passes, boom: { n, id }, players: [{ id, out }]
  actualizar({ holder, fuse = 0, passes = 0, boom, players = [] }, animar = true) {
    if (holder === undefined) return;
    this.mecha = fuse;
    this.pases?.setText(`Pases: ${passes}`);
    for (const p of players) {
      const j = this.jugadores.get(p.id);
      if (!j || j.fuera === p.out) continue;
      j.fuera = p.out;
      j.ficha?.setAlpha(p.out ? 0.25 : 1);
      j.nombre?.setAlpha(p.out ? 0.3 : 1);
      j.cruz?.setVisible(p.out);
    }
    if (boom && boom.n > this.explosion) {
      this.explosion = boom.n;
      const j = this.jugadores.get(boom.id);
      if (animar && j?.pos) {
        this.cameras.main.shake(300, 0.012);
        this.cameras.main.flash(200, 255, 140, 60);
        confeti(this, j.pos.x, j.pos.y, 0xff5a1f, 60);
        sonido.pronto();
      }
    }
    if (holder !== this.portador) {
      this.portador = holder;
      this.colocarBomba(animar);
      if (animar && holder !== null) sonido.pulsacion();
    }
  }

  conexion(id, conectado) {
    const j = this.jugadores.get(id);
    if (!j || j.fuera) return;
    j.ficha?.setAlpha(conectado ? 1 : 0.4);
  }

  quitar(id) {
    if (!this.jugadores.delete(id)) return;
    this.construir();
  }
}
