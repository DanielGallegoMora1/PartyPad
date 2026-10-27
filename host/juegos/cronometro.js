// Cronómetro en la pantalla: un cronómetro de los de toda la vida, con su aguja (una vuelta cada 10 s) y la marca
// del objetivo. A los pocos segundos se tapa con un «?». Abajo, cada jugador con una marca cuando ha parado. Al
// final se descubren los tiempos.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { MEDALLAS, TEXTO, TEXTO_OSCURO, TEXTO_SUAVE, confeti, estilo, ficha, jugadoresDe, rejilla, texturas } from './comun.js';
import * as sonido from '../sonido.js';

const VUELTA = 10; // s por vuelta de la aguja

const segundos = (s) => s.toFixed(2).replace('.', ',');

export class Cronometro extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.objetivo = inicio.target ?? 7;
    this.tiempo = 0; // segundos que lleva la ronda según el servidor
    this.recibido = performance.now(); // cuándo llegó ese tiempo, para que el reloj avance suave entre mensajes
    this.oculto = false;
    this.corriendo = inicio.running ?? false;
    this.ultimoSegundo = -1;
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
    // El cronómetro: caja metálica, botón arriba, esfera blanca con marcas y la del objetivo en rojo.
    const R = Math.min(height * 0.2, width * 0.13);
    const cx = width * 0.36;
    const cy = 64 + R * 1.25;
    this.esfera = { cx, cy, R };
    const g = this.add.graphics();
    g.fillStyle(0x9aa3b5).fillRoundedRect(cx - R * 0.16, cy - R * 1.32, R * 0.32, R * 0.22, 6);
    g.fillStyle(0xc9d1e0).fillRect(cx - R * 0.07, cy - R * 1.12, R * 0.14, R * 0.14);
    g.fillStyle(0x000000, 0.35).fillCircle(cx + 6, cy + 10, R * 1.04);
    g.fillStyle(0xb8c0d0).fillCircle(cx, cy, R * 1.04);
    g.fillStyle(0xfdfcf7).fillCircle(cx, cy, R * 0.94);
    for (let i = 0; i < 50; i++) {
      const a = (i / 50) * Math.PI * 2 - Math.PI / 2;
      const largo = i % 5 ? 0.06 : 0.13;
      g.lineStyle(i % 5 ? 2 : 4, 0x2b2b3a);
      g.lineBetween(cx + Math.cos(a) * R * 0.9, cy + Math.sin(a) * R * 0.9, cx + Math.cos(a) * R * (0.9 - largo), cy + Math.sin(a) * R * (0.9 - largo));
    }
    for (let n = 0; n < 10; n++) {
      const a = (n / 10) * Math.PI * 2 - Math.PI / 2;
      this.objetos.push(this.add.text(cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.66, String(n), estilo(R * 0.14, n === this.objetivo % VUELTA ? '#e8213f' : '#2b2b3a', '700')).setOrigin(0.5));
    }
    const ao = (this.objetivo / VUELTA) * Math.PI * 2 - Math.PI / 2;
    g.fillStyle(0xe8213f).fillCircle(cx + Math.cos(ao) * R * 0.86, cy + Math.sin(ao) * R * 0.86, R * 0.05);
    this.aguja = this.add.graphics();
    this.tapa = this.add.container(cx, cy, [this.add.circle(0, 0, R * 0.95, 0x2a1f52), this.add.text(0, 0, '?', estilo(R * 1.1, '#ffb547', '700')).setOrigin(0.5)]).setVisible(false);
    this.objetos.push(g, this.aguja, this.tapa);
    // A la derecha, el objetivo y la lectura digital.
    const tx = width * 0.66;
    this.objetos.push(this.add.text(tx, cy - R * 0.6, `Para en ${segundos(this.objetivo)} s`, estilo(R * 0.24, TEXTO_SUAVE, '700')).setOrigin(0.5));
    this.reloj = this.add.text(tx, cy, '0,00', estilo(R * 0.55, TEXTO, '700')).setOrigin(0.5);
    this.aviso = this.add.text(tx, cy + R * 0.6, '', estilo(R * 0.2, '#ffb547', '700')).setOrigin(0.5);
    this.objetos.push(this.reloj, this.aviso);

    const lista = [...this.jugadores.values()].sort((a, b) => a.id - b.id);
    const arriba = cy + R * 1.15;
    const { posiciones, lado } = rejilla(lista.length, 20, arriba, width - 40, height - arriba - 10, 8);
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
    const t = this.hecho ? this.objetivo : this.tiempo + (this.corriendo ? (performance.now() - this.recibido) / 1000 : 0);
    this.pintarAguja(this.oculto && !this.hecho ? null : t);
    this.tapa.setVisible(this.oculto && !this.hecho);
    if (this.hecho) return;
    if (this.oculto) {
      this.reloj.setText('?,??');
      this.aviso.setText('¡Ahora a ciegas!');
    } else {
      this.reloj.setText(segundos(Math.max(0, t)));
      // Tic-tac mientras se ve.
      const s = Math.floor(t * 2);
      if (this.corriendo && s !== this.ultimoSegundo) {
        this.ultimoSegundo = s;
        sonido.tic(s % 2 === 0);
      }
    }
  }

  pintarAguja(t) {
    const g = this.aguja;
    const { cx, cy, R } = this.esfera;
    g.clear();
    if (t === null) return;
    const a = (t / VUELTA) * Math.PI * 2 - Math.PI / 2;
    g.lineStyle(R * 0.04, 0xe8213f).lineBetween(cx - Math.cos(a) * R * 0.15, cy - Math.sin(a) * R * 0.15, cx + Math.cos(a) * R * 0.82, cy + Math.sin(a) * R * 0.82);
    g.fillStyle(0x2b2b3a).fillCircle(cx, cy, R * 0.07);
  }

  // time, hidden, done, players: [{ id, stopped, at }]
  actualizar({ time, hidden, done, running, players = [] }, animar = true) {
    if (time === undefined) return;
    this.tiempo = time;
    this.corriendo = running;
    this.recibido = performance.now();
    this.oculto = hidden;
    const recienAcabado = done && !this.hecho;
    this.hecho = done;
    for (const p of players) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      if (p.stopped && !j.parado && animar && j.ficha) {
        this.tweens.add({ targets: j.ficha, scale: 1.15, duration: 120, yoyo: true });
        sonido.pulsacion();
      }
      j.parado = p.stopped;
      j.at = p.at;
    }
    if (recienAcabado) {
      this.reloj.setText(segundos(this.objetivo));
      this.aviso.setText('¿Quién se ha acercado más?');
      if (animar) {
        sonido.redoble(0.9);
        this.time.delayedCall(950, () => sonido.tadan());
      }
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
