// ¿Cuántos hay?: la pantalla enseña un montón de animales durante unos segundos y luego pregunta cuántos había de
// uno. Cada turno hay más animales y más especies, y se ven menos tiempo. Las respuestas falsas están muy cerca de
// la buena, para que no baste con calcular a ojo.
import { PorTurnos } from './turnos.js';

// Animales que se parecen entre sí, para que cueste distinguirlos de un vistazo.
const ANIMALES = ['🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐤', '🦉', '🐰', '🐹', '🐭'];
const PUNTOS = 500;
const PUNTOS_RAPIDEZ = 500;

const barajar = (lista) => {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const k = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[k]] = [copia[k], copia[i]];
  }
  return copia;
};

export class Cuantos extends PorTurnos {
  static id = 'cuantos';
  static nombre = '¿Cuántos hay?';
  static instrucciones = 'Fíjate bien en los animales: luego te preguntarán cuántos había de uno. ¡Desaparecen enseguida!';
  static turnos = 6;
  static tPregunta = 8; // para responder, después de mirar
  static tRespuesta = 4;

  tiempoVer(turno) {
    return 3.5 - turno * 0.2;
  }

  preparar(turno) {
    const total = 12 + turno * 8; // 12, 20, 28… 52
    const especies = barajar(ANIMALES).slice(0, 4 + Math.min(3, Math.floor(turno / 2) + 1)); // de 5 a 7 especies
    const objetivo = especies[0];
    // Del animal que se pregunta hay una parte parecida a los demás, para que no destaque por ser muchos o pocos.
    const media = total / especies.length;
    const cuantos = Math.max(2, Math.round(media * (0.6 + Math.random() * 0.8)));
    const lista = Array(cuantos).fill(objetivo);
    while (lista.length < total) lista.push(especies[1 + Math.floor(Math.random() * (especies.length - 1))]);

    // Repartidos por una rejilla con algo de desorden, para que no se tapen unos a otros.
    const columnas = Math.ceil(Math.sqrt(total * 1.8));
    const filas = Math.ceil(total / columnas);
    const huecos = barajar(Array.from({ length: columnas * filas }, (_, i) => i)).slice(0, total);
    const animales = barajar(lista).map((emoji, i) => ({
      emoji,
      x: Math.round((((huecos[i] % columnas) + 0.2 + Math.random() * 0.6) / columnas) * 1000) / 1000,
      y: Math.round(((Math.floor(huecos[i] / columnas) + 0.2 + Math.random() * 0.6) / filas) * 1000) / 1000,
      r: Math.round((Math.random() - 0.5) * 40), // un poco girados
    }));

    // Respuestas: la buena y tres falsas muy cerca (±1, ±2, ±3), todas positivas y distintas.
    const falsas = barajar([-3, -2, -1, 1, 2, 3].map((d) => cuantos + d).filter((n) => n > 0)).slice(0, 3);
    const opciones = barajar([cuantos, ...falsas]);
    this.actual = { animales, objetivo, cuantos, opciones, correcta: opciones.indexOf(cuantos) };
  }

  tituloTurno() {
    return `${this.turno + 1} de ${Cuantos.turnos}`;
  }

  textoTurno() {
    return `¿Cuántos ${this.actual.objetivo} había?`;
  }

  puntuar(j) {
    if (j.eleccion !== this.actual.correcta) return 0;
    return Math.round(PUNTOS + PUNTOS_RAPIDEZ * Math.max(0, 1 - j.segundos / Cuantos.tPregunta));
  }

  alCerrar(id, j) {
    const bien = j.ganados > 0;
    const texto = `Había ${this.actual.cuantos}${bien ? ` · +${j.ganados}` : ''}`;
    this.avisar(id, { type: 'hint', title: bien ? '¡Correcto!' : j.eleccion === null ? 'Sin respuesta' : 'Fallo', text: texto, mood: bien ? 'bien' : 'mal', lock: true });
  }

  estado() {
    const mirando = this.fase === 'pregunta' && !this.abierta;
    const resuelto = this.fase === 'respuesta';
    return {
      ...this.estadoTurno(),
      looking: mirando,
      // Los animales solo se mandan mientras se miran y al resolver: con la pregunta abierta, ni la pantalla los tiene.
      animals: mirando || resuelto ? this.actual?.animales : null,
      target: this.abierta || resuelto ? this.actual?.objetivo : null,
      options: this.abierta || resuelto ? this.actual?.opciones : [],
      correct: resuelto ? this.actual.correcta : null,
      count: resuelto ? this.actual.cuantos : null,
    };
  }
}
