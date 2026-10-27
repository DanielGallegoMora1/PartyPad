// Colores en la pantalla: una palabra enorme (el nombre de un color) escrita con tinta de otro. Abajo, los 8 colores
// con la forma de su botón, como recordatorio, y los jugadores con su resultado en cada turno.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { TINTAS } from '/shared/opciones.js';
import { TEXTO, TEXTO_SUAVE, estilo, ficha, jugadoresDe, numero, rejilla, texturas } from './comun.js';

export class Colores extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.estado = {};
    this.jugadores = jugadoresDe(jugadores, () => ({ respondido: false, ganados: null, puntos: 0 }));
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
    this.turno = this.add.text(24, 20, '', estilo(Math.max(18, height * 0.03), TEXTO_SUAVE)).setOrigin(0);
    const tam = Math.min(width * 0.16, height * 0.22);
    this.palabra = this.add.text(width / 2, height * 0.33, '', estilo(tam, TEXTO, '700')).setOrigin(0.5);
    this.palabra.setStroke('#ffffff', 6);
    this.ayuda = this.add.text(width / 2, height * 0.33 + tam * 0.75, 'Pulsa el color de la TINTA', estilo(tam * 0.18, TEXTO_SUAVE)).setOrigin(0.5);
    this.objetos.push(this.turno, this.palabra, this.ayuda);

    // Recordatorio: forma y color de cada botón.
    const lado = Math.min(width * 0.06, height * 0.08);
    TINTAS.forEach((o, i) => {
      const x = width / 2 + (i - (TINTAS.length - 1) / 2) * lado * 1.35;
      const y = height * 0.58;
      this.objetos.push(
        this.add.rectangle(x, y, lado, lado, numero(o.hex)).setStrokeStyle(3, 0xffffff, 0.6),
        this.add.text(x, y, o.forma, estilo(lado * 0.5, '#ffffff', '700')).setOrigin(0.5),
      );
    });

    const lista = [...this.jugadores.values()].sort((a, b) => a.id - b.id);
    const y0 = height * 0.66;
    const { posiciones, lado: hueco } = rejilla(lista.length, 20, y0, width - 40, height - y0 - 10, 16);
    lista.forEach((j, i) => {
      const { x, y } = posiciones[i];
      const r = Math.min(hueco * 0.28, 30);
      j.ficha = ficha(this, x, y - r * 0.4, r, j).setAlpha(j.conectado ? 1 : 0.4);
      j.etiqueta = this.add.text(x, y + r * 0.9, '', estilo(Math.max(12, r * 0.55), TEXTO, '700')).setOrigin(0.5);
      j.total = this.add.text(x, y + r * 1.6, '', estilo(Math.max(11, r * 0.45), TEXTO_SUAVE)).setOrigin(0.5);
      this.objetos.push(j.ficha, j.etiqueta, j.total);
    });
    this.pintar();
  }

  pintar() {
    const e = this.estado;
    if (!this.palabra) return;
    this.turno.setText(e.turn ? `${e.turn} de ${e.turns}` : '');
    const tinta = TINTAS[e.ink];
    this.palabra.setText(e.word ?? '¿Preparados?').setColor(tinta?.hex ?? TEXTO);
    this.palabra.setAlpha(e.phase === 'respuesta' ? 0.35 : 1);
    const resuelto = e.phase === 'respuesta';
    for (const j of this.jugadores.values()) {
      if (!j.etiqueta) continue;
      if (resuelto) j.etiqueta.setText(j.ganados > 0 ? `+${j.ganados}` : j.ganados < 0 ? `${j.ganados}` : '—').setColor(j.ganados > 0 ? '#3ddc84' : '#ff5c5c');
      else j.etiqueta.setText(j.respondido ? '✓' : '').setColor(TEXTO);
      j.total.setText(`${j.puntos} pts`);
    }
  }

  // phase, turn, turns, word, ink y players: [{ id, answered, gained, points }]
  actualizar(estado, animar = true) {
    if (estado.phase === undefined) return;
    const nuevo = estado.turn !== this.estado.turn && estado.phase === 'pregunta';
    this.estado = estado;
    for (const p of estado.players ?? []) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      if (p.answered && !j.respondido && animar && j.ficha) this.tweens.add({ targets: j.ficha, scale: 1.2, duration: 100, yoyo: true });
      Object.assign(j, { respondido: p.answered, ganados: p.gained, puntos: p.points });
    }
    this.pintar();
    if (nuevo && animar) {
      this.palabra.setScale(0.5);
      this.tweens.add({ targets: this.palabra, scale: 1, duration: 200, ease: 'Back.easeOut' });
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
