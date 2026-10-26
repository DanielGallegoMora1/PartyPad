// Sumo en la pantalla: una plataforma redonda sobre la lava que se va encogiendo, vista desde arriba. Las bolas se
// interpolan entre los mensajes del servidor; la que se sale cae a la lava encogiéndose.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { TEXTO_SUAVE, confeti, estilo, ficha, jugadoresDe, texturas } from './comun.js';

const SUAVIZADO = 15;

export class Sumo extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.mapa = inicio.setup ?? { radius: 6, ball: 0.55 };
    this.radio = this.mapa.radius; // el actual, que va encogiendo
    this.radioMostrado = this.radio;
    this.jugadores = jugadoresDe(jugadores, () => ({ x: null, y: null, fuera: false }));
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
    return this.cx + x * this.escala;
  }

  py(y) {
    return this.cy + y * this.escala;
  }

  construir() {
    for (const o of this.objetos) o.destroy();
    this.objetos = [];
    this.tweens.killAll();
    const { width, height } = this.scale;
    const reloj = 64;
    this.cx = width / 2;
    this.cy = reloj + (height - reloj) / 2;
    this.escala = Math.min(width * 0.9, height - reloj - 30) / (2 * this.mapa.radius * 1.12);

    // Lava alrededor: un brillo naranja que late.
    const lava = this.add.circle(this.cx, this.cy, this.mapa.radius * this.escala * 1.12, 0xff5a1f, 0.35);
    this.tweens.add({ targets: lava, alpha: 0.18, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.plataforma = this.add.graphics();
    this.objetos.push(lava, this.plataforma);

    for (const j of this.jugadores.values()) {
      j.ficha = ficha(this, 0, 0, this.mapa.ball * this.escala, j).setVisible(false);
      if (j.x !== null) j.ficha.setPosition(this.px(j.x), this.py(j.y)).setVisible(!j.fuera);
      j.ficha.setAlpha(j.conectado ? 1 : 0.4);
      this.objetos.push(j.ficha);
    }
    this.contador = this.add.text(24, 20, '', estilo(Math.max(18, height * 0.03), TEXTO_SUAVE)).setOrigin(0);
    this.objetos.push(this.contador);
    this.pintarPlataforma();
  }

  pintarPlataforma() {
    const r = this.radioMostrado * this.escala;
    const g = this.plataforma;
    g.clear();
    g.fillStyle(0x000000, 0.35).fillCircle(this.cx, this.cy + 8, r);
    g.fillStyle(0x3a2d7a).fillCircle(this.cx, this.cy, r);
    g.fillStyle(0x4b3c96).fillCircle(this.cx, this.cy, r * 0.82);
    g.lineStyle(6, 0xffb547, 0.9).strokeCircle(this.cx, this.cy, r);
    g.lineStyle(2, 0xffffff, 0.12).strokeCircle(this.cx, this.cy, r * 0.5);
    const dentro = [...this.jugadores.values()].filter((j) => !j.fuera).length;
    this.contador.setText(`Quedan ${dentro}`);
  }

  update(time, delta) {
    const k = 1 - Math.exp((-SUAVIZADO * delta) / 1000);
    if (Math.abs(this.radioMostrado - this.radio) > 0.001) {
      this.radioMostrado += (this.radio - this.radioMostrado) * k;
      this.pintarPlataforma();
    }
    for (const j of this.jugadores.values()) {
      if (j.fuera || j.x === null || !j.ficha?.visible) continue;
      j.ficha.x += (this.px(j.x) - j.ficha.x) * k;
      j.ficha.y += (this.py(j.y) - j.ficha.y) * k;
    }
  }

  // radius, players: [{ id, x, y, out }]
  actualizar({ radius, players = [] }, animar = true) {
    if (radius === undefined) return;
    this.radio = radius;
    let cae = false;
    for (const p of players) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      const primera = j.x === null;
      j.x = p.x;
      j.y = p.y;
      if (primera && j.ficha) j.ficha.setPosition(this.px(j.x), this.py(j.y)).setVisible(!p.out);
      if (p.out && !j.fuera) {
        j.fuera = true;
        cae = true;
        this.caer(j, animar);
      }
    }
    if (cae) this.pintarPlataforma();
  }

  caer(j, animar) {
    if (!j.ficha) return;
    if (!animar) return j.ficha.setVisible(false);
    this.tweens.add({ targets: j.ficha, scale: 0.1, alpha: 0, angle: 360, duration: 700, ease: 'Cubic.easeIn' });
    confeti(this, j.ficha.x, j.ficha.y, 0xff5a1f, 20);
    this.cameras.main.shake(150, 0.004);
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
