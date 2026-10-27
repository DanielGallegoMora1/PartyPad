// Dibuja en la pantalla: un lienzo por jugador donde aparecen sus trazos en directo (llegan con los mensajes draw,
// fuera del state_update). Después se vota desde el móvil y al final se ven los votos y el ganador con corona.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import { PINCELES, GROSORES } from '/shared/opciones.js';
import { TEXTO, TEXTO_OSCURO, TEXTO_SUAVE, cara, confeti, estilo, jugadoresDe, numero, rejilla, texturas } from './comun.js';

const COLORES = PINCELES.map(numero);

export class Dibuja extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.estado = {};
    const dibujos = inicio.setup?.drawings ?? {};
    this.jugadores = jugadoresDe(jugadores, (j) => ({ trazos: (dibujos[j.id] ?? []).map((t) => ({ ...t, p: [...t.p] })), votado: false, votos: null }));
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
    // El título va debajo del reloj de la ronda, que está arriba en el centro.
    this.titulo = this.add.text(width / 2, 70, '', estilo(Math.max(24, height * 0.045), TEXTO, '700')).setOrigin(0.5, 0);
    this.subtitulo = this.add.text(24, 20, '', estilo(Math.max(16, height * 0.028), TEXTO_SUAVE)).setOrigin(0);
    this.objetos.push(this.titulo, this.subtitulo);

    const lista = [...this.jugadores.values()].sort((a, b) => a.id - b.id);
    const y0 = 70 + Math.max(24, height * 0.045) + 16;
    const { posiciones, lado } = rejilla(lista.length, 16, y0, width - 32, height - y0 - 10, lista.length > 8 ? 8 : 4);
    const tam = lado * 0.82; // el lienzo, cuadrado
    lista.forEach((j, i) => {
      const { x, y } = posiciones[i];
      j.lienzo = { x: x - tam / 2, y: y - tam / 2 - lado * 0.04, tam };
      const marco = this.add.rectangle(x, j.lienzo.y + tam / 2, tam + 8, tam + 8, j.color).setStrokeStyle(0);
      const papel = this.add.rectangle(x, j.lienzo.y + tam / 2, tam, tam, 0xffffff);
      j.g = this.add.graphics();
      const etiqueta = this.add.text(x, j.lienzo.y + tam + 14, `${cara(j)} ${j.name}`, estilo(Math.max(12, lado * 0.075), TEXTO)).setOrigin(0.5, 0.5);
      if (etiqueta.width > tam) etiqueta.setScale(tam / etiqueta.width);
      j.marca = this.add.text(x + tam / 2 - 4, j.lienzo.y + 4, '', estilo(Math.max(14, tam * 0.12), TEXTO_OSCURO, '700')).setOrigin(1, 0);
      j.marco = marco;
      j.corona = this.add.text(x, j.lienzo.y - 6, '👑', estilo(tam * 0.22)).setOrigin(0.5, 1).setVisible(false);
      this.objetos.push(marco, papel, j.g, etiqueta, j.marca, j.corona);
      this.redibujar(j);
    });
    this.pintar();
  }

  // Pasa de coordenadas del lienzo (0 a 1000) a la pantalla.
  punto(j, x, y) {
    return [j.lienzo.x + (x / 1000) * j.lienzo.tam, j.lienzo.y + (y / 1000) * j.lienzo.tam];
  }

  // Dibuja los puntos [desde, hasta) de un trazo: segmentos y un círculo en cada punto para que las uniones sean redondas.
  pintarTrazo(j, trazo, desde = 0) {
    if (!j.g) return;
    const ancho = Math.max(1.5, (GROSORES[trazo.w] / 1000) * j.lienzo.tam);
    const color = COLORES[trazo.c] ?? 0x000000;
    const g = j.g;
    g.lineStyle(ancho, color, 1);
    g.fillStyle(color, 1);
    for (let i = Math.max(0, desde); i < trazo.p.length; i += 2) {
      const [x, y] = this.punto(j, trazo.p[i], trazo.p[i + 1]);
      if (i >= 2) {
        const [x0, y0] = this.punto(j, trazo.p[i - 2], trazo.p[i - 1]);
        g.lineBetween(x0, y0, x, y);
      }
      g.fillCircle(x, y, ancho / 2);
    }
  }

  redibujar(j) {
    j.g?.clear();
    for (const t of j.trazos) this.pintarTrazo(j, t);
  }

  pintar() {
    const e = this.estado;
    if (!this.titulo) return;
    const textos = {
      dibujar: `Dibujad: ${e.prompt}`,
      votar: '¡Votad el mejor dibujo desde el móvil!',
      resultado: '¡Y el mejor dibujo es…!',
    };
    this.titulo.setText(textos[e.phase] ?? `Vais a dibujar: ${e.prompt ?? '…'}`);
    this.subtitulo.setText(e.phase === 'votar' ? `Han votado ${[...this.jugadores.values()].filter((j) => j.votado).length}` : '');
    const max = Math.max(1, ...[...this.jugadores.values()].map((j) => j.votos ?? 0));
    for (const j of this.jugadores.values()) {
      if (!j.marca) continue;
      if (e.phase === 'resultado') j.marca.setText(`${j.votos ?? 0} ⭐`);
      else if (e.phase === 'votar') j.marca.setText(j.votado ? '✓' : '');
      else j.marca.setText('');
      j.corona.setVisible(e.phase === 'resultado' && (j.votos ?? 0) === max && max > 0);
    }
  }

  // Trazos en directo: { id, op, c, w, p }.
  dibujo(msg) {
    const j = this.jugadores.get(msg.id);
    if (!j) return;
    if (msg.op === 'start') {
      const t = { c: msg.c, w: msg.w, p: [...msg.p] };
      j.trazos.push(t);
      this.pintarTrazo(j, t);
    } else if (msg.op === 'add') {
      const t = j.trazos.at(-1);
      if (!t) return;
      const desde = t.p.length;
      t.p.push(...msg.p);
      this.pintarTrazo(j, t, desde);
    } else if (msg.op === 'undo') {
      j.trazos.pop();
      this.redibujar(j);
    } else if (msg.op === 'clear') {
      j.trazos = [];
      this.redibujar(j);
    }
  }

  // phase, prompt y players: [{ id, strokes, voted, votes }]
  actualizar(estado, animar = true) {
    if (estado.phase === undefined) return;
    const llegaResultado = estado.phase === 'resultado' && this.estado.phase !== 'resultado';
    this.estado = estado;
    for (const p of estado.players ?? []) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      j.votado = p.voted;
      j.votos = p.votes;
    }
    this.pintar();
    if (llegaResultado && animar) {
      const max = Math.max(0, ...[...this.jugadores.values()].map((j) => j.votos ?? 0));
      for (const j of this.jugadores.values()) {
        if (!max || j.votos !== max || !j.lienzo) continue;
        this.tweens.add({ targets: j.marco, scale: 1.06, duration: 250, yoyo: true, repeat: 3 });
        confeti(this, j.lienzo.x + j.lienzo.tam / 2, j.lienzo.y, j.color, 60);
      }
    }
  }

  conexion(id, conectado) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = conectado;
    j.marco?.setAlpha(conectado ? 1 : 0.4);
  }

  quitar(id) {
    if (!this.jugadores.delete(id)) return;
    this.construir();
  }
}
