// ¿Cuántos hay? en la pantalla: mientras se mira, un campo lleno de animales; después, la pregunta con 4 números
// del color y la forma de los botones. Al resolver, vuelven los animales con los buscados resaltados.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { OPCIONES } from '/shared/opciones.js';
import { PANEL, TEXTO, TEXTO_SUAVE, estilo, ficha, jugadoresDe, numero, rejilla, texturas } from './comun.js';

export class Cuantos extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.estado = {};
    this.jugadores = jugadoresDe(jugadores, () => ({ respondido: false, ganados: null }));
    this.objetos = [];
    this.animales = [];
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
    for (const o of [...this.objetos, ...this.animales]) o.destroy();
    this.objetos = [];
    this.animales = [];
    const { width, height } = this.scale;
    const margen = Math.max(20, width * 0.03);
    this.campo = { x: margen, y: 70, w: width - 2 * margen, h: height * 0.66 - 70 };
    const fondo = this.add.graphics();
    fondo.fillStyle(PANEL, 0.9).fillRoundedRect(this.campo.x, this.campo.y, this.campo.w, this.campo.h, 18);
    this.turno = this.add.text(24, 20, '', estilo(Math.max(18, height * 0.03), TEXTO_SUAVE)).setOrigin(0);
    this.pregunta = this.add.text(width / 2, this.campo.y + this.campo.h * 0.28, '', estilo(Math.min(height * 0.08, 70), TEXTO, '700')).setOrigin(0.5);
    this.objetos.push(fondo, this.turno, this.pregunta);

    // Las 4 respuestas, en fila, debajo de la pregunta.
    const lado = Math.min(this.campo.w / 5, this.campo.h * 0.38);
    this.opciones = OPCIONES.map((o, i) => {
      const x = width / 2 + (i - 1.5) * lado * 1.15;
      const y = this.campo.y + this.campo.h * 0.66;
      const caja = this.add.rectangle(x, y, lado, lado * 0.8, numero(o.hex));
      const forma = this.add.text(x - lado * 0.32, y - lado * 0.24, o.forma, estilo(lado * 0.16, '#ffffff', '700')).setOrigin(0.5);
      const valor = this.add.text(x, y + lado * 0.04, '', estilo(lado * 0.36, '#ffffff', '700')).setOrigin(0.5);
      this.objetos.push(caja, forma, valor);
      return { caja, forma, valor };
    });

    const lista = [...this.jugadores.values()].sort((a, b) => a.id - b.id);
    const y0 = this.campo.y + this.campo.h + 10;
    const { posiciones, lado: hueco } = rejilla(lista.length, 20, y0, width - 40, height - y0 - 6, 16);
    lista.forEach((j, i) => {
      const { x, y } = posiciones[i];
      const r = Math.min(hueco * 0.28, 28);
      j.ficha = ficha(this, x, y - r * 0.4, r, j).setAlpha(j.conectado ? 1 : 0.4);
      j.etiqueta = this.add.text(x, y + r * 0.95, '', estilo(Math.max(12, r * 0.55), TEXTO, '700')).setOrigin(0.5);
      this.objetos.push(j.ficha, j.etiqueta);
    });
    this.dibujarAnimales();
    this.pintar();
  }

  // Los animales del turno, si toca verlos. En la respuesta, los que no son el buscado se apagan.
  dibujarAnimales() {
    for (const a of this.animales) a.destroy();
    this.animales = [];
    const e = this.estado;
    if (!e.animals) return;
    const tam = Math.min(this.campo.w, this.campo.h * 1.6) / Math.sqrt(e.animals.length * 2.2);
    for (const a of e.animals) {
      const texto = this.add
        .text(this.campo.x + 20 + a.x * (this.campo.w - 40), this.campo.y + 20 + a.y * (this.campo.h - 40), a.emoji, estilo(tam))
        .setOrigin(0.5)
        .setAngle(a.r);
      if (e.phase === 'respuesta') texto.setAlpha(a.emoji === e.target ? 1 : 0.15).setScale(a.emoji === e.target ? 1.25 : 1);
      this.animales.push(texto);
    }
  }

  pintar() {
    const e = this.estado;
    if (!this.pregunta) return;
    const resuelto = e.phase === 'respuesta';
    const preguntando = e.phase === 'pregunta' && !e.looking;
    this.turno.setText(e.turn ? `${e.turn} de ${e.turns}${e.looking ? ' · ¡Fíjate bien!' : ''}` : '');
    this.pregunta.setText(preguntando ? `¿Cuántos ${e.target} había?` : resuelto ? `Había ${e.count} ${e.target}` : '');
    this.pregunta.setY(resuelto ? this.campo.y + 40 : this.campo.y + this.campo.h * 0.28);
    this.opciones.forEach((o, i) => {
      const visible = preguntando;
      o.caja.setVisible(visible);
      o.forma.setVisible(visible);
      o.valor.setVisible(visible).setText(String(e.options?.[i] ?? ''));
    });
    for (const j of this.jugadores.values()) {
      if (!j.etiqueta) continue;
      if (resuelto) j.etiqueta.setText(j.ganados ? `+${j.ganados}` : '✗').setColor(j.ganados ? '#3ddc84' : '#ff5c5c');
      else j.etiqueta.setText(j.respondido ? '✓' : '').setColor(TEXTO);
    }
  }

  // phase, turn, turns, looking, animals, target, options, correct, count y players
  actualizar(estado, animar = true) {
    if (estado.phase === undefined) return;
    // Los animales solo se redibujan al cambiar de turno o de fase, no con cada mensaje.
    const clave = (e) => `${e.phase}|${e.turn}|${e.animals ? 1 : 0}`;
    const cambianAnimales = clave(estado) !== clave(this.estado);
    this.estado = estado;
    for (const p of estado.players ?? []) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      if (p.answered && !j.respondido && animar && j.ficha) this.tweens.add({ targets: j.ficha, scale: 1.2, duration: 100, yoyo: true });
      Object.assign(j, { respondido: p.answered, ganados: p.gained });
    }
    if (cambianAnimales) this.dibujarAnimales();
    this.pintar();
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
