// Tira y afloja en la pantalla: un prado con un charco de barro en medio y la cuerda de lado a lado. Cada equipo
// tira desde su lado, con sus jugadores en fila; cuanto más agitan, más tiemblan. El nudo se interpola entre
// mensajes del servidor. Al que pierde, al barro.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { TEXTO, estilo, ficha, jugadoresDe, numero, texturas, confeti } from './comun.js';
import * as sonido from '../sonido.js';

const SUAVIZADO = 8;

export class Tira extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.cuerda = 0;
    this.mostrada = 0;
    this.ganador = null;
    this.equipos = inicio.teams ?? [{ nombre: 'Fuego', color: '#ff5a3c' }, { nombre: 'Hielo', color: '#3ca8ff' }];
    this.jugadores = jugadoresDe(jugadores, () => ({ equipo: null, intensidad: 0 }));
    for (const p of inicio.players ?? []) {
      const j = this.jugadores.get(p.id);
      if (j) j.equipo = p.team;
    }
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

  construir() {
    for (const o of this.objetos) o.destroy();
    this.objetos = [];
    const { width, height } = this.scale;
    this.ancho = width;
    this.yCuerda = height * 0.45;
    this.recorrido = width * 0.3; // lo que se mueve el nudo de 0 a ±1

    // Cielo, prado con franjas de césped, el charco de barro en el centro y un banderín de cada equipo.
    const g = this.add.graphics();
    g.fillGradientStyle(0x7ec8ff, 0x7ec8ff, 0xc8ecff, 0xc8ecff, 1).fillRect(0, 0, width, this.yCuerda - 70);
    g.fillStyle(0x5cb85c).fillRect(0, this.yCuerda - 70, width, height);
    for (let x = 0; x < width; x += 80) g.fillStyle(0x52a852, 0.7).fillRect(x, this.yCuerda - 70, 40, height);
    g.fillStyle(0x6b4423).fillEllipse(width / 2, this.yCuerda + 10, this.recorrido * 1.5, 120);
    g.fillStyle(0x7d5530).fillEllipse(width / 2, this.yCuerda + 6, this.recorrido * 1.3, 90);
    g.fillStyle(0x8f6538, 0.8);
    for (let i = 0; i < 6; i++) g.fillCircle(width / 2 - this.recorrido * 0.5 + i * this.recorrido * 0.2, this.yCuerda + 20 - (i % 2) * 18, 6 + (i % 3) * 3);
    this.equipos.forEach((e, i) => {
      const xb = i ? width - 60 : 60;
      g.fillStyle(0x6b4423).fillRect(xb - 3, this.yCuerda - 150, 6, 110);
      g.fillStyle(numero(e.color)).fillTriangle(xb + 3 * (i ? -1 : 1), this.yCuerda - 150, xb + 3 * (i ? -1 : 1), this.yCuerda - 110, xb + (i ? -50 : 50), this.yCuerda - 130);
      const x = width / 2 + (i ? 1 : -1) * this.recorrido;
      g.lineStyle(4, numero(e.color), 0.7).lineBetween(x, this.yCuerda - 90, x, this.yCuerda + 90);
      this.objetos.push(this.add.text(i ? width - 30 : 30, 84, e.nombre, { ...estilo(Math.max(26, height * 0.05), e.color, '700'), stroke: '#ffffff', strokeThickness: 6 }).setOrigin(i ? 1 : 0, 0));
    });
    g.lineStyle(3, 0xffffff, 0.6).lineBetween(width / 2, this.yCuerda - 60, width / 2, this.yCuerda + 60);
    this.cuerdaG = this.add.graphics();
    this.nudo = this.add.circle(width / 2, this.yCuerda, 16, 0xffd23f).setStrokeStyle(4, 0x1a0f2e);
    this.objetos.push(g, this.cuerdaG, this.nudo);

    // Los jugadores de cada equipo, en fila detrás de su extremo de la cuerda.
    for (const equipo of [0, 1]) {
      const lista = [...this.jugadores.values()].filter((j) => j.equipo === equipo).sort((a, b) => a.id - b.id);
      const r = Math.min(34, (height * 0.42) / Math.max(4, lista.length));
      lista.forEach((j, i) => {
        const columna = Math.floor(i / 4);
        const fila = i % 4;
        j.base = {
          x: equipo === 0 ? width * 0.12 + columna * r * 2.6 : width * 0.88 - columna * r * 2.6,
          y: this.yCuerda + 90 + fila * r * 2.4,
        };
        j.ficha = ficha(this, j.base.x, j.base.y, r, j).setAlpha(j.conectado ? 1 : 0.4);
        this.objetos.push(j.ficha);
      });
    }
    this.cartel = this.add.text(width / 2, height * 0.25, '', { ...estilo(Math.max(36, height * 0.08), TEXTO, '700'), stroke: '#1a0f2e', strokeThickness: 8 }).setOrigin(0.5);
    this.objetos.push(this.cartel);
    this.pintar();
  }

  pintar() {
    const x = this.ancho / 2 + this.mostrada * this.recorrido;
    const g = this.cuerdaG;
    g.clear();
    g.lineStyle(10, 0xc8a165).lineBetween(this.ancho * 0.08, this.yCuerda, this.ancho * 0.92, this.yCuerda);
    g.lineStyle(3, 0x8a6a3a, 0.8);
    for (let k = this.ancho * 0.08; k < this.ancho * 0.92; k += 18) g.lineBetween(k, this.yCuerda - 5, k + 9, this.yCuerda + 5);
    this.nudo.setPosition(x, this.yCuerda);
  }

  update(time, delta) {
    const k = 1 - Math.exp((-SUAVIZADO * delta) / 1000);
    this.mostrada += (this.cuerda - this.mostrada) * k;
    this.pintar();
    // Gruñidos de esfuerzo de vez en cuando, más seguidos cuanto más agitan.
    const fuerza = [...this.jugadores.values()].reduce((a, j) => a + j.intensidad, 0) / Math.max(1, this.jugadores.size);
    if (this.ganador === null && Math.random() < fuerza * delta * 0.004) sonido.tirar();
    for (const j of this.jugadores.values()) {
      if (!j.ficha || !j.base) continue;
      const t = j.intensidad * 6;
      j.ficha.setPosition(j.base.x + (Math.random() - 0.5) * t, j.base.y + (Math.random() - 0.5) * t);
    }
  }

  // rope, winner, players: [{ id, team, intensity }]
  actualizar({ rope, winner, players = [] }, animar = true) {
    if (rope === undefined) return;
    this.cuerda = rope;
    let reconstruir = false;
    for (const p of players) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      if (j.equipo !== p.team) reconstruir = true;
      j.equipo = p.team;
      j.intensidad = p.intensity;
    }
    if (reconstruir) this.construir();
    if (winner !== null && winner !== undefined && this.ganador === null) {
      this.ganador = winner;
      const e = this.equipos[winner];
      this.cartel.setText(`¡Gana ${e.nombre}!`).setColor(e.color);
      if (animar) {
        confeti(this, this.ancho / 2 + (winner ? 1 : -1) * this.recorrido, this.yCuerda, numero(e.color), 80);
        sonido.bocina();
        // Los que pierden caen al barro.
        for (const j of this.jugadores.values()) {
          if (j.equipo === winner || !j.ficha) continue;
          j.base = { x: this.ancho / 2 + (Math.random() - 0.5) * this.recorrido * 0.8, y: this.yCuerda + 10 + (Math.random() - 0.5) * 40 };
          this.tweens.add({ targets: j.ficha, scale: 0.8, duration: 400 });
        }
      }
    }
  }

  conexion(id, conectado) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = conectado;
    j.ficha?.setAlpha(conectado ? 1 : 0.4);
  }

  quitar(id) {
    if (!this.jugadores.delete(id)) return;
    this.construir();
  }
}
