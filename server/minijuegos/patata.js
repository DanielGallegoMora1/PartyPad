// Patata caliente: una bomba con la mecha oculta pasa de mano en mano. Quien la tiene pulsa el botón para pasársela
// a otro al azar; al que le explota, queda eliminado. Después sale otra bomba, hasta que solo queda uno.
import { Minijuego, conPuestos } from './minijuego.js';
import { puestosSupervivencia } from './fisica.js';

const MECHA_MIN = 4; // s que dura cada bomba, al azar entre el mínimo y el máximo
const MECHA_MAX = 9;
const PASE_MIN = 0.3; // s que hay que tenerla antes de poder pasarla, para que nadie la devuelva sin mirar
const ENTRE_BOMBAS = 1.8; // s tras una explosión hasta la siguiente bomba

export class Patata extends Minijuego {
  static id = 'patata';
  static nombre = 'Patata caliente';
  static instrucciones = '¡Si te llega la bomba, pulsa para pasarla! Al que le explote, queda eliminado';
  static control = 'tocar';
  static duracion = 90_000;
  static envio = 200;

  constructor(ids, opciones) {
    super(ids, opciones);
    this.jugadores = new Map(ids.map((id) => [id, { fuera: null, conectado: true }]));
    this.portador = null;
    this.desde = 0; // cuándo la recibió
    this.encendida = 0; // cuándo se encendió la mecha
    this.explota = 0;
    this.siguiente = 0.5; // cuándo sale la próxima bomba
    this.pases = 0;
    this.explosion = null; // { n, id }: la última, para animarla en la pantalla
  }

  vivos() {
    return [...this.jugadores].filter(([, j]) => j.fuera === null).map(([id]) => id);
  }

  tick() {
    if (this.portador === null) {
      if (this.tiempo < this.siguiente) return;
      const vivos = this.vivos();
      if (vivos.length < 2 && this.jugadores.size > 1) return;
      this.encendida = this.tiempo;
      this.explota = this.tiempo + MECHA_MIN + Math.random() * (MECHA_MAX - MECHA_MIN);
      this.dar(vivos[Math.floor(Math.random() * vivos.length)]);
      return;
    }
    if (this.tiempo < this.explota) return;
    // ¡Bum!
    const id = this.portador;
    this.jugadores.get(id).fuera = this.tiempo;
    this.explosion = { n: (this.explosion?.n ?? 0) + 1, id };
    this.portador = null;
    this.siguiente = this.tiempo + ENTRE_BOMBAS;
    this.vibrar(id, 700);
    this.avisar(id, { type: 'hint', title: '¡BUM!', text: 'Te ha explotado la bomba', mood: 'mal', lock: true });
    this.enviarAhora = true;
  }

  dar(id) {
    const anterior = this.portador;
    this.portador = id;
    this.desde = this.tiempo;
    this.pases++;
    this.vibrar(id, 150);
    this.avisar(id, { type: 'hint', title: '¡Tienes la bomba!', text: '¡Pulsa para pasarla!', mood: 'mal', lock: false });
    if (anterior !== null) this.avisar(anterior, { type: 'hint', title: 'Pasada', text: 'Cuidado, que puede volver', lock: true });
    this.enviarAhora = true;
  }

  onInput(id, entrada) {
    if (entrada.type !== 'button' || !entrada.pressed || id !== this.portador) return;
    if (this.tiempo - this.desde < PASE_MIN) return;
    const otros = this.vivos().filter((o) => o !== id);
    if (otros.length) this.dar(otros[Math.floor(Math.random() * otros.length)]);
  }

  terminado() {
    return super.terminado() || (this.jugadores.size > 1 && this.vivos().length <= 1);
  }

  estado() {
    return {
      holder: this.portador,
      // Lo que lleva quemada la mecha (de 0 a 1), para que la pantalla meta tensión sin decir cuándo explota.
      fuse: this.portador === null ? 0 : Math.round(((this.tiempo - this.encendida) / (this.explota - this.encendida)) * 100) / 100,
      passes: this.pases,
      boom: this.explosion,
      players: [...this.jugadores].map(([id, j]) => ({ id, out: j.fuera !== null })),
    };
  }

  conectado(id) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = true;
    if (id === this.portador) this.avisar(id, { type: 'hint', title: '¡Tienes la bomba!', text: '¡Pulsa para pasarla!', mood: 'mal', lock: false });
  }

  desconectado(id) {
    const j = this.jugadores.get(id);
    if (j) j.conectado = false;
  }

  quitar(id) {
    this.jugadores.delete(id);
    if (this.portador === id) this.portador = null;
  }

  getResults() {
    return puestosSupervivencia(this.jugadores, conPuestos);
  }
}
