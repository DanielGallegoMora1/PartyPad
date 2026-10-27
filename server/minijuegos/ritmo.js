// Ritmo: unas notas bajan por la pantalla al ritmo de una melodía y hay que pulsar justo cuando llegan a la línea.
// Cuanto más exacto, más puntos; encadenar aciertos suma más. La canción se genera en cada ronda.
import { Minijuego, conPuestos } from './minijuego.js';

const BPM = 112;
const CORCHEA = 60 / BPM / 2; // s
const INICIO = 2.4; // s antes de la primera nota, para que dé tiempo a verla bajar
const CAIDA = 1.8; // s que tarda una nota en bajar hasta la línea (lo usa la pantalla)
// La pantalla va un poco por detrás del servidor y la pulsación tarda en llegar: se compensa con este margen.
const RETRASO = 0.08;
const VENTANAS = [
  [0.07, 'perfecto', 100],
  [0.14, 'bien', 60],
  [0.22, 'vale', 30],
];
const FALLO = -10; // pulsar sin nota cerca

// Compases de 8 corcheas (1 = nota), de más fáciles a más difíciles.
const COMPASES = [
  [1, 0, 1, 0, 1, 0, 1, 0],
  [1, 0, 0, 0, 1, 0, 1, 0],
  [1, 0, 1, 0, 1, 0, 0, 0],
  [1, 0, 1, 1, 1, 0, 1, 0],
  [1, 1, 1, 0, 1, 0, 1, 0],
  [1, 0, 0, 1, 1, 0, 1, 0],
  [1, 0, 1, 1, 0, 1, 1, 0],
  [1, 1, 0, 1, 1, 0, 1, 1],
  [1, 0, 1, 0, 1, 1, 1, 1],
];
const MELODIA = [0, 2, 4, 5, 4, 2, 4, 7, 5, 4, 2, 0, 1, 2, 4, 2]; // grados de la escala, en bucle

function cancion() {
  const notas = [];
  const compases = 12;
  for (let c = 0; c < compases; c++) {
    // Los primeros compases, de la parte fácil de la lista; los últimos, de la difícil.
    const dificultad = c / (compases - 1);
    const desde = Math.floor(dificultad * (COMPASES.length - 3));
    const patron = COMPASES[desde + Math.floor(Math.random() * 3)];
    patron.forEach((hay, i) => {
      if (hay) notas.push({ n: notas.length, t: Math.round((INICIO + (c * 8 + i) * CORCHEA) * 1000) / 1000, p: MELODIA[notas.length % MELODIA.length] });
    });
  }
  return notas;
}

export class Ritmo extends Minijuego {
  static id = 'ritmo';
  static nombre = 'Ritmo';
  static instrucciones = 'Pulsa el botón justo cuando cada nota llegue a la línea. ¡Encadena aciertos para sumar más!';
  static control = 'tocar';
  static envio = 150;

  constructor(ids, opciones) {
    super(ids, opciones);
    this.notas = cancion();
    this.limite = this.notas.at(-1).t + 2;
    this.inicio = null;
    // juzgadas: notas ya puntuadas (acertadas o pasadas); racha: aciertos seguidos
    this.jugadores = new Map(ids.map((id) => [id, { puntos: 0, racha: 0, mejor: 0, juzgadas: new Set(), ultimo: null, n: 0, aciertos: 0 }]));
  }

  ahora() {
    return (performance.now() - this.inicio) / 1000;
  }

  tick() {
    if (this.inicio === null) this.inicio = performance.now() - this.tiempo * 1000;
    // Las notas que ya han pasado de largo sin pulsar rompen la racha.
    const t = this.ahora() - RETRASO;
    for (const j of this.jugadores.values()) {
      for (const nota of this.notas) {
        if (nota.t > t - VENTANAS.at(-1)[0]) break;
        if (j.juzgadas.has(nota.n)) continue;
        j.juzgadas.add(nota.n);
        j.racha = 0;
      }
    }
  }

  onInput(id, entrada) {
    const j = this.jugadores.get(id);
    if (entrada.type !== 'button' || !entrada.pressed || !j || this.inicio === null) return;
    const t = this.ahora() - RETRASO;
    // La nota sin puntuar más cercana a la pulsación.
    let cerca = null;
    for (const nota of this.notas) {
      if (j.juzgadas.has(nota.n)) continue;
      if (!cerca || Math.abs(nota.t - t) < Math.abs(cerca.t - t)) cerca = nota;
      if (nota.t > t + 1) break;
    }
    const ventana = cerca && VENTANAS.find(([margen]) => Math.abs(cerca.t - t) <= margen);
    if (ventana) {
      const [, nombre, puntos] = ventana;
      j.juzgadas.add(cerca.n);
      j.racha++;
      j.mejor = Math.max(j.mejor, j.racha);
      j.aciertos++;
      j.puntos += puntos + Math.min(50, j.racha * 2);
      j.ultimo = nombre;
      this.avisar(id, { type: 'hint', title: { perfecto: '¡Perfecto!', bien: '¡Bien!', vale: 'Vale' }[nombre], text: `Racha: ${j.racha}`, mood: 'bien' });
    } else {
      j.racha = 0;
      j.puntos = Math.max(0, j.puntos + FALLO);
      j.ultimo = 'fallo';
      this.avisar(id, { type: 'hint', title: 'Fuera de ritmo', text: 'Racha: 0', mood: 'mal' });
    }
    j.n++;
  }

  escenario() {
    return { notes: this.notas, fall: CAIDA, delay: RETRASO };
  }

  estado() {
    return {
      time: this.inicio === null ? this.tiempo : Math.round(this.ahora() * 1000) / 1000,
      running: this.inicio !== null, // en las instrucciones y la cuenta atrás, la canción aún no ha empezado
      total: this.notas.length,
      players: [...this.jugadores].map(([id, j]) => ({ id, score: j.puntos, combo: j.racha, hits: j.aciertos, last: j.ultimo, n: j.n })),
    };
  }

  quitar(id) {
    this.jugadores.delete(id);
  }

  getResults() {
    const orden = [...this.jugadores].map(([id, j]) => ({ id, puntos: j.puntos })).sort((a, b) => b.puntos - a.puntos);
    return conPuestos(orden, (a, b) => a.puntos === b.puntos).map(({ id, puesto }) => ({ id, puesto }));
  }
}
