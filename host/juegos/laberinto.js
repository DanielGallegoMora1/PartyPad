// Laberinto inclinable en la pantalla: el servidor manda el mapa al empezar (setup) y las posiciones de las
// bolas 20 veces por segundo. Aquí se interpolan para que rueden suaves a 60 fps.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';

const PANEL = 0x1f1747;
const PARED = 0xc9c1ee;
const SOMBRA = 0x07040f;
const SALIDA = 0x3ddc84;
const TEXTO = '#f7f4ff';
const TEXTO_OSCURO = '#1a0f2e';
const MEDALLAS = [0xffd23f, 0xd9d9e8, 0xe0975a]; // oro, plata y bronce; el resto, gris
const SUAVIZADO = 15;

const numero = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;
const inicial = (nombre) => [...nombre][0]?.toUpperCase() ?? '?';

export class Laberinto extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.mapa = inicio.setup;
    this.corredores = new Map(
      jugadores.map((j) => [j.id, { ...j, color: numero(j.hex), x: null, y: null, puesto: 0, conectado: j.connected }]),
    );
    this.objetos = [];
  }

  create() {
    this.texturas();
    this.construir();
    this.scale.on('resize', this.construir, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.construir, this));
    this.listo = true;
    this.actualizar(this.inicio, false);
  }

  texturas() {
    if (this.textures.exists('punto')) return;
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xffffff).fillCircle(16, 16, 16).generateTexture('punto', 32, 32);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 10, 16).generateTexture('confeti', 10, 16);
    g.destroy();
  }

  // Del sistema del servidor (celdas) a píxeles de la pantalla.
  px(x) {
    return this.ox + x * this.celda;
  }

  py(y) {
    return this.oy + y * this.celda;
  }

  construir() {
    for (const o of this.objetos) o.destroy();
    this.objetos = [];
    this.tweens.killAll();
    if (!this.mapa) return;

    const { width, height } = this.scale;
    const { cols, rows } = this.mapa;
    const margen = Math.max(24, Math.min(width, height) * 0.05);
    const reloj = 64; // hueco arriba para el reloj de la ronda, que va encima del canvas
    this.columnaLlegadas = Math.min(width * 0.12, 170);
    this.celda = Math.min((width - 2 * margen - this.columnaLlegadas) / cols, (height - reloj - 2 * margen) / rows);
    const ancho = cols * this.celda;
    const alto = rows * this.celda;
    this.ox = (width - this.columnaLlegadas - ancho) / 2;
    this.oy = reloj + (height - reloj - alto) / 2;

    this.tablero(ancho, alto);
    this.meta();
    this.paredes();
    for (const c of this.corredores.values()) this.bola(c);
    this.llegadas();
  }

  tablero(ancho, alto) {
    const s = this.celda;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(this.ox - s * 0.3, this.oy - s * 0.2, ancho + s * 0.6, alto + s * 0.6, s * 0.4);
    g.fillStyle(PANEL).fillRoundedRect(this.ox - s * 0.3, this.oy - s * 0.3, ancho + s * 0.6, alto + s * 0.6, s * 0.4);
    // Suelo a cuadros muy suaves
    g.fillStyle(0xffffff, 0.025);
    for (let x = 0; x < this.mapa.cols; x++) {
      for (let y = 0; y < this.mapa.rows; y++) if ((x + y) % 2) g.fillRect(this.px(x), this.py(y), s, s);
    }
    const { start } = this.mapa;
    g.fillStyle(SALIDA, 0.12).fillRoundedRect(this.px(start.x), this.py(start.y), start.w * s, start.h * s, s * 0.2);
    this.objetos.push(g);
  }

  meta() {
    const s = this.celda;
    const x = this.px(this.mapa.goal.x);
    const y = this.py(this.mapa.goal.y);
    const brillo = this.add.circle(x, y, s * 0.48, 0xff4d8d, 0.25);
    this.tweens.add({ targets: brillo, scale: 1.25, alpha: 0.08, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    const anillo = this.add.graphics({ x, y });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      anillo.fillStyle(i % 2 ? 0xffb547 : 0xff4d8d);
      anillo.fillCircle(Math.cos(a) * s * 0.36, Math.sin(a) * s * 0.36, s * 0.05);
    }
    this.tweens.add({ targets: anillo, angle: 360, duration: 4000, repeat: -1 });

    const agujero = this.add.circle(x, y, s * 0.27, 0x0b0820);
    agujero.setStrokeStyle(s * 0.04, 0xffb547, 0.8);
    this.objetos.push(brillo, anillo, agujero);
  }

  paredes() {
    const s = this.celda;
    const grosor = this.mapa.wall * s;
    const sombra = this.add.graphics();
    const pared = this.add.graphics();
    sombra.fillStyle(SOMBRA, 0.55);
    pared.fillStyle(PARED);
    for (const [x1, y1, x2, y2] of this.mapa.walls) {
      const x = this.px(x1) - grosor / 2;
      const y = this.py(y1) - grosor / 2;
      const w = (x2 - x1) * s + grosor;
      const h = (y2 - y1) * s + grosor;
      sombra.fillRoundedRect(x + grosor * 0.35, y + grosor * 0.6, w, h, grosor / 2);
      pared.fillRoundedRect(x, y, w, h, grosor / 2);
    }
    this.objetos.push(sombra, pared);
  }

  bola(c) {
    const r = this.mapa.radius * this.celda;
    c.estela = this.add.particles(0, 0, 'punto', {
      emitting: false,
      lifespan: 350,
      scale: { start: r / 22, end: 0 },
      alpha: { start: 0.45, end: 0 },
      tint: c.color,
    });
    c.ficha = this.add.container(0, 0, [
      this.add.circle(r * 0.15, r * 0.3, r, 0x000000, 0.35),
      this.add.circle(0, 0, r, c.color),
      this.add.circle(-r * 0.35, -r * 0.38, r * 0.3, 0xffffff, 0.35),
      this.add
        .text(0, 0, inicial(c.name), { fontFamily: 'Fredoka', fontSize: `${Math.round(r * 1.05)}px`, fontStyle: '700', color: TEXTO_OSCURO })
        .setOrigin(0.5),
    ]);
    c.ficha.setVisible(!c.puesto && c.x !== null);
    if (c.x !== null) c.ficha.setPosition(this.px(c.x), this.py(c.y));
    c.ficha.setAlpha(c.conectado ? 1 : 0.35);
    this.objetos.push(c.estela, c.ficha);
  }

  // Lista de los que ya han llegado, a la derecha del laberinto.
  llegadas() {
    const s = Math.min(this.celda * 0.9, 56);
    const x = this.scale.width - this.columnaLlegadas / 2 - 8;
    const llegados = [...this.corredores.values()].filter((c) => c.puesto).sort((a, b) => a.puesto - b.puesto);
    const titulo = this.add
      .text(x, this.oy, 'Meta', { fontFamily: 'Fredoka', fontSize: `${Math.round(s * 0.45)}px`, fontStyle: '600', color: '#b9b2d9' })
      .setOrigin(0.5, 0);
    this.objetos.push(titulo);
    llegados.forEach((c, i) => {
      const y = this.oy + s * 1.1 + i * s * 1.2;
      const medalla = this.add.circle(x - s * 0.55, y, s * 0.32, MEDALLAS[c.puesto - 1] ?? 0xb9b2d9);
      const puesto = this.add
        .text(x - s * 0.55, y, `${c.puesto}º`, { fontFamily: 'Fredoka', fontSize: `${Math.round(s * 0.3)}px`, fontStyle: '700', color: TEXTO_OSCURO })
        .setOrigin(0.5);
      const bola = this.add.circle(x + s * 0.25, y, s * 0.42, c.color);
      const letra = this.add
        .text(x + s * 0.25, y, inicial(c.name), { fontFamily: 'Fredoka', fontSize: `${Math.round(s * 0.42)}px`, fontStyle: '700', color: TEXTO_OSCURO })
        .setOrigin(0.5);
      this.objetos.push(medalla, puesto, bola, letra);
    });
  }

  update(time, delta) {
    if (!this.mapa) return;
    const k = 1 - Math.exp((-SUAVIZADO * delta) / 1000);
    for (const c of this.corredores.values()) {
      if (c.puesto || c.x === null || !c.ficha.visible) continue;
      const antes = { x: c.ficha.x, y: c.ficha.y };
      const x = c.ficha.x + (this.px(c.x) - c.ficha.x) * k;
      const y = c.ficha.y + (this.py(c.y) - c.ficha.y) * k;
      c.ficha.setPosition(x, y);
      const velocidad = Math.hypot(x - antes.x, y - antes.y) / (delta || 1);
      if (Math.random() < velocidad * 4) c.estela.emitParticleAt(x, y);
    }
  }

  // players: [{ id, x, y, place }]. animar es false al montar la escena, para no repetir llegadas antiguas.
  actualizar({ players = [] }, animar = true) {
    for (const p of players) {
      const c = this.corredores.get(p.id);
      if (!c) continue;
      const primeraVez = c.x === null;
      c.x = p.x;
      c.y = p.y;
      if (primeraVez && c.ficha) {
        c.ficha.setPosition(this.px(c.x), this.py(c.y));
        c.ficha.setVisible(!c.puesto);
      }
      if (p.place && !c.puesto) this.llegar(c, p.place, animar);
    }
  }

  llegar(c, puesto, animar) {
    c.puesto = puesto;
    if (!animar) {
      c.ficha.setVisible(false);
      this.construir();
      return;
    }
    const x = this.px(this.mapa.goal.x);
    const y = this.py(this.mapa.goal.y);
    // La bola cae en el agujero de la meta.
    this.tweens.add({
      targets: c.ficha,
      x,
      y,
      scale: 0.2,
      angle: 540,
      duration: 500,
      ease: 'Cubic.easeIn',
      onComplete: () => this.construir(),
    });
    if (puesto === 1) this.cameras.main.shake(250, 0.005);
    const confeti = this.add.particles(x, y, 'confeti', {
      emitting: false,
      lifespan: 1400,
      speed: { min: 150, max: 420 },
      angle: { min: 0, max: 360 },
      gravityY: 500,
      rotate: { min: 0, max: 360 },
      scale: { min: 0.5, max: 1 },
      tint: [c.color, 0xffffff, 0xffd23f, 0xff4d8d],
    });
    confeti.explode(puesto === 1 ? 60 : 25);
    this.time.delayedCall(1600, () => confeti.destroy());
  }

  conexion(id, conectado) {
    const c = this.corredores.get(id);
    if (!c) return;
    c.conectado = conectado;
    c.ficha?.setAlpha(conectado ? 1 : 0.35);
  }

  quitar(id) {
    if (!this.corredores.delete(id)) return;
    this.construir();
  }
}
