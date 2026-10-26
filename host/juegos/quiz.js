// Quiz en la pantalla: la pregunta arriba y las 4 respuestas con el color y la forma del botón del mando. Abajo, los
// jugadores, con una marca al responder. Al resolver, se resalta la correcta y cada uno ve los puntos que ha ganado.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { OPCIONES } from '/shared/opciones.js';
import { TEXTO, TEXTO_OSCURO, TEXTO_SUAVE, estilo, ficha, jugadoresDe, numero, rejilla, texturas } from './comun.js';

export class Quiz extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.estado = {};
    this.jugadores = jugadoresDe(jugadores, () => ({ respondido: false, eleccion: null, ganados: null }));
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
    const margen = Math.max(20, width * 0.03);
    const arriba = 70;

    this.turno = this.add.text(margen, 20, '', estilo(Math.max(18, height * 0.03), TEXTO_SUAVE)).setOrigin(0);
    const altoPregunta = height * 0.2;
    const tarjeta = this.add.graphics();
    tarjeta.fillStyle(0xffffff, 0.95).fillRoundedRect(margen, arriba, width - 2 * margen, altoPregunta, 18);
    this.pregunta = this.add
      .text(width / 2, arriba + altoPregunta / 2, '', { ...estilo(Math.min(height * 0.05, 46), TEXTO_OSCURO, '700'), align: 'center', wordWrap: { width: width - 4 * margen } })
      .setOrigin(0.5);
    this.objetos.push(this.turno, tarjeta, this.pregunta);

    // Las 4 respuestas, en 2 × 2
    const y0 = arriba + altoPregunta + 16;
    const altoOpciones = height * 0.42;
    const hueco = 14;
    const w = (width - 2 * margen - hueco) / 2;
    const h = (altoOpciones - hueco) / 2;
    this.opciones = OPCIONES.map((o, i) => {
      const x = margen + (i % 2) * (w + hueco);
      const y = y0 + Math.floor(i / 2) * (h + hueco);
      const fondo = this.add.rectangle(x + w / 2, y + h / 2, w, h, numero(o.hex)).setStrokeStyle(0);
      const forma = this.add.text(x + h * 0.45, y + h / 2, o.forma, estilo(h * 0.45, '#ffffff', '700')).setOrigin(0.5);
      const texto = this.add
        .text(x + h * 0.85, y + h / 2, '', { ...estilo(Math.min(h * 0.32, 40), '#ffffff', '700'), wordWrap: { width: w - h * 1.1 } })
        .setOrigin(0, 0.5);
      const marca = this.add.text(x + w - 16, y + h / 2, '', estilo(h * 0.4, '#ffffff', '700')).setOrigin(1, 0.5);
      this.objetos.push(fondo, forma, texto, marca);
      return { fondo, forma, texto, marca };
    });

    // Jugadores abajo
    const lista = [...this.jugadores.values()].sort((a, b) => a.id - b.id);
    const yJugadores = y0 + altoOpciones + 10;
    const { posiciones, lado } = rejilla(lista.length, margen, yJugadores, width - 2 * margen, height - yJugadores - 10, 16);
    lista.forEach((j, i) => {
      const { x, y } = posiciones[i];
      const r = Math.min(lado * 0.3, 30);
      j.ficha = ficha(this, x, y - r * 0.3, r, j).setAlpha(j.conectado ? 1 : 0.4);
      j.etiqueta = this.add.text(x, y + r * 0.95, '', estilo(Math.max(12, r * 0.55), TEXTO, '700')).setOrigin(0.5);
      this.objetos.push(j.ficha, j.etiqueta);
    });
    this.pintar();
  }

  pintar() {
    const e = this.estado;
    if (!this.pregunta) return;
    const resuelto = e.phase === 'respuesta';
    this.turno.setText(e.turn ? `Pregunta ${e.turn} de ${e.turns}` : '');
    this.pregunta.setText(e.question ?? 'Preparados…');
    this.opciones.forEach((o, i) => {
      o.texto.setText(e.options?.[i] ?? '');
      const correcta = resuelto && i === e.correct;
      o.fondo.setAlpha(resuelto && !correcta ? 0.3 : 1);
      o.forma.setAlpha(resuelto && !correcta ? 0.4 : 1);
      o.texto.setAlpha(resuelto && !correcta ? 0.4 : 1);
      o.fondo.setStrokeStyle(correcta ? 8 : 0, 0xffffff);
      o.marca.setText(correcta ? '✓' : '');
    });
    for (const j of this.jugadores.values()) {
      if (!j.etiqueta) continue;
      if (resuelto) j.etiqueta.setText(j.ganados ? `+${j.ganados}` : '✗').setColor(j.ganados ? '#3ddc84' : '#ff5c5c');
      else j.etiqueta.setText(j.respondido ? '✓' : '').setColor(TEXTO);
    }
  }

  // phase, turn, turns, question, options, correct y players: [{ id, answered, choice, gained, points }]
  actualizar(estado, animar = true) {
    if (estado.phase === undefined) return;
    const cambiaTurno = estado.turn !== this.estado.turn || estado.phase !== this.estado.phase;
    this.estado = estado;
    for (const p of estado.players ?? []) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      if (p.answered && !j.respondido && animar && j.ficha) this.tweens.add({ targets: j.ficha, scale: 1.2, duration: 120, yoyo: true });
      Object.assign(j, { respondido: p.answered, eleccion: p.choice, ganados: p.gained });
    }
    this.pintar();
    if (cambiaTurno && animar && estado.phase === 'pregunta') {
      this.pregunta.setScale(0.8);
      this.tweens.add({ targets: this.pregunta, scale: 1, duration: 300, ease: 'Back.easeOut' });
    }
    if (cambiaTurno && animar && estado.phase === 'respuesta') {
      const o = this.opciones[estado.correct];
      if (o) this.tweens.add({ targets: [o.fondo], scaleX: 1.04, scaleY: 1.08, duration: 160, yoyo: true, repeat: 1 });
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
