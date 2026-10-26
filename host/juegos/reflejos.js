// Reflejos en la pantalla: un gran círculo que se pone verde con la señal y una tarjeta por jugador con su tiempo.
// La señal la da el servidor y se muestra en cuanto llega el estado: aquí no se interpola nada, porque cualquier
// retraso en la pantalla es tiempo de reacción que se les cuenta a los jugadores.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';
import * as sonido from '../sonido.js';

const TEXTO = '#f7f4ff';
const TEXTO_SUAVE = '#b9b2d9';
const TEXTO_OSCURO = '#1a0f2e';
const ROJO_TEXTO = '#ff5c5c';
const ORO_TEXTO = '#ffd23f';
const VERDE = 0x3ddc84;
const ROJO = 0xff5c5c;
const MORADO = 0x6a4fd8;
const GRIS = 0x4a4270;
const HECHA = 0xb9b2d9;
const TARJETA = 0x1f1747;

const numero = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;
const inicial = (nombre) => [...nombre][0]?.toUpperCase() ?? '?';
const segundos = (ms) => `${(ms / 1000).toFixed(2).replace('.', ',')} s`;
const texto = (tamano, color, peso = '600') => ({ fontFamily: 'Fredoka', fontSize: `${Math.round(tamano)}px`, fontStyle: peso, color });

export class Reflejos extends Phaser.Scene {
  init({ jugadores = [], inicio = {} }) {
    this.listo = false;
    this.inicio = inicio;
    this.fase = null; // preparados | espera | ya | pausa
    this.senal = 0;
    this.senales = inicio.signals ?? 5;
    this.ganador = null;
    this.jugadores = new Map(
      jugadores.map((j) => [
        j.id,
        { ...j, color: numero(j.hex), ms: null, early: false, missed: false, total: 0, conectado: j.connected },
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
    this.actualizar(this.inicio, false);
  }

  texturas() {
    if (this.textures.exists('confeti')) return;
    const g = this.make.graphics({ add: false });
    g.fillStyle(0xffffff).fillCircle(16, 16, 16).generateTexture('punto', 32, 32);
    g.clear().fillStyle(0xffffff).fillRect(0, 0, 10, 16).generateTexture('confeti', 10, 16);
    g.destroy();
  }

  // Coloca todo según el tamaño de la pantalla. Se repite al redimensionar o si sale alguien.
  construir() {
    for (const o of this.objetos) o.destroy();
    this.objetos = [];
    this.tweens.killAll();
    this.respira = null;

    const { width, height } = this.scale;
    const margen = Math.max(24, Math.min(width, height) * 0.04);
    const reloj = 64; // hueco arriba para el reloj de la ronda
    const abajo = height * (this.jugadores.size > 8 ? 0.5 : 0.62); // donde empiezan las tarjetas (dos filas con más de 8)

    // El destello verde de la señal ocupa toda la pantalla.
    this.destello = this.add.rectangle(0, 0, width, height, VERDE, 0).setOrigin(0);

    // El círculo con su halo y el subtítulo caben entre el reloj y las tarjetas.
    const subtitulo = Math.max(40, height * 0.06);
    const r = Math.min(width * 0.16, (abajo - reloj - subtitulo) / 2.7);
    const cx = width / 2;
    const cy = reloj + 1.35 * r;
    this.halo = this.add.circle(cx, cy, r * 1.3, GRIS, 0.18);
    this.disco = this.add.circle(cx, cy, r, GRIS);
    const brillo = this.add.circle(cx - r * 0.35, cy - r * 0.38, r * 0.26, 0xffffff, 0.2);
    this.textoDisco = this.add.text(cx, cy, '', texto(r * 0.4, TEXTO, '700')).setOrigin(0.5);
    this.subtitulo = this.add
      .text(cx, cy + r * 1.3 + subtitulo / 2, '', texto(Math.max(18, r * 0.19), TEXTO_SUAVE))
      .setOrigin(0.5);

    // Señales: cuántas van y cuántas quedan, arriba a la izquierda.
    this.contador = this.add.text(margen, margen * 0.5, '', texto(Math.max(16, height * 0.03), TEXTO_SUAVE)).setOrigin(0);
    const yPuntos = margen * 0.5 + Math.max(16, height * 0.03) * 1.9;
    this.puntos = Array.from({ length: this.senales }, (_, i) => this.add.circle(margen + 9 + i * 28, yPuntos, 9, GRIS));

    this.objetos.push(this.destello, this.halo, this.disco, brillo, this.textoDisco, this.subtitulo, this.contador, ...this.puntos);

    // Una tarjeta por jugador, en una fila; con más de 8 jugadores, en dos.
    const lista = [...this.jugadores.values()].sort((a, b) => a.id - b.id);
    const filas = lista.length > 8 ? 2 : 1;
    const porFila = Math.max(1, Math.ceil(lista.length / filas));
    const hueco = Math.min(20, width * 0.015);
    const alto = (height - abajo - margen - (filas - 1) * hueco) / filas;
    const w = Math.min(210, (width - 2 * margen - (porFila - 1) * hueco) / porFila);
    const h = Math.min(alto, w * 1.3);
    lista.forEach((j, i) => {
      const fila = Math.floor(i / porFila);
      const enFila = Math.min(porFila, lista.length - fila * porFila);
      const x0 = (width - (enFila * w + (enFila - 1) * hueco)) / 2 + w / 2;
      const y = abajo + fila * (alto + hueco) + alto / 2;
      j.tarjeta = this.tarjeta(j, x0 + (i % porFila) * (w + hueco), y, w, h);
      this.objetos.push(j.tarjeta.caja);
    });

    this.pintar();
    this.efectoFase(false);
  }

  tarjeta(j, x, y, w, h) {
    const fondo = this.add.graphics();
    const radio = Math.min(20, w * 0.12);
    fondo.fillStyle(TARJETA, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, radio);
    fondo.lineStyle(3, j.color, 0.55).strokeRoundedRect(-w / 2, -h / 2, w, h, radio);
    const ra = Math.min(w * 0.18, h * 0.14);
    const yAvatar = -h / 2 + h * 0.22;
    const avatar = this.add.circle(0, yAvatar, ra, j.color);
    const letra = this.add.text(0, yAvatar, j.emoji ?? inicial(j.name), texto(ra * 1.1, TEXTO_OSCURO, '700')).setOrigin(0.5);
    const nombre = this.add.text(0, -h / 2 + h * 0.46, j.name, texto(w * 0.11, TEXTO)).setOrigin(0.5);
    if (nombre.width > w * 0.88) nombre.setScale((w * 0.88) / nombre.width);
    const tiempo = this.add.text(0, -h / 2 + h * 0.67, '', texto(w * 0.15, TEXTO, '700')).setOrigin(0.5);
    const total = this.add.text(0, -h / 2 + h * 0.87, '', texto(w * 0.085, TEXTO_SUAVE, '500')).setOrigin(0.5);
    const caja = this.add.container(x, y, [fondo, avatar, letra, nombre, tiempo, total]);
    return { caja, tiempo, total, x, y };
  }

  // Pone colores y textos según el estado, sin animar.
  pintar() {
    const ganador = this.fase === 'pausa' ? this.jugadores.get(this.ganador) : null;
    const aspecto = {
      espera: [ROJO, 'Espera…', 'Todavía no…', TEXTO],
      ya: [VERDE, '¡YA!', '¡Pulsa!', TEXTO_OSCURO],
      pausa: ganador
        ? [ganador.color, `${ganador.ms} ms`, `⚡ ${ganador.name} ha sido el más rápido`, TEXTO_OSCURO]
        : [GRIS, '—', 'Nadie ha pulsado a tiempo', TEXTO],
    }[this.fase] ?? [MORADO, 'Atentos', 'Pulsa cuando el círculo se ponga verde', TEXTO];
    const [color, principal, sub, colorTexto] = aspecto;
    this.disco.setFillStyle(color);
    this.halo.setFillStyle(color, 0.18);
    this.textoDisco.setText(principal).setColor(colorTexto);
    this.subtitulo.setText(sub);

    this.contador.setText(this.senal ? `Señal ${this.senal} de ${this.senales}` : `${this.senales} señales`);
    this.puntos.forEach((p, i) => {
      const actual = i === this.senal - 1;
      p.setFillStyle(actual ? color : i < this.senal - 1 ? HECHA : GRIS);
      p.setScale(actual ? 1.25 : 1);
    });

    const jugando = this.fase === 'espera' || this.fase === 'ya';
    for (const [id, j] of this.jugadores) {
      let t = '';
      let c = TEXTO;
      if (j.early) [t, c] = ['¡Pronto!', ROJO_TEXTO];
      else if (j.missed) [t, c] = ['Tarde', TEXTO_SUAVE];
      else if (j.ms !== null) [t, c] = [`${j.ms} ms`, ganador && id === this.ganador ? ORO_TEXTO : TEXTO];
      else if (jugando) [t, c] = ['…', TEXTO_SUAVE];
      j.tarjeta.tiempo.setText(t).setColor(c);
      j.tarjeta.total.setText(`Total ${segundos(j.total)}`);
      j.tarjeta.caja.setAlpha(j.conectado ? 1 : 0.4);
    }
  }

  // Lo que se anima al cambiar de fase. Con animar a false (al montar o redimensionar) solo lo que es continuo.
  efectoFase(animar) {
    this.respira?.remove();
    this.respira = null;
    this.disco.setScale(1);
    this.halo.setScale(1);
    if (this.fase === 'espera') {
      this.respira = this.tweens.add({
        targets: [this.disco, this.halo],
        scale: 1.05,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    if (!animar) return;
    if (this.fase === 'ya') {
      sonido.senal();
      this.destello.setAlpha(0.35);
      this.tweens.add({ targets: this.destello, alpha: 0, duration: 450, ease: 'Cubic.easeOut' });
      this.disco.setScale(0.7);
      this.tweens.add({ targets: [this.disco, this.halo], scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.cameras.main.shake(120, 0.004);
    }
    const ganador = this.jugadores.get(this.ganador);
    if (this.fase === 'pausa' && ganador) {
      const { caja, x, y } = ganador.tarjeta;
      this.tweens.add({ targets: caja, scale: 1.1, duration: 180, yoyo: true, ease: 'Back.easeOut' });
      const confeti = this.add.particles(x, y, 'confeti', {
        emitting: false,
        lifespan: 1300,
        speed: { min: 150, max: 380 },
        angle: { min: 200, max: 340 },
        gravityY: 600,
        rotate: { min: 0, max: 360 },
        scale: { min: 0.5, max: 1 },
        tint: [ganador.color, 0xffffff, 0xffd23f],
      });
      confeti.explode(40);
      this.objetos.push(confeti);
    }
  }

  // Alguien acaba de pulsar: la tarjeta salta, o tiembla si se ha adelantado.
  pulsacion(j) {
    const { caja, x } = j.tarjeta;
    if (j.early) sonido.pronto();
    else sonido.pulsacion();
    if (j.early) {
      this.tweens.add({ targets: caja, x: x + 10, duration: 50, yoyo: true, repeat: 3, onComplete: () => caja.setX(x) });
    } else {
      this.tweens.add({ targets: caja, scale: 1.08, duration: 110, yoyo: true, ease: 'Quad.easeOut' });
    }
  }

  // phase, signal, signals, winner y players: [{ id, ms, early, missed, total }]
  actualizar({ phase, signal, signals, winner = null, players = [] }, animar = true) {
    if (phase === undefined) return;
    for (const p of players) {
      const j = this.jugadores.get(p.id);
      if (!j) continue;
      const acabaDePulsar = j.ms === null && p.ms !== null && !p.missed;
      Object.assign(j, { ms: p.ms, early: p.early, missed: p.missed, total: p.total });
      if (acabaDePulsar && animar) this.pulsacion(j);
    }
    const cambio = phase !== this.fase || signal !== this.senal;
    this.fase = phase;
    this.senal = signal;
    this.ganador = winner;
    if (signals !== this.senales) {
      this.senales = signals;
      return this.construir();
    }
    this.pintar();
    if (cambio) this.efectoFase(animar);
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
