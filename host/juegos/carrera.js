// Carrera de agitar en la pantalla: un carril por jugador. El servidor manda el progreso unas 10 veces
// por segundo y aquí se interpola para que las fichas se muevan suaves a 60 fps.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';

const FONDO_CARRIL = 0x241b4e;
const TEXTO = '#f7f4ff';
const TEXTO_OSCURO = '#1a0f2e';
const MEDALLAS = [0xffd23f, 0xd9d9e8, 0xe0975a]; // oro, plata y bronce; el resto, gris
const SUAVIZADO = 8; // cuanto más alto, antes alcanza la ficha su posición real

const numero = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;
const inicial = (nombre) => [...nombre][0]?.toUpperCase() ?? '?';

export class Carrera extends Phaser.Scene {
  init({ jugadores }) {
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
    g.fillStyle(0xffffff).fillCircle(8, 8, 8).generateTexture('punto', 16, 16);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 10, 16).generateTexture('confeti', 10, 16);
    g.destroy();
  }

  // Coloca carriles y fichas según el tamaño de la pantalla. Se repite al redimensionar o si sale alguien.
  construir() {
    for (const o of this.objetos) o.destroy();
    this.objetos = [];

    const { width, height } = this.scale;
    const n = Math.max(1, this.corredores.size);
    const margen = Math.max(24, width * 0.03);
    const columna = Math.min(240, width * 0.17); // para los nombres
    const alto = Math.min(130, (height - 2 * margen) / n);
    const carril = alto * 0.78;
    const r = carril * 0.4;
    const hueco = (carril - 2 * r) / 2;
    const x0 = margen + columna;
    const ancho = width - margen - x0;
    const meta = carril * 0.32;
    const y0 = (height - alto * n) / 2 + alto / 2;
    const tam = (f) => `${Math.round(f)}px`;

    [...this.corredores.values()]
      .sort((a, b) => a.id - b.id)
      .forEach((c, i) => {
        const y = y0 + i * alto;
        Object.assign(c, { y, r, carril, x0, hueco, xInicio: x0 + hueco + r, xFin: x0 + ancho - meta - hueco - r });

        const pista = this.add.graphics();
        pista.fillStyle(FONDO_CARRIL, 0.92).fillRoundedRect(x0, y - carril / 2, ancho, carril, carril / 2);
        pista.lineStyle(2, 0xffffff, 0.12).strokeRoundedRect(x0, y - carril / 2, ancho, carril, carril / 2);
        // Meta a cuadros
        const lado = carril / 7;
        const xm = x0 + ancho - meta - hueco / 2;
        for (let fila = 0; fila < 5; fila++) {
          for (let col = 0; col < 2; col++) {
            pista.fillStyle((fila + col) % 2 ? 0x1a0f2e : 0xffffff, 0.75);
            pista.fillRect(xm + col * lado, y - 2.5 * lado + fila * lado, lado, lado);
          }
        }

        c.rastro = this.add.graphics();
        c.polvo = this.add.particles(0, 0, 'punto', {
          emitting: false,
          lifespan: 450,
          speed: { min: 40, max: 140 },
          angle: { min: 160, max: 220 },
          scale: { start: r / 40, end: 0 },
          alpha: { start: 0.5, end: 0 },
          tint: c.color,
        });

        c.nombre = this.add
          .text(x0 - 20, y, c.name, { fontFamily: 'Fredoka', fontSize: tam(carril * 0.34), fontStyle: '600', color: TEXTO })
          .setOrigin(1, 0.5);
        if (c.nombre.width > columna - 30) c.nombre.setScale((columna - 30) / c.nombre.width);

        // La sombra asoma por debajo, como el borde inferior de los avatares del lobby.
        const sombra = this.add.circle(0, r * 0.12, r, 0x000000, 0.3);
        const circulo = this.add.circle(0, 0, r, c.color);
        const letra = this.add
          .text(0, 0, inicial(c.name), { fontFamily: 'Fredoka', fontSize: tam(r * 1.1), fontStyle: '700', color: TEXTO_OSCURO })
          .setOrigin(0.5);
        c.ficha = this.add.container(c.xInicio, y, [sombra, circulo, letra]);

        c.medalla = this.medalla(c);
        this.objetos.push(pista, c.rastro, c.polvo, c.nombre, c.ficha, c.medalla);
        this.pintarConexion(c);
      });
  }

  medalla(c) {
    const color = MEDALLAS[c.puesto - 1] ?? 0xb9b2d9;
    const radio = c.r * 0.55;
    const medalla = this.add.container(c.xFin - c.r * 1.9, c.y, [
      this.add.circle(0, 0, radio, color),
      this.add
        .text(0, 0, `${c.puesto}º`, { fontFamily: 'Fredoka', fontSize: `${Math.round(radio)}px`, fontStyle: '700', color: TEXTO_OSCURO })
        .setOrigin(0.5),
    ]);
    medalla.setVisible(c.puesto > 0);
    return medalla;
  }

  pintarConexion(c) {
    const alfa = c.conectado ? 1 : 0.35;
    c.ficha.setAlpha(alfa);
    c.nombre.setAlpha(alfa);
  }

  update(time, delta) {
    const k = 1 - Math.exp((-SUAVIZADO * delta) / 1000);
    for (const c of this.corredores.values()) {
      c.mostrado += (c.progreso - c.mostrado) * k;
      const x = c.xInicio + c.mostrado * (c.xFin - c.xInicio);
      // Cuanto más fuerte agita, más bota y se tambalea la ficha.
      const bote = Math.abs(Math.sin(time / 70 + c.id)) * c.intensidad * c.r * 0.45;
      c.ficha.setPosition(x, c.y - bote);
      c.ficha.setRotation(Math.sin(time / 55 + c.id) * 0.22 * c.intensidad);

      c.rastro.clear();
      c.rastro.fillStyle(c.color, 0.28);
      c.rastro.fillRoundedRect(c.x0, c.y - c.carril / 2, x + c.r + c.hueco - c.x0, c.carril, c.carril / 2);

      if (Math.random() < c.intensidad * 0.6) c.polvo.emitParticleAt(x - c.r * 0.8, c.y + c.r * 0.7);
    }
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

    const confeti = this.add.particles(c.xFin, c.y, 'confeti', {
      emitting: false,
      lifespan: 1400,
      speed: { min: 200, max: 520 },
      angle: { min: 200, max: 340 },
      gravityY: 900,
      rotate: { min: 0, max: 360 },
      scale: { min: 0.6, max: 1.1 },
      tint: [c.color, 0xffffff, 0xffd23f, 0xff4d8d],
    });
    confeti.explode(puesto === 1 ? 60 : 25);
    this.time.delayedCall(1600, () => confeti.destroy());
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
