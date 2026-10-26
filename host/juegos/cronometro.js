// Cronómetro en la pantalla: un reloj grande que se oculta a los pocos segundos. Abajo, cada jugador con una marca
// cuando ha parado. Al final se descubren los tiempos, ordenados de más cerca a más lejos del objetivo.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { MEDALLAS, TEXTO, TEXTO_OSCURO, TEXTO_SUAVE, confeti, estilo, ficha, jugadoresDe, rejilla, texturas } from './comun.js';

const segundos = (s) => s.toFixed(2).replace('.', ',');

export class Cronometro extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.objetivo = inicio.target ?? 7;
    this.tiempo = 0; // segundos que lleva la ronda según el servidor
    this.recibido = performance.now(); // cuándo llegó ese tiempo, para que el reloj avance suave entre mensajes
    this.oculto = false;
    this.hecho = false;
    this.jugadores = jugadoresDe(jugadores, () => ({ parado: false, at: null }));
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
    const cy = height * 0.3;
    const tam = Math.min(width * 0.14, height * 0.22);
    this.objetos.push(this.add.text(width / 2, cy - tam * 1.05, `Objetivo: ${segundos(this.objetivo)} s`, estilo(tam * 0.3, TEXTO_SUAVE)).setOrigin(0.5));
    this.reloj = this.add.text(width / 2, cy, '0,00', estilo(tam, TEXTO, '700')).setOrigin(0.5);
    this.aviso = this.add.text(width / 2, cy + tam * 0.85, '', estilo(tam * 0.28, '#ffb547')).setOrigin(0.5);
    this.objetos.push(this.reloj, this.aviso);

    const lista = [...this.jugadores.values()].sort((a, b) => a.id - b.id);
    const { posiciones, lado } = rejilla(lista.length, 20, height * 0.55, width - 40, height * 0.43, 8);
    lista.forEach((j, i) => {
      const { x, y } = posiciones[i];
      const r = lado * 0.22;
      j.ficha = ficha(this, x, y - lado * 0.12, r, j).setAlpha(j.conectado ? 1 : 0.4);
      j.nombre = this.add.text(x, y + lado * 0.16, j.name, estilo(Math.min(lado * 0.12, 22))).setOrigin(0.5);
      if (j.nombre.width > lado * 0.95) j.nombre.setScale((lado * 0.95) / j.nombre.width);
      j.resultado = this.add.text(x, y + lado * 0.32, '', estilo(Math.min(lado * 0.13, 24), TEXTO_SUAVE, '700')).setOrigin(0.5);
      j.marca = this.add.circle(x + r * 0.8, y - lado * 0.12 - r * 0.8, r * 0.38, 0x3ddc84).setVisible(false);
      j.marcaTexto = this.add.text(j.marca.x, j.marca.y, '✓', estilo(r * 0.5, TEXTO_OSCURO, '700')).setOrigin(0.5).setVisible(false);
      j.pos = { x, y };
      this.objetos.push(j.ficha, j.nombre, j.resultado, j.marca, j.marcaTexto);
    });
    this.pintar(false);
  }

  pintar(animar) {
    for (const j of this.jugadores.values()) {
      if (!j.ficha) continue;
      j.marca.setVisible(j.parado && !this.hecho);
      j.marcaTexto.setVisible(j.parado && !this.hecho);
      if (!this.hecho) {
        j.resultado.setText(j.parado ? '¡Parado!' : '…');
        continue;
      }
      if (j.at === null) {
        j.resultado.setText('Sin parar').setColor(TEXTO_SUAVE);
        continue;
      }
      const error = j.at - this.objetivo;
      j.resultado.setText(`${segundos(j.at)} s (${error >= 0 ? '+' : ''}${segundos(error)})`).setColor(TEXTO);
    }
    if (!this.hecho) return;
    // Los tres más cerca, con su medalla.
    const orden = [...this.jugadores.values()].filter((j) => j.at !== null).sort((a, b) => Math.abs(a.at - this.objetivo) - Math.abs(b.at - this.objetivo));
    orden.slice(0, 3).forEach((j, i) => {
      j.resultado.setColor(['#ffd23f', '#d9d9e8', '#e0975a'][i]);
      if (animar && i === 0) {
        this.tweens.add({ targets: j.ficha, scale: 1.25, duration: 250, yoyo: true, repeat: 1 });
        confeti(this, j.pos.x, j.pos.y, MEDALLAS[0], 50);
      }
    });
  }

  update() {
    if (!this.reloj) return;
    if (this.hecho) return;
    const t = this.tiempo + (performance.now() - this.recibido) / 1000;
    if (this.oculto) {
      this.reloj.setText('?,??');
      this.aviso.setText('¡Ahora a ciegas!');
    } else {
      this.reloj.setText(segundos(Math.max(0, t)));
    }
  }

  // time, hidden, done, players: [{ id, stopped, at }]
  actualizar({ time, hidden, done, players = [] }, animar = true) {
    if (time === undefined) return;
    this.tiempo = time;
    this.recibido = performance.now();
    this.oculto = hidden;
    const recienAcabado = done && !this.hecho;
    this.hecho = done;
    for (const p of players) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      if (p.stopped && !j.parado && animar && j.ficha) this.tweens.add({ targets: j.ficha, scale: 1.15, duration: 120, yoyo: true });
      j.parado = p.stopped;
      j.at = p.at;
    }
    if (recienAcabado) {
      this.reloj.setText(segundos(this.objetivo));
      this.aviso.setText('¿Quién se ha acercado más?');
    }
    this.pintar(recienAcabado && animar);
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
