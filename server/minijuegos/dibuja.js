// Dibuja: todos dibujan lo mismo en el móvil y la pantalla enseña los dibujos en directo. Después cada uno vota
// el que más le gusta (no puede votarse a sí mismo). Gana quien más votos recibe.
// Los trazos llegan del mando en JSON (mensajes draw) y se reenvían a la pantalla al momento, sin esperar al
// state_update. El voto llega como BUTTON, con el id del jugador votado como número de botón.
import { Minijuego, conPuestos } from './minijuego.js';

const DIBUJAR = 50; // s
const VOTAR = 20;
const RESULTADO = 6;
const MAX_TRAZOS = 300;
const MAX_PUNTOS = 15_000; // por jugador: el móvil manda los puntos ya simplificados
const COLORES = 8; // índices de PINCELES en shared/opciones.js
const GROSORES = 3;

export const TEMAS = [
  'un gato', 'un perro', 'una casa', 'un cohete', 'una pizza', 'un dinosaurio', 'un robot', 'un helado',
  'una tortuga', 'un fantasma', 'un coche', 'una bicicleta', 'un barco pirata', 'un castillo', 'un unicornio',
  'una hamburguesa', 'un pulpo', 'un árbol', 'una montaña rusa', 'un extraterrestre', 'un superhéroe',
  'una tarta de cumpleaños', 'un pingüino', 'un volcán', 'una sirena', 'un caracol', 'un dragón', 'un móvil',
];

const esEntero = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

export class Dibuja extends Minijuego {
  static id = 'dibuja';
  static nombre = 'Dibuja';
  static instrucciones = 'Dibuja en el móvil lo que diga la pantalla. Luego todos votáis el mejor dibujo';
  static control = 'dibujar';
  static duracion = (DIBUJAR + VOTAR + RESULTADO) * 1000;
  static envio = 1000;

  constructor(ids, opciones) {
    super(ids, opciones);
    this.tema = TEMAS[Math.floor(Math.random() * TEMAS.length)];
    this.fase = null; // dibujar | votar | resultado
    this.finFase = 0;
    this.jugadores = new Map(ids.map((id) => [id, { trazos: [], puntos: 0, voto: null, votos: 0 }]));
  }

  cambiar(fase, segundos) {
    this.fase = fase;
    this.finFase = this.tiempo + segundos;
    this.limite = this.finFase + (fase === 'dibujar' ? VOTAR + RESULTADO : fase === 'votar' ? RESULTADO : 0);
    this.enviarAhora = true;
  }

  // Se puede votar a quien ha dibujado algo y no es uno mismo.
  candidatos(id) {
    return [...this.jugadores].filter(([otro, j]) => otro !== id && j.trazos.length).map(([otro]) => this.perfil(otro)).filter(Boolean);
  }

  tick() {
    if (this.fase === null) {
      this.cambiar('dibujar', DIBUJAR);
      this.avisarTodos({ type: 'draw_start', prompt: this.tema });
      return;
    }
    if (this.tiempo < this.finFase) return;
    if (this.fase === 'dibujar') {
      this.cambiar('votar', VOTAR);
      for (const id of this.jugadores.keys()) this.avisar(id, { type: 'vote_start', candidates: this.candidatos(id) });
    } else if (this.fase === 'votar') {
      for (const j of this.jugadores.values()) j.votos = 0;
      for (const j of this.jugadores.values()) if (j.voto !== null) this.jugadores.get(j.voto).votos++;
      for (const [id, j] of this.jugadores) {
        this.avisar(id, { type: 'hint', title: `${j.votos} voto${j.votos === 1 ? '' : 's'}`, text: 'Mira la pantalla', mood: j.votos ? 'bien' : '' });
      }
      this.cambiar('resultado', RESULTADO);
    }
  }

  // Trazos: { op: 'start', c, w, p: [x, y] } | { op: 'add', p: [x1, y1, x2, y2…] } | { op: 'undo' } | { op: 'clear' }.
  // Coordenadas de 0 a 1000 en un lienzo cuadrado.
  onDatos(id, msg) {
    const j = this.jugadores.get(id);
    if (!j || this.fase !== 'dibujar' || msg.type !== 'draw') return;
    const puntosValidos = (p) => Array.isArray(p) && p.length % 2 === 0 && p.length <= 400 && p.every((v) => esEntero(v, 0, 1000));
    if (msg.op === 'start') {
      if (!esEntero(msg.c, 0, COLORES - 1) || !esEntero(msg.w, 0, GROSORES - 1) || !puntosValidos(msg.p) || msg.p.length !== 2) return;
      if (j.trazos.length >= MAX_TRAZOS || j.puntos >= MAX_PUNTOS) return;
      j.trazos.push({ c: msg.c, w: msg.w, p: [...msg.p] });
      j.puntos += 1;
      this.pantalla({ type: 'draw', id, op: 'start', c: msg.c, w: msg.w, p: msg.p });
    } else if (msg.op === 'add') {
      const trazo = j.trazos.at(-1);
      if (!trazo || !puntosValidos(msg.p) || j.puntos + msg.p.length / 2 > MAX_PUNTOS) return;
      trazo.p.push(...msg.p);
      j.puntos += msg.p.length / 2;
      this.pantalla({ type: 'draw', id, op: 'add', p: msg.p });
    } else if (msg.op === 'undo') {
      const trazo = j.trazos.pop();
      if (trazo) j.puntos -= trazo.p.length / 2;
      this.pantalla({ type: 'draw', id, op: 'undo' });
    } else if (msg.op === 'clear') {
      j.trazos = [];
      j.puntos = 0;
      this.pantalla({ type: 'draw', id, op: 'clear' });
    }
  }

  onInput(id, entrada) {
    const j = this.jugadores.get(id);
    if (entrada.type !== 'button' || !entrada.pressed || !j || this.fase !== 'votar') return;
    const votado = this.jugadores.get(entrada.button);
    if (!votado || entrada.button === id || !votado.trazos.length) return;
    j.voto = entrada.button; // se puede cambiar de voto hasta el final
    this.avisar(id, { type: 'hint', title: '¡Votado!', text: 'Puedes cambiar tu voto hasta que acabe el tiempo', mood: 'bien' });
    this.enviarAhora = true;
  }

  estado() {
    return {
      phase: this.fase ?? 'preparados',
      prompt: this.tema,
      players: [...this.jugadores].map(([id, j]) => ({
        id,
        strokes: j.trazos.length,
        voted: j.voto !== null,
        votes: this.fase === 'resultado' ? j.votos : null,
      })),
    };
  }

  // Los trazos completos, para la pantalla si se monta a mitad de ronda (al recargar o al empezar).
  escenario() {
    return { drawings: Object.fromEntries([...this.jugadores].map(([id, j]) => [id, j.trazos])) };
  }

  conectado(id) {
    if (this.fase === 'dibujar') this.avisar(id, { type: 'draw_start', prompt: this.tema, strokes: this.jugadores.get(id)?.trazos ?? [] });
    else if (this.fase === 'votar') this.avisar(id, { type: 'vote_start', candidates: this.candidatos(id) });
  }

  quitar(id) {
    this.jugadores.delete(id);
    for (const j of this.jugadores.values()) if (j.voto === id) j.voto = null;
  }

  getResults() {
    const orden = [...this.jugadores].map(([id, j]) => ({ id, votos: j.votos })).sort((a, b) => b.votos - a.votos);
    return conPuestos(orden, (a, b) => a.votos === b.votos).map(({ id, puesto }) => ({ id, puesto }));
  }
}
