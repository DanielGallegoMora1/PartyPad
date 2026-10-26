// Laberinto inclinable: todos los jugadores guían su bola por el mismo laberinto inclinando el móvil.
// La física va aquí, en el servidor, para que nadie pueda hacer trampas. Las medidas van en celdas.
import { Minijuego, conPuestos } from './minijuego.js';

const COLUMNAS = 17;
const FILAS = 9;
const ATAJOS = 0.12; // fracción de paredes interiores que se quitan para que haya varios caminos
const RADIO = 0.3;
const GROSOR = 0.12; // de las paredes
const ACELERACION = 14; // celdas/s² con el móvil inclinado al máximo
const ROCE = 1.6; // cuánta velocidad se pierde por segundo
const VELOCIDAD_MAX = 7;
const REBOTE = 0.45; // velocidad que conserva al chocar contra una pared
const PASO = 0.01; // s por paso de simulación: pasos cortos para no atravesar paredes
const ALCANCE_META = 0.4; // distancia al centro de la meta para llegar
const GOLPE_FUERTE = 2.5; // a partir de esta velocidad contra una pared, el mando vibra
const PRORROGA = 15;

const limitar = (v, max) => Math.max(-max, Math.min(max, v));

// Laberinto perfecto con backtracking y luego algunos atajos. Devuelve las paredes de cada línea de la rejilla:
// verticales[x][y] separa las celdas (x-1, y) y (x, y); horizontales[x][y], las celdas (x, y-1) y (x, y).
function generar(salida, plaza) {
  const verticales = Array.from({ length: COLUMNAS + 1 }, () => Array(FILAS).fill(true));
  const horizontales = Array.from({ length: COLUMNAS }, () => Array(FILAS + 1).fill(true));
  const abrir = (x, y, nx, ny) => {
    if (nx !== x) verticales[Math.max(x, nx)][y] = false;
    else horizontales[x][Math.max(y, ny)] = false;
  };

  const visitada = Array.from({ length: COLUMNAS }, () => Array(FILAS).fill(false));
  const pila = [salida];
  visitada[salida.x][salida.y] = true;
  while (pila.length) {
    const { x, y } = pila.at(-1);
    const vecinas = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
      .filter((v) => v.x >= 0 && v.x < COLUMNAS && v.y >= 0 && v.y < FILAS && !visitada[v.x][v.y]);
    if (!vecinas.length) {
      pila.pop();
      continue;
    }
    const v = vecinas[Math.floor(Math.random() * vecinas.length)];
    visitada[v.x][v.y] = true;
    abrir(x, y, v.x, v.y);
    pila.push(v);
  }

  for (let x = 1; x < COLUMNAS; x++) for (let y = 0; y < FILAS; y++) if (Math.random() < ATAJOS) verticales[x][y] = false;
  for (let x = 0; x < COLUMNAS; x++) for (let y = 1; y < FILAS; y++) if (Math.random() < ATAJOS) horizontales[x][y] = false;

  // La plaza de salida, sin paredes dentro, para que quepan todas las bolas.
  for (let x = plaza.x; x < plaza.x + plaza.w; x++) {
    for (let y = plaza.y; y < plaza.y + plaza.h; y++) {
      if (x > plaza.x) verticales[x][y] = false;
      if (y > plaza.y) horizontales[x][y] = false;
    }
  }
  return { verticales, horizontales };
}

// Une las paredes seguidas de una misma línea en un solo tramo: [x1, y1, x2, y2].
function tramos({ verticales, horizontales }) {
  const lista = [];
  verticales.forEach((linea, x) => {
    let inicio = null;
    for (let y = 0; y <= FILAS; y++) {
      if (linea[y] && inicio === null) inicio = y;
      if (!linea[y] && inicio !== null) {
        lista.push([x, inicio, x, y]);
        inicio = null;
      }
    }
  });
  for (let y = 0; y <= FILAS; y++) {
    let inicio = null;
    for (let x = 0; x <= COLUMNAS; x++) {
      const hay = x < COLUMNAS && horizontales[x][y];
      if (hay && inicio === null) inicio = x;
      if (!hay && inicio !== null) {
        lista.push([inicio, y, x, y]);
        inicio = null;
      }
    }
  }
  return lista;
}

// Distancia en celdas desde cada celda hasta la meta, siguiendo los pasillos.
function distancias({ verticales, horizontales }, meta) {
  const d = Array.from({ length: COLUMNAS }, () => Array(FILAS).fill(Infinity));
  d[meta.x][meta.y] = 0;
  const cola = [meta];
  while (cola.length) {
    const { x, y } = cola.shift();
    const pasos = [
      [x + 1, y, !verticales[x + 1][y]],
      [x - 1, y, !verticales[x][y]],
      [x, y + 1, !horizontales[x][y + 1]],
      [x, y - 1, !horizontales[x][y]],
    ];
    for (const [nx, ny, abierto] of pasos) {
      if (abierto && d[nx]?.[ny] === Infinity) {
        d[nx][ny] = d[x][y] + 1;
        cola.push({ x: nx, y: ny });
      }
    }
  }
  return d;
}

export class Laberinto extends Minijuego {
  static id = 'laberinto';
  static nombre = 'Laberinto inclinable';
  static instrucciones = 'Inclina el móvil para guiar tu bola hasta la meta. ¡Cuidado con los empujones!';
  static control = 'inclinar';
  static duracion = 75_000;
  static envio = 50; // las bolas se mueven rápido: la pantalla recibe el estado 20 veces por segundo

  constructor(ids, opciones) {
    super(ids, opciones);
    const centro = Math.floor(FILAS / 2);
    this.plaza = { x: 0, y: centro - 1, w: 2, h: 3 };
    this.meta = { x: COLUMNAS - 1, y: centro };
    this.mapa = generar({ x: 0, y: centro }, this.plaza);
    this.paredes = tramos(this.mapa).map(([x1, y1, x2, y2]) => ({
      x1: x1 - GROSOR / 2,
      y1: y1 - GROSOR / 2,
      x2: x2 + GROSOR / 2,
      y2: y2 + GROSOR / 2,
      linea: [x1, y1, x2, y2],
    }));
    this.distancia = distancias(this.mapa, this.meta);

    // Las bolas empiezan repartidas por la plaza, en dos columnas.
    this.bolas = new Map(
      ids.map((id, i) => {
        const fila = Math.floor(i / 2);
        const filas = Math.ceil(ids.length / 2);
        return [
          id,
          {
            x: this.plaza.x + (i % 2 ? 1.5 : 0.5),
            y: this.plaza.y + ((fila + 0.5) * this.plaza.h) / filas,
            vx: 0,
            vy: 0,
            inclinacion: { x: 0, y: 0 },
            llegada: null,
            puesto: 0,
            conectado: true,
            ultimoGolpe: -1,
          },
        ];
      }),
    );
  }

  // Lo que no cambia en toda la ronda: se manda a la pantalla una vez por fase, no en cada state_update.
  escenario() {
    return {
      cols: COLUMNAS,
      rows: FILAS,
      radius: RADIO,
      wall: GROSOR,
      walls: this.paredes.map((p) => p.linea),
      start: this.plaza,
      goal: { x: this.meta.x + 0.5, y: this.meta.y + 0.5 },
    };
  }

  onInput(id, entrada) {
    const b = this.bolas.get(id);
    if (entrada.type !== 'tilt' || !b || b.llegada !== null) return;
    b.inclinacion = { x: entrada.x, y: entrada.y };
  }

  tick(dt) {
    const pasos = Math.max(1, Math.ceil(dt / PASO));
    for (let i = 0; i < pasos; i++) this.paso(dt / pasos);
  }

  paso(dt) {
    const enJuego = [...this.bolas].filter(([, b]) => b.llegada === null);
    for (const [id, b] of enJuego) {
      b.vx += b.inclinacion.x * ACELERACION * dt;
      b.vy += b.inclinacion.y * ACELERACION * dt;
      const freno = Math.max(0, 1 - ROCE * dt);
      b.vx = limitar(b.vx * freno, VELOCIDAD_MAX);
      b.vy = limitar(b.vy * freno, VELOCIDAD_MAX);
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      let golpe = 0;
      for (const p of this.paredes) golpe = Math.max(golpe, this.chocarPared(b, p));
      if (golpe > GOLPE_FUERTE && this.tiempo - b.ultimoGolpe > 0.25) {
        b.ultimoGolpe = this.tiempo;
        this.vibrar(id, 30);
      }
    }

    // Choques entre bolas: se separan y se intercambian la velocidad en la dirección del choque.
    for (let i = 0; i < enJuego.length; i++) {
      for (let k = i + 1; k < enJuego.length; k++) this.chocarBolas(enJuego[i][1], enJuego[k][1]);
    }

    for (const [id, b] of enJuego) {
      if (Math.hypot(b.x - this.meta.x - 0.5, b.y - this.meta.y - 0.5) > ALCANCE_META) continue;
      b.llegada = this.tiempo;
      b.vx = b.vy = 0;
      b.puesto = [...this.bolas.values()].filter((o) => o.llegada !== null).length;
      if (b.puesto === 1) this.limite = Math.min(this.limite, this.tiempo + PRORROGA);
      this.vibrar(id, 300);
      this.avisar(id, { type: 'finished', place: b.puesto });
    }
  }

  // Devuelve la velocidad con la que ha chocado, o 0 si no ha tocado la pared.
  chocarPared(b, p) {
    const cx = Math.max(p.x1, Math.min(b.x, p.x2));
    const cy = Math.max(p.y1, Math.min(b.y, p.y2));
    const dx = b.x - cx;
    const dy = b.y - cy;
    const d = Math.hypot(dx, dy);
    if (d >= RADIO || d === 0) return 0;
    const nx = dx / d;
    const ny = dy / d;
    b.x += nx * (RADIO - d);
    b.y += ny * (RADIO - d);
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return 0;
    b.vx -= (1 + REBOTE) * vn * nx;
    b.vy -= (1 + REBOTE) * vn * ny;
    return -vn;
  }

  chocarBolas(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d >= 2 * RADIO || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const solape = (2 * RADIO - d) / 2;
    a.x -= nx * solape;
    a.y -= ny * solape;
    b.x += nx * solape;
    b.y += ny * solape;
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn >= 0) return;
    const impulso = ((1 + REBOTE) * vn) / 2;
    a.vx += impulso * nx;
    a.vy += impulso * ny;
    b.vx -= impulso * nx;
    b.vy -= impulso * ny;
  }

  // Termina cuando han llegado todos los que siguen conectados.
  terminado() {
    const enJuego = [...this.bolas.values()].filter((b) => b.conectado);
    return super.terminado() || (enJuego.length > 0 && enJuego.every((b) => b.llegada !== null));
  }

  estado() {
    const r = (v) => Math.round(v * 100) / 100;
    return { players: [...this.bolas].map(([id, b]) => ({ id, x: r(b.x), y: r(b.y), place: b.puesto })) };
  }

  puesto(id) {
    return this.bolas.get(id)?.puesto ?? 0;
  }

  conectado(id) {
    const b = this.bolas.get(id);
    if (b) b.conectado = true;
  }

  desconectado(id) {
    const b = this.bolas.get(id);
    if (!b) return;
    b.conectado = false;
    b.inclinacion = { x: 0, y: 0 };
  }

  quitar(id) {
    this.bolas.delete(id);
  }

  // Primero los que han llegado, por orden; después el resto, por lo cerca que se han quedado de la meta.
  getResults() {
    const meta = { x: this.meta.x + 0.5, y: this.meta.y + 0.5 };
    const orden = [...this.bolas]
      .map(([id, b]) => {
        const cx = Math.min(COLUMNAS - 1, Math.max(0, Math.floor(b.x)));
        const cy = Math.min(FILAS - 1, Math.max(0, Math.floor(b.y)));
        const falta = b.llegada !== null ? 0 : this.distancia[cx][cy] + Math.hypot(b.x - meta.x, b.y - meta.y) / 100;
        return { id, llegada: b.llegada ?? Infinity, falta };
      })
      .sort((a, b) => a.llegada - b.llegada || a.falta - b.falta);
    return conPuestos(orden, (a, b) => a.llegada === b.llegada && a.falta === b.falta).map(({ id, puesto }) => ({
      id,
      puesto,
    }));
  }
}
