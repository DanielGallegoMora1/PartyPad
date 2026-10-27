// Simón dice en la pantalla: los 4 colores en cruz, como el juguete. Mientras se enseña la secuencia, se enciende
// el color que dice el servidor y suena su tono. Abajo, cada jugador con su avance o eliminado.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { OPCIONES } from '/shared/opciones.js';
import { TEXTO, TEXTO_SUAVE, estilo, ficha, jugadoresDe, numero, rejilla, texturas } from './comun.js';
import * as sonido from '../sonido.js';

export class Simon extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.estado = {};
    this.paso = null; // el paso encendido, para saber cuándo cambia aunque se repita el color
    this.jugadores = jugadoresDe(jugadores, () => ({ fuera: false, progreso: 0, hecho: false }));
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
    // La cruz cabe entre el reloj (arriba) y los jugadores (abajo).
    const arriba = 110;
    const abajo = height * 0.64;
    const lado = Math.min(width * 0.16, (abajo - arriba) / 3.2);
    const cx = width / 2;
    const cy = arriba + (abajo - arriba) / 2;
    // Arriba, izquierda, derecha y abajo: rojo, azul, amarillo y verde (en el orden de los botones).
    const sitios = [[0, -1], [-1, 0], [1, 0], [0, 1]];
    this.pads = OPCIONES.map((o, i) => {
      const [dx, dy] = sitios[i];
      const x = cx + dx * lado * 1.08;
      const y = cy + dy * lado * 1.08;
      const fondo = this.add.rectangle(x, y, lado, lado, numero(o.hex)).setAlpha(0.35);
      fondo.setStrokeStyle(4, 0xffffff, 0.15);
      const forma = this.add.text(x, y, o.forma, estilo(lado * 0.4, '#ffffff', '700')).setOrigin(0.5).setAlpha(0.5);
      this.objetos.push(fondo, forma);
      return { fondo, forma };
    });
    this.titulo = this.add.text(cx, cy, '', estilo(lado * 0.28, TEXTO, '700')).setOrigin(0.5);
    this.subtitulo = this.add.text(24, 20, '', estilo(Math.max(18, height * 0.03), TEXTO_SUAVE)).setOrigin(0);
    this.objetos.push(this.titulo, this.subtitulo);

    const lista = [...this.jugadores.values()].sort((a, b) => a.id - b.id);
    const y0 = height * 0.66;
    const { posiciones, lado: hueco } = rejilla(lista.length, 20, y0, width - 40, height - y0 - 10, 16);
    lista.forEach((j, i) => {
      const { x, y } = posiciones[i];
      const r = Math.min(hueco * 0.28, 30);
      j.ficha = ficha(this, x, y - r * 0.4, r, j);
      j.etiqueta = this.add.text(x, y + r * 0.95, '', estilo(Math.max(12, r * 0.55), TEXTO, '700')).setOrigin(0.5);
      this.objetos.push(j.ficha, j.etiqueta);
    });
    this.pintar();
  }

  pintar() {
    const e = this.estado;
    if (!this.pads) return;
    this.pads.forEach((p, i) => {
      const encendido = e.lit === i;
      p.fondo.setAlpha(encendido ? 1 : 0.35).setScale(encendido ? 1.08 : 1);
      p.fondo.setStrokeStyle(encendido ? 8 : 4, 0xffffff, encendido ? 0.9 : 0.15);
      p.forma.setAlpha(encendido ? 1 : 0.5);
    });
    const textos = { mostrar: '¡Mira!', repetir: '¡Repite!', pausa: '' };
    this.titulo.setText(textos[e.phase] ?? '');
    this.subtitulo.setText(e.level ? `Nivel ${e.level} · ${e.length} colores` : '');
    for (const j of this.jugadores.values()) {
      if (!j.etiqueta) continue;
      j.ficha.setAlpha(j.fuera ? 0.25 : j.conectado ? 1 : 0.4);
      if (j.fuera) j.etiqueta.setText('✗').setColor('#ff5c5c');
      else if (j.hecho) j.etiqueta.setText('✓').setColor('#3ddc84');
      else if (e.phase === 'repetir') j.etiqueta.setText(`${j.progreso}/${e.length}`).setColor(TEXTO);
      else j.etiqueta.setText('');
    }
  }

  // phase, level, length, lit, step y players: [{ id, out, progress, done }]
  actualizar(estado, animar = true) {
    if (estado.phase === undefined) return;
    this.estado = estado;
    for (const p of estado.players ?? []) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      if (p.out && !j.fuera && animar && j.ficha) this.tweens.add({ targets: j.ficha, angle: { from: -15, to: 15 }, duration: 60, yoyo: true, repeat: 2 });
      Object.assign(j, { fuera: p.out, progreso: p.progress, hecho: p.done });
    }
    if (estado.step !== this.paso) {
      this.paso = estado.step;
      if (animar && estado.lit !== null) sonido.tonoSimon(estado.lit);
    }
    this.pintar();
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
