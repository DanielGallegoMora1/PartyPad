// Sumo en la pantalla: un dohyō (el ring del sumo) visto desde arriba. La tarima de arcilla está sobre un suelo de
// madera y el anillo de paja (tawara) se va encogiendo. Las bolas se interpolan entre los mensajes del servidor;
// la que se sale cae de la tarima levantando arena.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { confeti, estilo, ficha, jugadoresDe, texturas } from './comun.js';
import * as sonido from '../sonido.js';

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
    sonido.gong();
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
    this.escala = Math.min(width * 0.9, height - reloj - 30) / (2 * this.mapa.radius * 1.22); // con la tarima entera

    // Suelo de tablas de madera, la tarima cuadrada de arcilla y cuatro linternas en las esquinas.
    const suelo = this.add.graphics();
    suelo.fillStyle(0x4a2e1a).fillRect(0, 0, width, height);
    for (let x = 0; x < width; x += 90) suelo.fillStyle(x % 180 ? 0x553520 : 0x4f311c).fillRect(x, 0, 88, height);
    const lado = this.mapa.radius * this.escala * 2.35;
    suelo.fillStyle(0x000000, 0.35).fillRect(this.cx - lado / 2 + 10, this.cy - lado / 2 + 14, lado, lado);
    suelo.fillStyle(0xc9a067).fillRect(this.cx - lado / 2, this.cy - lado / 2, lado, lado);
    suelo.lineStyle(6, 0x8a6a3a).strokeRect(this.cx - lado / 2, this.cy - lado / 2, lado, lado);
    this.objetos.push(suelo);
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x = this.cx + dx * (lado / 2 + 50);
      const y = this.cy + dy * (lado / 2 - 30);
      if (x < 30 || x > width - 30) continue;
      const luz = this.add.circle(x, y, 26, 0xffb547, 0.25);
      this.tweens.add({ targets: luz, scale: 1.3, alpha: 0.1, duration: 1200 + dx * 200, yoyo: true, repeat: -1 });
      this.objetos.push(luz, this.add.ellipse(x, y, 30, 40, 0xe8452c).setStrokeStyle(3, 0x2b1a0c), this.add.text(x, y, '力', estilo(16, '#2b1a0c', '700')).setOrigin(0.5));
    }
    this.plataforma = this.add.graphics();
    this.objetos.push(this.plataforma);

    for (const j of this.jugadores.values()) {
      j.ficha = ficha(this, 0, 0, this.mapa.ball * this.escala, j).setVisible(false);
      if (j.x !== null) j.ficha.setPosition(this.px(j.x), this.py(j.y)).setVisible(!j.fuera);
      j.ficha.setAlpha(j.conectado ? 1 : 0.4);
      this.objetos.push(j.ficha);
    }
    this.contador = this.add.text(24, 20, '', { ...estilo(Math.max(18, height * 0.03), '#fff3d6'), stroke: '#2b1a0c', strokeThickness: 4 }).setOrigin(0);
    this.objetos.push(this.contador);
    this.pintarPlataforma();
  }

  pintarPlataforma() {
    const r = this.radioMostrado * this.escala;
    const g = this.plataforma;
    g.clear();
    // Arena dentro del anillo, el anillo de paja con sus nudos y las dos líneas blancas de salida.
    g.fillStyle(0xe2c48e).fillCircle(this.cx, this.cy, r);
    g.fillStyle(0xd9b97f).fillCircle(this.cx, this.cy, r * 0.6);
    g.lineStyle(Math.max(8, r * 0.07), 0x9c7a3c).strokeCircle(this.cx, this.cy, r);
    g.lineStyle(Math.max(3, r * 0.025), 0x6b5226);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      g.lineBetween(this.cx + c * r * 0.96, this.cy + s * r * 0.96, this.cx + c * r * 1.04, this.cy + s * r * 1.04);
    }
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(this.cx - r * 0.25, this.cy - r * 0.12, r * 0.06, r * 0.24);
    g.fillRect(this.cx + r * 0.19, this.cy - r * 0.12, r * 0.06, r * 0.24);
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
    confeti(this, j.ficha.x, j.ficha.y, 0xd9b97f, 25); // arena
    this.cameras.main.shake(150, 0.004);
    sonido.silbidoCaida();
    this.time.delayedCall(600, () => sonido.impacto());
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
