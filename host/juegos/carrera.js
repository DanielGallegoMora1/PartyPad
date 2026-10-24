// Carrera de agitar en la pantalla: cada jugador es un cohete que despega hacia la luna.
// El servidor manda el progreso unas 10 veces por segundo y aquí se interpola para que los cohetes
// suban suaves a 60 fps. Cuanto más fuerte agita, más grande es la llama, más humo y más tiembla.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';

const CIELO_ARRIBA = 0x070514;
const CIELO_ABAJO = 0x3b1f6e;
const SUELO = 0x1a1238;
const CUERPO = 0xf7f4ff;
const VENTANA = 0x1a0f2e;
const TEXTO = '#f7f4ff';
const MEDALLAS = [0xffd23f, 0xd9d9e8, 0xe0975a]; // oro, plata y bronce; el resto, gris
const SUAVIZADO = 6; // cuanto más alto, antes alcanza el cohete su posición real

const numero = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;
const inicial = (nombre) => [...nombre][0]?.toUpperCase() ?? '?';

export class Carrera extends Phaser.Scene {
  init({ jugadores = [] }) {
    this.listo = false;
    this.corredores = new Map(
      jugadores.map((j) => [
        j.id,
        { ...j, color: numero(j.hex), progreso: 0, mostrado: 0, intensidad: 0, puesto: 0, conectado: j.connected },
      ]),
    );
    this.objetos = [];
  }

  create() {
    this.texturas();
    this.construir();
    this.scale.on('resize', this.construir, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.construir, this));
    this.listo = true;
  }

  texturas() {
    if (this.textures.exists('punto')) return;
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xffffff).fillCircle(16, 16, 16).generateTexture('punto', 32, 32);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 10, 16).generateTexture('confeti', 10, 16);
    g.destroy();
  }

  // Dibuja el fondo y coloca los cohetes según el tamaño de la pantalla.
  // Se repite al redimensionar o si sale alguien.
  construir() {
    for (const o of this.objetos) o.destroy();
    this.objetos = [];
    this.tweens.killAll();

    const { width, height } = this.scale;
    const n = Math.max(1, this.corredores.size);
    const suelo = height * 0.86;
    const luna = { x: width / 2, r: Math.min(width * 0.22, height * 0.5) };
    luna.y = -luna.r * 0.45;
    const meta = luna.y + luna.r + height * 0.04; // altura de la línea de meta
    const margen = width * 0.06;
    const columna = (width - 2 * margen) / n;
    const alto = Math.min(height * 0.16, columna * 1.5);

    this.fondo(width, height, suelo, luna, meta);

    [...this.corredores.values()]
      .sort((a, b) => a.id - b.id)
      .forEach((c, i) => {
        const x = margen + columna * (i + 0.5);
        Object.assign(c, { x, alto, ancho: alto * 0.42, yInicio: suelo - alto * 0.62, yFin: meta + alto * 0.55 });

        // Plataforma de lanzamiento y nombre
        const plataforma = this.add.graphics();
        plataforma.fillStyle(0x2a2150).fillRoundedRect(x - c.ancho, suelo - 6, c.ancho * 2, 12, 6);
        plataforma.fillStyle(c.color, 0.8).fillRect(x - c.ancho * 0.7, suelo - 4, c.ancho * 1.4, 3);
        c.nombre = this.add
          .text(x, suelo + (height - suelo) / 2, c.name, {
            fontFamily: 'Fredoka',
            fontSize: `${Math.round(Math.min(height * 0.04, columna * 0.2))}px`,
            fontStyle: '600',
            color: TEXTO,
          })
          .setOrigin(0.5);
        if (c.nombre.width > columna * 0.92) c.nombre.setScale((columna * 0.92) / c.nombre.width);

        c.humo = this.add.particles(0, 0, 'punto', {
          emitting: false,
          lifespan: { min: 700, max: 1300 },
          speedY: { min: 40, max: 160 },
          speedX: { min: -60, max: 60 },
          scale: { start: c.ancho / 90, end: c.ancho / 28 },
          alpha: { start: 0.35, end: 0 },
          tint: [0xb9b2d9, 0x8a80b8, 0xffffff],
        });

        c.cohete = this.cohete(c);
        c.medalla = this.medalla(c);
        this.objetos.push(plataforma, c.nombre, c.humo, c.cohete, c.medalla);
        this.pintarConexion(c);
      });
  }

  fondo(width, height, suelo, luna, meta) {
    const cielo = this.add.graphics();
    cielo.fillGradientStyle(CIELO_ARRIBA, CIELO_ARRIBA, CIELO_ABAJO, CIELO_ABAJO, 1);
    cielo.fillRect(0, 0, width, height);
    this.objetos.push(cielo);

    // Estrellas: más y más brillantes cuanto más arriba. Algunas titilan.
    const rnd = new Phaser.Math.RandomDataGenerator(['partypad']);
    for (let i = 0; i < 160; i++) {
      const y = Math.pow(rnd.frac(), 1.6) * suelo;
      const altura = 1 - y / suelo;
      const estrella = this.add.circle(rnd.between(0, width), y, rnd.realInRange(0.6, 2.2), 0xffffff, 0.25 + altura * 0.7);
      if (rnd.frac() < 0.3) {
        this.tweens.add({
          targets: estrella,
          alpha: 0.1,
          duration: rnd.between(600, 1800),
          yoyo: true,
          repeat: -1,
          delay: rnd.between(0, 1500),
        });
      }
      this.objetos.push(estrella);
    }

    // Nubes cerca del suelo, que se desplazan despacio.
    for (let i = 0; i < 6; i++) {
      const nube = this.add.container(rnd.between(0, width), suelo - rnd.between(height * 0.08, height * 0.32));
      const base = rnd.between(40, 90) * (height / 900);
      for (let k = 0; k < 4; k++) {
        nube.add(this.add.ellipse((k - 1.5) * base * 0.7, rnd.between(-10, 10), base * 1.4, base * 0.8, 0xffffff, 0.06));
      }
      this.tweens.add({
        targets: nube,
        x: nube.x + (rnd.frac() < 0.5 ? -1 : 1) * width * 0.15,
        duration: rnd.between(14000, 24000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.objetos.push(nube);
    }

    // La luna asoma por arriba: es la meta.
    const g = this.add.graphics();
    g.fillStyle(0xffe9a8, 0.08).fillCircle(luna.x, luna.y, luna.r * 1.25);
    g.fillStyle(0xffe9a8, 0.12).fillCircle(luna.x, luna.y, luna.r * 1.1);
    g.fillStyle(0xf3e6c4).fillCircle(luna.x, luna.y, luna.r);
    g.fillStyle(0xd8c89f);
    for (const [dx, dy, r] of [[-0.45, 0.55, 0.12], [0.3, 0.7, 0.09], [0.55, 0.35, 0.07], [-0.15, 0.82, 0.06], [0.05, 0.45, 0.05]]) {
      g.fillCircle(luna.x + dx * luna.r, luna.y + dy * luna.r, r * luna.r);
    }
    // Línea de meta discontinua
    g.lineStyle(3, 0xffffff, 0.35);
    for (let x = 0; x < width; x += 28) g.lineBetween(x, meta, x + 14, meta);

    // Suelo con colinas
    g.fillStyle(SUELO);
    g.fillRect(0, suelo, width, height - suelo);
    for (let i = 0; i <= 6; i++) g.fillEllipse((i / 6) * width, suelo + 10, width * 0.3, height * 0.08);
    this.objetos.push(g);
  }

  // Cohete dibujado con formas, centrado en (0, 0) y con la llama debajo.
  cohete(c) {
    const h = c.alto;
    const w = c.ancho;
    c.llama = this.add.graphics();

    const g = this.add.graphics();
    // Aletas
    g.fillStyle(c.color);
    g.fillTriangle(-w / 2, h * 0.12, -w * 0.95, h * 0.42, -w / 2, h * 0.36);
    g.fillTriangle(w / 2, h * 0.12, w * 0.95, h * 0.42, w / 2, h * 0.36);
    // Tobera
    g.fillStyle(0x4a4270).fillRect(-w * 0.28, h * 0.36, w * 0.56, h * 0.08);
    // Cuerpo con sombra a la derecha
    g.fillStyle(CUERPO).fillRoundedRect(-w / 2, -h * 0.26, w, h * 0.64, w * 0.22);
    g.fillStyle(0x000000, 0.12).fillRect(w * 0.18, -h * 0.2, w * 0.32, h * 0.56);
    // Morro y franja del color del jugador
    g.fillStyle(c.color);
    g.fillTriangle(-w / 2, -h * 0.24, w / 2, -h * 0.24, 0, -h / 2);
    g.fillRect(-w / 2, h * 0.2, w, h * 0.06);
    // Ventanilla
    g.fillStyle(c.color).fillCircle(0, -h * 0.04, w * 0.33);
    g.fillStyle(VENTANA).fillCircle(0, -h * 0.04, w * 0.26);

    const letra = this.add
      .text(0, -h * 0.04, inicial(c.name), {
        fontFamily: 'Fredoka',
        fontSize: `${Math.round(w * 0.34)}px`,
        fontStyle: '700',
        color: TEXTO,
      })
      .setOrigin(0.5);

    return this.add.container(c.x, c.yInicio, [c.llama, g, letra]);
  }

  medalla(c) {
    const radio = c.ancho * 0.42;
    const medalla = this.add.container(c.x + c.ancho * 1.05, c.yFin - c.alto * 0.15, [
      this.add.circle(0, 0, radio, MEDALLAS[c.puesto - 1] ?? 0xb9b2d9),
      this.add
        .text(0, 0, `${c.puesto}º`, { fontFamily: 'Fredoka', fontSize: `${Math.round(radio)}px`, fontStyle: '700', color: '#1a0f2e' })
        .setOrigin(0.5),
    ]);
    medalla.setVisible(c.puesto > 0);
    return medalla;
  }

  pintarConexion(c) {
    const alfa = c.conectado ? 1 : 0.35;
    c.cohete.setAlpha(alfa);
    c.nombre.setAlpha(alfa);
  }

  update(time, delta) {
    const k = 1 - Math.exp((-SUAVIZADO * delta) / 1000);
    for (const c of this.corredores.values()) {
      c.mostrado += (c.progreso - c.mostrado) * k;
      const y = c.yInicio + c.mostrado * (c.yFin - c.yInicio);
      // Cuanto más fuerte agita, más tiembla el cohete.
      const temblor = c.intensidad * c.ancho * 0.08;
      c.cohete.setPosition(c.x + (Math.random() - 0.5) * temblor, y + (Math.random() - 0.5) * temblor);
      c.cohete.setRotation((Math.random() - 0.5) * 0.05 * c.intensidad);
      this.pintarLlama(c);
      if (Math.random() < c.intensidad * 0.7) c.humo.emitParticleAt(c.x, y + c.alto * 0.5);
    }
  }

  // Llama parpadeante: casi apagada en reposo y larga al agitar fuerte. Sin llama al llegar.
  pintarLlama(c) {
    const g = c.llama;
    g.clear();
    if (c.puesto) return;
    const h = c.alto;
    const w = c.ancho;
    const largo = h * (0.08 + 0.75 * c.intensidad) * (0.85 + Math.random() * 0.3);
    const y0 = h * 0.43;
    g.fillStyle(0xff4d6d, 0.9).fillTriangle(-w * 0.3, y0, w * 0.3, y0, 0, y0 + largo);
    g.fillStyle(0xff8c42).fillTriangle(-w * 0.22, y0, w * 0.22, y0, 0, y0 + largo * 0.75);
    g.fillStyle(0xffd23f).fillTriangle(-w * 0.12, y0, w * 0.12, y0, 0, y0 + largo * 0.45);
  }

  // players: [{ id, progress, intensity, place }]
  actualizar({ players = [] }) {
    for (const p of players) {
      const c = this.corredores.get(p.id);
      if (!c) continue;
      c.progreso = p.progress;
      c.intensidad = p.intensity;
      if (p.place && !c.puesto) this.llegar(c, p.place);
    }
  }

  llegar(c, puesto) {
    c.puesto = puesto;
    c.medalla.destroy();
    c.medalla = this.medalla(c);
    this.objetos.push(c.medalla);
    c.medalla.setScale(0);
    this.tweens.add({ targets: c.medalla, scale: 1, duration: 450, ease: 'Back.easeOut' });
    if (puesto === 1) this.cameras.main.shake(250, 0.006);

    const confeti = this.add.particles(c.x, c.yFin, 'confeti', {
      emitting: false,
      lifespan: 1600,
      speed: { min: 150, max: 450 },
      angle: { min: 0, max: 360 },
      gravityY: 500,
      rotate: { min: 0, max: 360 },
      scale: { min: 0.6, max: 1.1 },
      tint: [c.color, 0xffffff, 0xffd23f, 0xff4d8d],
    });
    confeti.explode(puesto === 1 ? 70 : 30);
    this.time.delayedCall(1800, () => confeti.destroy());
  }

  conexion(id, conectado) {
    const c = this.corredores.get(id);
    if (!c) return;
    c.conectado = conectado;
    this.pintarConexion(c);
  }

  quitar(id) {
    if (!this.corredores.delete(id)) return;
    this.construir();
  }
}
