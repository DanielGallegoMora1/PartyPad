// Simón dice en la pantalla: el juguete clásico, un círculo con los 4 colores en cuadrantes y el centro negro.
// Mientras se enseña la secuencia, se enciende el cuadrante que dice el servidor y suena su tono. Abajo, cada
// jugador con su avance o eliminado.
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
    // El juguete cabe entre el reloj (arriba) y los jugadores (abajo).
    const arriba = 80;
    const abajo = height * 0.64;
    const radio = Math.min(width * 0.22, (abajo - arriba) / 2);
    const cx = width / 2;
    const cy = arriba + (abajo - arriba) / 2;
    this.juguete = { cx, cy, radio };
    const caja = this.add.graphics();
    caja.fillStyle(0x000000, 0.35).fillCircle(cx + 6, cy + 10, radio);
    caja.fillStyle(0x2a2a33).fillCircle(cx, cy, radio);
    this.objetos.push(caja);
    // Cuadrantes en el orden de los botones: arriba a la izquierda, arriba a la derecha, abajo a la izquierda, abajo a la derecha.
    const angulos = [Math.PI, -Math.PI / 2, Math.PI / 2, 0];
    this.pads = OPCIONES.map((o, i) => {
      const g = this.add.graphics();
      const medio = angulos[i] + Math.PI / 4;
      const forma = this.add
        .text(cx + Math.cos(medio) * radio * 0.62, cy + Math.sin(medio) * radio * 0.62, o.forma, estilo(radio * 0.18, '#ffffff', '700'))
        .setOrigin(0.5);
      this.objetos.push(g, forma);
      return { g, forma, color: numero(o.hex), desde: angulos[i] };
    });
    const centro = this.add.circle(cx, cy, radio * 0.36, 0x18181f).setStrokeStyle(radio * 0.04, 0x3a3a46);
    this.titulo = this.add.text(cx, cy - radio * 0.07, 'SIMÓN', estilo(radio * 0.12, '#f7f4ff', '700')).setOrigin(0.5);
    this.nivel = this.add.text(cx, cy + radio * 0.12, '', estilo(radio * 0.09, '#b9b2d9', '600')).setOrigin(0.5);
    this.objetos.push(centro, this.nivel);
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
    const { cx, cy, radio } = this.juguete;
    this.pads.forEach((p, i) => {
      const encendido = e.lit === i;
      // Cada cuadrante es un sector con un hueco entre ellos; encendido, más claro y con brillo alrededor.
      const g = p.g;
      g.clear();
      const hueco = 0.06;
      const r = radio * (encendido ? 0.97 : 0.93);
      if (encendido) {
        g.fillStyle(p.color, 0.35);
        g.slice(cx, cy, radio * 1.05, p.desde + hueco, p.desde + Math.PI / 2 - hueco).fillPath();
      }
      g.fillStyle(p.color, encendido ? 1 : 0.5);
      g.slice(cx, cy, r, p.desde + hueco, p.desde + Math.PI / 2 - hueco).fillPath();
      if (encendido) {
        g.fillStyle(0xffffff, 0.25);
        g.slice(cx, cy, r, p.desde + hueco, p.desde + Math.PI / 2 - hueco).fillPath();
      }
      p.forma.setAlpha(encendido ? 1 : 0.55);
    });
    const textos = { mostrar: '¡Mira!', repetir: '¡Repite!', pausa: 'SIMÓN' };
    this.titulo.setText(textos[e.phase] ?? 'SIMÓN');
    this.nivel.setText(e.level ? `Nivel ${e.level}` : '');
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
