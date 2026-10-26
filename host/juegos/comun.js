// Piezas comunes de las escenas de los minijuegos: colores del texto, la ficha de cada jugador (círculo de su color
// con su avatar), confeti y el marcador lateral.
import * as Phaser from '/lib/phaser/phaser.esm.min.js';

export const TEXTO = '#f7f4ff';
export const TEXTO_SUAVE = '#b9b2d9';
export const TEXTO_OSCURO = '#1a0f2e';
export const PANEL = 0x1f1747;
export const MEDALLAS = [0xffd23f, 0xd9d9e8, 0xe0975a];

export const numero = (hex) => Phaser.Display.Color.HexStringToColor(hex).color;
export const estilo = (tamano, color = TEXTO, peso = '600') => ({ fontFamily: 'Fredoka', fontSize: `${Math.round(tamano)}px`, fontStyle: peso, color });
export const cara = (j) => j.emoji ?? [...j.name][0]?.toUpperCase() ?? '?';

// jugadores de juego.js ({ id, name, hex, emoji, connected }) → Map id → jugador con su color en número.
export const jugadoresDe = (jugadores, extra = () => ({})) =>
  new Map(jugadores.map((j) => [j.id, { ...j, color: numero(j.hex), conectado: j.connected, ...extra(j) }]));

export function texturas(escena) {
  if (escena.textures.exists('confeti')) return;
  const g = escena.make.graphics({ add: false });
  g.fillStyle(0xffffff).fillCircle(16, 16, 16).generateTexture('punto', 32, 32);
  g.clear().fillStyle(0xffffff).fillRect(0, 0, 10, 16).generateTexture('confeti', 10, 16);
  g.destroy();
}

// Ficha redonda del color del jugador con su avatar, centrada en (x, y). Devuelve un contenedor.
export function ficha(escena, x, y, r, j) {
  return escena.add.container(x, y, [
    escena.add.circle(r * 0.12, r * 0.25, r, 0x000000, 0.35),
    escena.add.circle(0, 0, r, j.color),
    escena.add.circle(-r * 0.35, -r * 0.38, r * 0.28, 0xffffff, 0.3),
    escena.add.text(0, r * 0.04, cara(j), estilo(r * 1.05, TEXTO_OSCURO, '700')).setOrigin(0.5),
  ]);
}

export function confeti(escena, x, y, color, cantidad = 30) {
  const p = escena.add.particles(x, y, 'confeti', {
    emitting: false,
    lifespan: 1300,
    speed: { min: 150, max: 400 },
    angle: { min: 0, max: 360 },
    gravityY: 500,
    rotate: { min: 0, max: 360 },
    scale: { min: 0.5, max: 1 },
    tint: [color, 0xffffff, 0xffd23f, 0xff4d8d],
  });
  p.explode(cantidad);
  escena.time.delayedCall(1500, () => p.destroy());
  return p;
}

// Marcador en columna: [{ j, valor }] ya ordenado. Devuelve los objetos creados, para destruirlos al repintar.
export function marcador(escena, filas, x, y, ancho, alto, titulo = 'Puntos') {
  const fila = Math.min(48, alto / (filas.length + 1.5));
  const objetos = [escena.add.text(x + ancho / 2, y, titulo, estilo(fila * 0.5, TEXTO_SUAVE)).setOrigin(0.5, 0)];
  filas.forEach(({ j, valor }, i) => {
    const fy = y + fila * (1.4 + i);
    objetos.push(
      escena.add.circle(x + fila * 0.4, fy, fila * 0.36, j.color).setAlpha(j.conectado ? 1 : 0.4),
      escena.add.text(x + fila * 0.4, fy, cara(j), estilo(fila * 0.38, TEXTO_OSCURO, '700')).setOrigin(0.5),
      escena.add.text(x + fila * 0.95, fy, j.name, estilo(fila * 0.36)).setOrigin(0, 0.5),
      escena.add.text(x + ancho, fy, String(valor), estilo(fila * 0.42, TEXTO, '700')).setOrigin(1, 0.5),
    );
  });
  return objetos;
}

// Reparte n elementos en filas que quepan en un ancho: devuelve [{ x, y }] centrados y el tamaño de cada hueco.
export function rejilla(n, x, y, ancho, alto, maxPorFila) {
  const filas = Math.max(1, Math.ceil(n / maxPorFila));
  const porFila = Math.ceil(n / filas);
  const lado = Math.min(ancho / porFila, alto / filas);
  const posiciones = [];
  for (let i = 0; i < n; i++) {
    const f = Math.floor(i / porFila);
    const enFila = Math.min(porFila, n - f * porFila);
    const x0 = x + (ancho - enFila * lado) / 2 + lado / 2;
    posiciones.push({ x: x0 + (i % porFila) * lado, y: y + (alto - filas * lado) / 2 + f * lado + lado / 2 });
  }
  return { posiciones, lado };
}
