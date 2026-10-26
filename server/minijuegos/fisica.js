// Física sencilla de bolas para los minijuegos de inclinar (Sumo y Esquiva): la inclinación del móvil acelera la
// bola, el roce la frena y las bolas chocan entre sí. Las medidas van en las unidades de cada minijuego.

const limitar = (v, max) => Math.max(-max, Math.min(max, v));

// b: { x, y, vx, vy, inclinacion: { x, y } }
export function mover(b, dt, { aceleracion, roce, velocidadMax }) {
  b.vx += b.inclinacion.x * aceleracion * dt;
  b.vy += b.inclinacion.y * aceleracion * dt;
  const freno = Math.max(0, 1 - roce * dt);
  b.vx = limitar(b.vx * freno, velocidadMax);
  b.vy = limitar(b.vy * freno, velocidadMax);
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

// Separa dos bolas que se tocan y les cambia la velocidad en la dirección del choque. Devuelve la fuerza del choque.
export function chocar(a, b, radio, rebote) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= 2 * radio || d === 0) return 0;
  const nx = dx / d;
  const ny = dy / d;
  const solape = (2 * radio - d) / 2;
  a.x -= nx * solape;
  a.y -= ny * solape;
  b.x += nx * solape;
  b.y += ny * solape;
  const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (vn >= 0) return 0;
  const impulso = ((1 + rebote) * vn) / 2;
  a.vx += impulso * nx;
  a.vy += impulso * ny;
  b.vx -= impulso * nx;
  b.vy -= impulso * ny;
  return -vn;
}

// Choques de todas con todas.
export function chocarTodas(bolas, radio, rebote, alChocar) {
  for (let i = 0; i < bolas.length; i++) {
    for (let k = i + 1; k < bolas.length; k++) {
      const fuerza = chocar(bolas[i], bolas[k], radio, rebote);
      if (fuerza) alChocar?.(bolas[i], bolas[k], fuerza);
    }
  }
}

// Supervivencia (Sumo y Esquiva): primero los que siguen en pie, empatados; después los eliminados, de último a primero.
export function puestosSupervivencia(jugadores, conPuestos) {
  const orden = [...jugadores]
    .map(([id, j]) => ({ id, fuera: j.fuera ?? Infinity }))
    .sort((a, b) => b.fuera - a.fuera);
  return conPuestos(orden, (a, b) => a.fuera === b.fuera).map(({ id, puesto }) => ({ id, puesto }));
}
