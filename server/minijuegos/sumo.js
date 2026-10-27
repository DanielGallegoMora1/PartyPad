// Sumo: todas las bolas en una plataforma redonda que se va encogiendo. Inclinando el móvil hay que empujar a los
// demás fuera sin caerse. Gana quien aguanta más; los que siguen dentro al final empatan.
import { Minijuego, conPuestos } from './minijuego.js';
import { chocarTodas, mover, puestosSupervivencia } from './fisica.js';

const RADIO_INICIAL = 6; // de la plataforma, en unidades
const RADIO_FINAL = 3.2;
const ENCOGE_DESDE = 8; // s: hasta entonces la plataforma no encoge
const BOLA = 0.55;
// Poca aceleración y bastante roce: con más, cualquier inclinación saca la bola de la plataforma.
const FISICA = { aceleracion: 7.5, roce: 1.5, velocidadMax: 5.5 };
const REBOTE = 1.1; // más de 1: los choques empujan más que en el laberinto
const PASO = 0.01;

export class Sumo extends Minijuego {
  static id = 'sumo';
  static nombre = 'Sumo';
  static instrucciones = 'Inclina el móvil para echar a los demás de la plataforma. ¡Que no te tiren a ti!';
  static control = 'inclinar';
  static duracion = 45_000;
  static envio = 50;

  constructor(ids, opciones) {
    super(ids, opciones);
    // Repartidas en círculo a media distancia del centro.
    this.jugadores = new Map(
      ids.map((id, i) => {
        const a = (i / ids.length) * Math.PI * 2;
        const r = RADIO_INICIAL * 0.6;
        return [id, { x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, inclinacion: { x: 0, y: 0 }, fuera: null, conectado: true }];
      }),
    );
  }

  get radio() {
    const t = Math.max(0, this.tiempo - ENCOGE_DESDE) / (this.limite - ENCOGE_DESDE);
    return RADIO_INICIAL - (RADIO_INICIAL - RADIO_FINAL) * Math.min(1, t);
  }

  onInput(id, entrada) {
    const j = this.jugadores.get(id);
    if (entrada.type !== 'tilt' || !j || j.fuera !== null) return;
    j.inclinacion = { x: entrada.x, y: entrada.y };
  }

  tick(dt) {
    const pasos = Math.max(1, Math.ceil(dt / PASO));
    for (let i = 0; i < pasos; i++) this.paso(dt / pasos);
  }

  paso(dt) {
    const dentro = [...this.jugadores.values()].filter((j) => j.fuera === null);
    for (const j of dentro) mover(j, dt, FISICA);
    chocarTodas(dentro, BOLA, REBOTE, (a, b, fuerza) => {
      if (fuerza > 3) for (const [id, j] of this.jugadores) if (j === a || j === b) this.vibrar(id, 40);
    });
    // Se cae quien tiene el centro fuera del borde.
    for (const [id, j] of this.jugadores) {
      if (j.fuera !== null || Math.hypot(j.x, j.y) <= this.radio) continue;
      j.fuera = this.tiempo;
      j.inclinacion = { x: 0, y: 0 };
      this.vibrar(id, 400);
      this.avisar(id, { type: 'hint', title: '¡Te han echado!', text: 'Mira cómo acaba en la pantalla', mood: 'mal' });
    }
  }

  // Acaba si solo queda uno dentro (con al menos dos jugadores) o se acaba el tiempo.
  terminado() {
    const dentro = [...this.jugadores.values()].filter((j) => j.fuera === null && j.conectado).length;
    return super.terminado() || (this.jugadores.size > 1 && dentro <= 1);
  }

  estado() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      radius: r(this.radio),
      players: [...this.jugadores].map(([id, j]) => ({ id, x: r(j.x), y: r(j.y), out: j.fuera !== null })),
    };
  }

  escenario() {
    return { radius: RADIO_INICIAL, ball: BOLA };
  }

  conectado(id) {
    const j = this.jugadores.get(id);
    if (j) j.conectado = true;
  }

  desconectado(id) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = false;
    j.inclinacion = { x: 0, y: 0 };
  }

  quitar(id) {
    this.jugadores.delete(id);
  }

  getResults() {
    return puestosSupervivencia(this.jugadores, conPuestos);
  }
}
