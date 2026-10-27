// Tira y afloja: dos equipos agitan el móvil para tirar de la cuerda hacia su lado. La cuerda se mueve según la
// diferencia entre la intensidad media de cada equipo, así que da igual que un equipo tenga un jugador más.
import { Minijuego } from './minijuego.js';

const VELOCIDAD = 0.32; // cuánto se mueve la cuerda por segundo con un equipo agitando al máximo y el otro quieto
export const EQUIPOS = [
  { nombre: 'Fuego', color: '#ff5a3c' },
  { nombre: 'Hielo', color: '#3ca8ff' },
];

export class Tira extends Minijuego {
  static id = 'tira';
  static nombre = 'Tira y afloja';
  static instrucciones = '¡Agita el móvil con tu equipo para tirar de la cuerda hacia vuestro lado!';
  static control = 'agitar';
  static duracion = 30_000;
  static envio = 100;

  constructor(ids, opciones) {
    super(ids, opciones);
    // Equipos al azar y equilibrados.
    const barajados = [...ids].sort(() => Math.random() - 0.5);
    this.jugadores = new Map(barajados.map((id, i) => [id, { equipo: i % 2, intensidad: 0, conectado: true }]));
    this.cuerda = 0; // de -1 (gana Fuego) a 1 (gana Hielo)
    this.ganador = null;
    this.avisado = false;
  }

  onInput(id, entrada) {
    const j = this.jugadores.get(id);
    if (entrada.type !== 'shake' || !j || this.ganador !== null) return;
    j.intensidad = entrada.intensity;
  }

  fuerza(equipo) {
    const del = [...this.jugadores.values()].filter((j) => j.equipo === equipo && j.conectado);
    return del.length ? del.reduce((a, j) => a + j.intensidad, 0) / del.length : 0;
  }

  tick(dt) {
    if (!this.avisado) {
      this.avisado = true;
      for (const [id, j] of this.jugadores) {
        this.avisar(id, { type: 'hint', title: `Equipo ${EQUIPOS[j.equipo].nombre}`, text: '¡Agita para tirar!' });
      }
    }
    if (this.ganador !== null) return;
    this.cuerda = Math.max(-1, Math.min(1, this.cuerda + (this.fuerza(1) - this.fuerza(0)) * VELOCIDAD * dt));
    if (Math.abs(this.cuerda) >= 1) {
      this.ganador = this.cuerda < 0 ? 0 : 1;
      for (const [id, j] of this.jugadores) {
        const gana = j.equipo === this.ganador;
        this.vibrar(id, gana ? 300 : 600);
        this.avisar(id, { type: 'hint', title: gana ? '¡Habéis ganado!' : 'Habéis perdido', text: '', mood: gana ? 'bien' : 'mal' });
      }
    }
  }

  terminado() {
    return super.terminado() || this.ganador !== null;
  }

  estado() {
    return {
      rope: Math.round(this.cuerda * 1000) / 1000,
      winner: this.ganador,
      teams: EQUIPOS,
      players: [...this.jugadores].map(([id, j]) => ({ id, team: j.equipo, intensity: Math.round(j.intensidad * 100) / 100 })),
    };
  }

  conectado(id) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = true;
    this.avisar(id, { type: 'hint', title: `Equipo ${EQUIPOS[j.equipo].nombre}`, text: '¡Agita para tirar!' });
  }

  desconectado(id) {
    const j = this.jugadores.get(id);
    if (!j) return;
    j.conectado = false;
    j.intensidad = 0;
  }

  quitar(id) {
    this.jugadores.delete(id);
  }

  // Gana el equipo hacia el que está la cuerda (todos sus jugadores primeros); si está justo en el centro, empate.
  getResults() {
    const lado = this.ganador ?? (this.cuerda < 0 ? 0 : this.cuerda > 0 ? 1 : null);
    const ganadores = [...this.jugadores].filter(([, j]) => lado === null || j.equipo === lado);
    const perdedores = [...this.jugadores].filter(([, j]) => lado !== null && j.equipo !== lado);
    return [
      ...ganadores.map(([id]) => ({ id, puesto: 1 })),
      ...perdedores.map(([id]) => ({ id, puesto: ganadores.length + 1 })),
    ];
  }
}
