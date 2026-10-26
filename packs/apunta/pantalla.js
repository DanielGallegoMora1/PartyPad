// Apunta y dispara: escena de la pantalla. Llega dentro del ZIP del pack y la pantalla la carga desde IndexedDB,
// así que no importa nada por ruta: recibe Phaser y las URL de sus recursos (sprites WebP y sonidos Opus).
export default (Phaser, recursos) => {
  const TEXTO = '#f7f4ff';
  const TEXTO_SUAVE = '#b9b2d9';
  const TEXTO_OSCURO = '#1a0f2e';
  const PANEL = 0x1f1747;
  const SUAVIZADO = 18;

  const numero = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;
  const inicial = (nombre) => [...nombre][0]?.toUpperCase() ?? '?';
  const texto = (tamano, color, peso = '600') => ({ fontFamily: 'Fredoka', fontSize: `${Math.round(tamano)}px`, fontStyle: peso, color });

  return class Apunta extends Phaser.Scene {
    init({ jugadores = [], inicio = {} }) {
      this.listo = false;
      this.inicio = inicio;
      this.ancho = inicio.setup?.width ?? 16 / 9;
      this.tiradores = new Map(
        jugadores.map((j) => [j.id, { ...j, color: numero(j.hex), x: this.ancho / 2, y: 0.5, puntos: 0, conectado: j.connected }]),
      );
      this.dianas = new Map(); // n → { datos, sprite, anillo }
      this.vistos = new Set(); // disparos ya animados
      this.objetos = [];
      this.ultimoSonido = 0;
    }

    preload() {
      if (!this.textures.exists('apunta-diana')) this.load.image('apunta-diana', recursos['recursos/diana.webp']);
      if (!this.textures.exists('apunta-oro')) this.load.image('apunta-oro', recursos['recursos/diana-oro.webp']);
      // Sin extensión en la URL (es un blob), así que se le dice a Phaser el formato.
      if (!this.cache.audio.exists('apunta-disparo')) this.load.audio('apunta-disparo', [{ type: 'webm', url: recursos['recursos/disparo.webm'] }]);
      if (!this.cache.audio.exists('apunta-acierto')) this.load.audio('apunta-acierto', [{ type: 'webm', url: recursos['recursos/acierto.webm'] }]);
    }

    create() {
      if (!this.textures.exists('apunta-chispa')) {
        const g = this.make.graphics({ add: false });
        g.fillStyle(0xffffff).fillCircle(8, 8, 8).generateTexture('apunta-chispa', 16, 16);
        g.destroy();
      }
      this.construir();
      this.scale.on('resize', this.construir, this);
      this.events.once('shutdown', () => this.scale.off('resize', this.construir, this));
      this.listo = true;
      this.actualizar(this.inicio, false);
    }

    px(x) {
      return this.ox + x * this.escala;
    }

    py(y) {
      return this.oy + y * this.escala;
    }

    construir() {
      for (const o of this.objetos) o.destroy();
      for (const d of this.dianas.values()) d.sprite.destroy();
      this.dianas.clear();
      this.objetos = [];
      this.tweens.killAll();

      const { width, height } = this.scale;
      const margen = Math.max(20, Math.min(width, height) * 0.03);
      const reloj = 64;
      this.columna = Math.min(width * 0.18, 230);
      this.escala = Math.min((width - this.columna - 3 * margen) / this.ancho, height - reloj - margen);
      this.ox = margen + (width - this.columna - 3 * margen - this.ancho * this.escala) / 2;
      this.oy = reloj + (height - reloj - margen - this.escala) / 2;

      // Campo con una rejilla suave
      const g = this.add.graphics();
      const w = this.ancho * this.escala;
      const h = this.escala;
      g.fillStyle(PANEL, 0.9).fillRoundedRect(this.ox, this.oy, w, h, 18);
      g.lineStyle(1, 0xffffff, 0.05);
      for (let x = 1; x < 16; x++) g.lineBetween(this.ox + (x * w) / 16, this.oy, this.ox + (x * w) / 16, this.oy + h);
      for (let y = 1; y < 9; y++) g.lineBetween(this.ox, this.oy + (y * h) / 9, this.ox + w, this.oy + (y * h) / 9);
      this.objetos.push(g);

      this.capaDianas = this.add.graphics(); // anillos de vida de las dianas
      this.objetos.push(this.capaDianas);

      // Mirillas, una por jugador
      for (const t of this.tiradores.values()) {
        const r = this.escala * 0.035;
        const anillo = this.add.graphics();
        anillo.lineStyle(Math.max(3, r * 0.22), t.color, 1).strokeCircle(0, 0, r);
        anillo.lineBetween(-r * 1.6, 0, -r * 0.5, 0).lineBetween(r * 0.5, 0, r * 1.6, 0);
        anillo.lineBetween(0, -r * 1.6, 0, -r * 0.5).lineBetween(0, r * 0.5, 0, r * 1.6);
        anillo.fillStyle(t.color).fillCircle(0, 0, r * 0.15);
        const placa = this.add.circle(r * 1.5, -r * 1.5, r * 0.65, t.color);
        const letra = this.add.text(r * 1.5, -r * 1.5, inicial(t.name), texto(r * 0.8, TEXTO_OSCURO, '700')).setOrigin(0.5);
        t.mirilla = this.add.container(this.px(t.x), this.py(t.y), [anillo, placa, letra]).setDepth(10);
        t.mirilla.setAlpha(t.conectado ? 1 : 0.35);
        this.objetos.push(t.mirilla);
      }

      this.marcador = this.add.container(0, 0).setDepth(5);
      this.objetos.push(this.marcador);
      this.pintarMarcador();
      if (this.ultimoEstado) this.sincronizarDianas(this.ultimoEstado.targets ?? [], false);
    }

    pintarMarcador() {
      this.marcador.removeAll(true);
      const { width } = this.scale;
      const x = width - this.columna / 2 - 12;
      const fila = Math.min(54, (this.escala - 40) / Math.max(4, this.tiradores.size));
      this.marcador.add(this.add.text(x, this.oy, 'Puntos', texto(fila * 0.45, TEXTO_SUAVE)).setOrigin(0.5, 0));
      [...this.tiradores.values()]
        .sort((a, b) => b.puntos - a.puntos || a.id - b.id)
        .forEach((t, i) => {
          const y = this.oy + fila * (1.3 + i);
          const izquierda = x - this.columna / 2 + 16;
          this.marcador.add([
            this.add.circle(izquierda + fila * 0.35, y, fila * 0.35, t.color).setAlpha(t.conectado ? 1 : 0.4),
            this.add.text(izquierda + fila * 0.35, y, inicial(t.name), texto(fila * 0.38, TEXTO_OSCURO, '700')).setOrigin(0.5),
            this.add.text(izquierda + fila * 0.85, y, t.name, texto(fila * 0.36, TEXTO)).setOrigin(0, 0.5),
            this.add.text(x + this.columna / 2 - 16, y, String(t.puntos), texto(fila * 0.48, TEXTO, '700')).setOrigin(1, 0.5),
          ]);
        });
    }

    // Crea las dianas nuevas y quita las que ya no están (acertadas o caducadas).
    sincronizarDianas(lista, animar) {
      const vivas = new Set(lista.map((d) => d.n));
      for (const [n, d] of this.dianas) {
        if (vivas.has(n)) continue;
        this.dianas.delete(n);
        if (d.acertada || !animar) d.sprite.destroy();
        else this.tweens.add({ targets: d.sprite, alpha: 0, scale: d.sprite.scale * 0.6, duration: 200, onComplete: () => d.sprite.destroy() });
      }
      for (const datos of lista) {
        const d = this.dianas.get(datos.n);
        if (d) {
          d.datos = datos;
          continue;
        }
        const sprite = this.add.image(this.px(datos.x), this.py(datos.y), datos.gold ? 'apunta-oro' : 'apunta-diana');
        const escala = (2 * datos.r * this.escala) / sprite.width;
        sprite.setScale(animar ? 0 : escala);
        if (animar) this.tweens.add({ targets: sprite, scale: escala, duration: 220, ease: 'Back.easeOut' });
        if (datos.gold) this.tweens.add({ targets: sprite, angle: 360, duration: 1500, repeat: -1 });
        this.dianas.set(datos.n, { datos, sprite });
      }
    }

    update(time, delta) {
      const k = 1 - Math.exp((-SUAVIZADO * delta) / 1000);
      for (const t of this.tiradores.values()) {
        if (!t.mirilla) continue;
        t.mirilla.x += (this.px(t.x) - t.mirilla.x) * k;
        t.mirilla.y += (this.py(t.y) - t.mirilla.y) * k;
      }
      // Anillo que se vacía con la vida que le queda a cada diana
      const g = this.capaDianas;
      g.clear();
      for (const { datos } of this.dianas.values()) {
        const r = datos.r * this.escala * 1.2;
        g.lineStyle(4, datos.gold ? 0xffd23f : 0xffffff, 0.5);
        g.beginPath();
        g.arc(this.px(datos.x), this.py(datos.y), r, -Math.PI / 2, -Math.PI / 2 + datos.life * Math.PI * 2);
        g.strokePath();
      }
    }

    // players: [{ id, x, y, score }], targets: [{ n, x, y, r, gold, life }], shots: [{ n, id, x, y, diana, puntos }]
    actualizar(estado, animar = true) {
      const { players, targets, shots = [] } = estado;
      if (!players) return;
      this.ultimoEstado = estado;
      let cambiaMarcador = false;
      for (const p of players) {
        const t = this.tiradores.get(p.id);
        if (!t) continue;
        t.x = p.x;
        t.y = p.y;
        if (t.puntos !== p.score) cambiaMarcador = true;
        t.puntos = p.score;
      }
      for (const s of shots) {
        if (this.vistos.has(s.n)) continue;
        this.vistos.add(s.n);
        if (animar) this.disparo(s);
      }
      this.sincronizarDianas(targets ?? [], animar);
      if (cambiaMarcador) this.pintarMarcador();
    }

    disparo(s) {
      const t = this.tiradores.get(s.id);
      const x = this.px(s.x);
      const y = this.py(s.y);
      const fogonazo = this.add.circle(x, y, this.escala * 0.02, 0xffffff, 0.9);
      this.tweens.add({ targets: fogonazo, scale: 3, alpha: 0, duration: 220, onComplete: () => fogonazo.destroy() });
      this.sonar(s.diana ? 'apunta-acierto' : 'apunta-disparo', s.diana ? 0.6 : 0.25);
      if (!s.diana) return;
      const d = this.dianas.get(s.diana);
      if (d) {
        d.acertada = true;
        const sprite = d.sprite;
        this.tweens.add({ targets: sprite, scale: sprite.scale * 1.6, alpha: 0, duration: 180, onComplete: () => sprite.destroy() });
        this.dianas.delete(s.diana);
      }
      const chispas = this.add.particles(x, y, 'apunta-chispa', {
        emitting: false,
        lifespan: 500,
        speed: { min: 120, max: 360 },
        scale: { start: 0.9, end: 0 },
        tint: [t?.color ?? 0xffffff, 0xffffff, s.puntos > 1 ? 0xffd23f : 0xff4d6d],
      });
      chispas.explode(s.puntos > 1 ? 40 : 18);
      this.time.delayedCall(600, () => chispas.destroy());
      const mas = this.add.text(x, y, `+${s.puntos}`, texto(this.escala * (s.puntos > 1 ? 0.09 : 0.06), TEXTO, '700')).setOrigin(0.5).setDepth(20);
      mas.setStroke(`#${(t?.color ?? 0xffffff).toString(16).padStart(6, '0')}`, 6);
      this.tweens.add({ targets: mas, y: y - this.escala * 0.12, alpha: 0, duration: 800, ease: 'Cubic.easeOut', onComplete: () => mas.destroy() });
    }

    // Con muchos disparos seguidos no se pisan los sonidos.
    sonar(clave, volumen) {
      if (this.time.now - this.ultimoSonido < 40 || !this.cache.audio.exists(clave)) return;
      this.ultimoSonido = this.time.now;
      this.sound.play(clave, { volume: volumen, seek: this.inicioSonido(clave) });
    }

    // Segundo en que empieza a sonar de verdad: los Opus grabados con MediaRecorder llevan silencio al principio,
    // y en un disparo se notaría como retraso.
    inicioSonido(clave) {
      this.inicios ??= {};
      if (this.inicios[clave] === undefined) {
        const buffer = this.cache.audio.get(clave);
        let inicio = 0;
        if (buffer?.getChannelData) {
          const datos = buffer.getChannelData(0);
          const primero = datos.findIndex((v) => Math.abs(v) > 0.02);
          inicio = primero > 0 ? Math.max(0, primero / buffer.sampleRate - 0.005) : 0;
        }
        this.inicios[clave] = inicio;
      }
      return this.inicios[clave];
    }

    conexion(id, conectado) {
      const t = this.tiradores.get(id);
      if (!t) return;
      t.conectado = conectado;
      t.mirilla?.setAlpha(conectado ? 1 : 0.35);
      this.pintarMarcador();
    }

    quitar(id) {
      if (!this.tiradores.delete(id)) return;
      this.construir();
    }
  };
};
