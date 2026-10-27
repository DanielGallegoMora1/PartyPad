// Reflejos en la pantalla: un duelo del Oeste. Del cielo del atardecer cuelga un cartel de madera que pone
// «ESPERA…» y, con la señal, se pone verde con un «¡YA!» y un disparo. Cada jugador es un cartel de «SE BUSCA»
// con su tiempo. La señal se muestra en cuanto llega el estado: aquí no se interpola nada, porque cualquier
// retraso en la pantalla es tiempo de reacción que se les cuenta a los jugadores.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import * as sonido from '../sonido.js';
import { cara, confeti, estilo, jugadoresDe, texturas } from './comun.js';

const MADERA = 0x8b5a2b;
const MADERA_OSCURA = 0x5c3a1a;
const PAPEL = 0xf3dfb2;
const TINTA = '#4a2c12';
const VERDE = 0x3ddc84;
const ROJO_TEXTO = '#b3261e';
const segundos = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;

export class Reflejos extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.fase = null; // preparados | espera | ya | pausa
    this.senal = 0;
    this.senales = inicio.signals ?? 5;
    this.ganador = null;
    this.jugadores = jugadoresDe(jugadores, () => ({ ms: null, early: false, missed: false, total: 0 }));
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
    this.tweens.killAll();
    this.balanceo = null;
    const { width, height } = this.scale;
    const horizonte = height * (this.jugadores.size > 8 ? 0.5 : 0.6);

    // Cielo del atardecer, sol, mesetas, suelo y cactus.
    const g = this.add.graphics();
    g.fillGradientStyle(0x3b1f6e, 0x3b1f6e, 0xf28c50, 0xf28c50, 1).fillRect(0, 0, width, horizonte);
    g.fillStyle(0xffd27a, 0.9).fillCircle(width * 0.78, horizonte - height * 0.05, height * 0.11);
    g.fillStyle(0x7a3b2e);
    g.fillPoints([{ x: 0, y: horizonte }, { x: 0, y: horizonte - height * 0.12 }, { x: width * 0.12, y: horizonte - height * 0.12 }, { x: width * 0.16, y: horizonte }], true);
    g.fillPoints([{ x: width * 0.55, y: horizonte }, { x: width * 0.6, y: horizonte - height * 0.09 }, { x: width * 0.72, y: horizonte - height * 0.09 }, { x: width * 0.76, y: horizonte }], true);
    g.fillStyle(0xd9a35f).fillRect(0, horizonte, width, height - horizonte);
    g.fillStyle(0xc48a4a, 0.6);
    for (let i = 0; i < 18; i++) g.fillEllipse((i * 137) % width, horizonte + ((i * 53) % (height - horizonte)), 40, 6);
    this.cactus(g, width * 0.08, horizonte + 10, height * 0.16);
    this.cactus(g, width * 0.93, horizonte + 30, height * 0.12);
    this.destello = this.add.rectangle(0, 0, width, height, VERDE, 0).setOrigin(0);
    this.objetos.push(g, this.destello);

    // Cartel de madera colgando de dos cuerdas.
    const ancho = Math.min(width * 0.42, 560);
    const alto = Math.min(horizonte * 0.42, 200);
    const cy = 70 + alto * 0.62;
    const cuerdas = this.add.graphics();
    cuerdas.lineStyle(4, 0x2b1a0c).lineBetween(width / 2 - ancho * 0.35, 64, width / 2 - ancho * 0.35, cy - alto / 2).lineBetween(width / 2 + ancho * 0.35, 64, width / 2 + ancho * 0.35, cy - alto / 2);
    this.tabla = this.add.rectangle(0, 0, ancho, alto, MADERA).setStrokeStyle(6, MADERA_OSCURA);
    const vetas = this.add.graphics();
    vetas.lineStyle(2, MADERA_OSCURA, 0.5);
    for (let k = 1; k < 4; k++) vetas.lineBetween(-ancho / 2 + 10, -alto / 2 + (k * alto) / 4, ancho / 2 - 10, -alto / 2 + (k * alto) / 4);
    this.textoCartel = this.add.text(0, 0, '', { ...estilo(alto * 0.36, '#fff3d6', '700'), stroke: '#2b1a0c', strokeThickness: 8 }).setOrigin(0.5);
    this.cartel = this.add.container(width / 2, cy, [this.tabla, vetas, this.textoCartel]);
    this.subtitulo = this.add.text(width / 2, cy + alto / 2 + 22, '', { ...estilo(Math.max(18, alto * 0.14), '#fff3d6'), stroke: '#2b1a0c', strokeThickness: 5 }).setOrigin(0.5);
    this.objetos.push(cuerdas, this.cartel, this.subtitulo);

    // Balas: una por señal, arriba a la izquierda.
    this.contador = this.add.text(24, 20, '', { ...estilo(Math.max(16, height * 0.03), '#fff3d6'), stroke: '#2b1a0c', strokeThickness: 4 }).setOrigin(0);
    this.balas = Array.from({ length: this.senales }, (_, i) => this.add.circle(34 + i * 26, 20 + Math.max(16, height * 0.03) * 1.9, 9, 0x6b5a3a).setStrokeStyle(3, 0x2b1a0c));
    this.objetos.push(this.contador, ...this.balas);

    // Carteles de «SE BUSCA», en una o dos filas sobre la arena.
    const lista = [...this.jugadores.values()].sort((a, b) => a.id - b.id);
    const filas = lista.length > 8 ? 2 : 1;
    const porFila = Math.max(1, Math.ceil(lista.length / filas));
    const hueco = Math.min(18, width * 0.012);
    const disponible = (height - horizonte - 20 - (filas - 1) * hueco) / filas;
    const w = Math.min(190, (width - 40 - (porFila - 1) * hueco) / porFila);
    const h = Math.min(disponible, w * 1.3);
    lista.forEach((j, i) => {
      const fila = Math.floor(i / porFila);
      const enFila = Math.min(porFila, lista.length - fila * porFila);
      const x0 = (width - (enFila * w + (enFila - 1) * hueco)) / 2 + w / 2;
      const y = horizonte + 10 + fila * (disponible + hueco) + disponible / 2;
      j.tarjeta = this.cartelBusca(j, x0 + (i % porFila) * (w + hueco), y, w, h);
      this.objetos.push(j.tarjeta.caja);
    });

    this.pintar();
    this.efectoFase(false);
  }

  cactus(g, x, y, alto) {
    const a = alto * 0.18;
    g.fillStyle(0x3f7d3a);
    g.fillRoundedRect(x - a / 2, y - alto, a, alto, a / 2);
    g.fillRoundedRect(x - a * 1.8, y - alto * 0.65, a * 0.8, alto * 0.35, a * 0.4);
    g.fillRoundedRect(x - a * 1.8, y - alto * 0.4, a * 1.5, a * 0.7, a * 0.35);
    g.fillRoundedRect(x + a, y - alto * 0.8, a * 0.8, alto * 0.4, a * 0.4);
    g.fillRoundedRect(x + a * 0.3, y - alto * 0.5, a * 1.4, a * 0.7, a * 0.35);
  }

  cartelBusca(j, x, y, w, h) {
    const fondo = this.add.graphics();
    fondo.fillStyle(0x000000, 0.25).fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
    fondo.fillStyle(PAPEL).fillRect(-w / 2, -h / 2, w, h);
    fondo.lineStyle(3, 0xb08850).strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10);
    fondo.fillStyle(0x6b4423).fillCircle(0, -h / 2 + 6, 4); // la chincheta
    const titulo = this.add.text(0, -h / 2 + h * 0.13, 'SE BUSCA', estilo(w * 0.12, TINTA, '700')).setOrigin(0.5);
    const r = Math.min(w * 0.17, h * 0.13);
    const avatar = this.add.circle(0, -h / 2 + h * 0.36, r, j.color).setStrokeStyle(3, 0x4a2c12);
    const emoji = this.add.text(0, -h / 2 + h * 0.36, cara(j), estilo(r * 1.1)).setOrigin(0.5);
    const nombre = this.add.text(0, -h / 2 + h * 0.57, j.name, estilo(w * 0.1, TINTA, '700')).setOrigin(0.5);
    if (nombre.width > w * 0.86) nombre.setScale((w * 0.86) / nombre.width);
    const tiempo = this.add.text(0, -h / 2 + h * 0.74, '', estilo(w * 0.14, TINTA, '700')).setOrigin(0.5);
    const total = this.add.text(0, -h / 2 + h * 0.9, '', estilo(w * 0.08, '#7a5530', '600')).setOrigin(0.5);
    const caja = this.add.container(x, y, [fondo, titulo, avatar, emoji, nombre, tiempo, total]);
    caja.setAngle((j.id % 2 ? -1 : 1) * 2);
    return { caja, tiempo, total, x, y };
  }

  pintar() {
    const ganador = this.fase === 'pausa' ? this.jugadores.get(this.ganador) : null;
    const aspecto = {
      espera: [MADERA, 'ESPERA…', 'Que nadie desenfunde todavía…'],
      ya: [0x2e9e5b, '¡YA!', '¡Dispara!'],
      pausa: ganador ? [0xb8892a, `${ganador.ms} ms`, `🤠 ${ganador.name} es el más rápido del Oeste`] : [MADERA, '—', 'Nadie ha disparado a tiempo'],
    }[this.fase] ?? [MADERA, 'PREPARADOS', 'Cuando el cartel diga ¡YA!, pulsa'];
    const [color, principal, sub] = aspecto;
    this.tabla.setFillStyle(color);
    this.textoCartel.setText(principal);
    this.subtitulo.setText(sub);
    this.contador.setText(this.senal ? `Duelo ${this.senal} de ${this.senales}` : `${this.senales} duelos`);
    this.balas.forEach((b, i) => {
      const actual = i === this.senal - 1;
      b.setFillStyle(i < this.senal - 1 ? 0x3a2f1e : actual ? 0xe8c15a : 0xc9a24a);
      b.setScale(actual ? 1.3 : 1);
    });
    const jugando = this.fase === 'espera' || this.fase === 'ya';
    for (const [id, j] of this.jugadores) {
      let t = '';
      let c = TINTA;
      if (j.early) [t, c] = ['¡Pronto!', ROJO_TEXTO];
      else if (j.missed) [t, c] = ['Tarde', '#8a7350'];
      else if (j.ms !== null) [t, c] = [`${j.ms} ms`, ganador && id === this.ganador ? '#b8892a' : TINTA];
      else if (jugando) [t, c] = ['…', '#8a7350'];
      j.tarjeta.tiempo.setText(t).setColor(c);
      j.tarjeta.total.setText(`Total ${segundos(j.total)}`);
      j.tarjeta.caja.setAlpha(j.conectado ? 1 : 0.45);
    }
  }

  efectoFase(animar) {
    this.balanceo?.remove();
    this.balanceo = null;
    this.cartel.setAngle(0).setScale(1);
    if (this.fase === 'espera') {
      // El cartel se balancea con el viento mientras se espera.
      this.balanceo = this.tweens.add({ targets: this.cartel, angle: { from: -2, to: 2 }, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      if (animar) sonido.viento();
    }
    if (!animar) return;
    if (this.fase === 'ya') {
      sonido.disparo();
      this.destello.setAlpha(0.35);
      this.tweens.add({ targets: this.destello, alpha: 0, duration: 450, ease: 'Cubic.easeOut' });
      this.cartel.setScale(0.8);
      this.tweens.add({ targets: this.cartel, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.cameras.main.shake(160, 0.006);
    }
    const ganador = this.jugadores.get(this.ganador);
    if (this.fase === 'pausa' && ganador) {
      sonido.campanilla();
      const { caja, x, y } = ganador.tarjeta;
      this.tweens.add({ targets: caja, scale: 1.12, duration: 180, yoyo: true, ease: 'Back.easeOut' });
      confeti(this, x, y, ganador.color, 40);
    }
  }

  // Alguien acaba de pulsar: el cartel salta, o tiembla si se ha adelantado.
  pulsacion(j) {
    const { caja, x } = j.tarjeta;
    if (j.early) {
      sonido.pronto();
      this.tweens.add({ targets: caja, x: x + 10, duration: 50, yoyo: true, repeat: 3, onComplete: () => caja.setX(x) });
    } else {
      sonido.pulsacion();
      this.tweens.add({ targets: caja, scale: 1.08, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    }
  }

  // phase, signal, signals, winner y players: [{ id, ms, early, missed, total }]
  actualizar({ phase, signal, signals, winner = null, players = [] }, animar = true) {
    if (phase === undefined) return;
    for (const p of players) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      const acabaDePulsar = j.ms === null && p.ms !== null && !p.missed;
      Object.assign(j, { ms: p.ms, early: p.early, missed: p.missed, total: p.total });
      if (acabaDePulsar && animar) this.pulsacion(j);
    }
    const cambio = phase !== this.fase || signal !== this.senal;
    this.fase = phase;
    this.senal = signal;
    this.ganador = winner;
    if (signals !== this.senales) {
      this.senales = signals;
      return this.construir();
    }
    this.pintar();
    if (cambio) this.efectoFase(animar);
  }

  conexion(id, conectado) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = conectado;
    this.pintar();
  }

  quitar(id) {
    if (!this.jugadores.delete(id)) return;
    this.construir();
  }
}
