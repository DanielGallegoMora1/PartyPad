// Carrera de agitar: cada jugador avanza por su carril según lo fuerte que agite el móvil.
import { Minijuego, conPuestos } from './minijuego.js';

const VELOCIDAD = 0.1; // fracción de la pista por segundo agitando al máximo: 10 s como mínimo
const PRORROGA = 10; // segundos que tienen los demás cuando llega el primero

export class Carrera extends Minijuego {
  static id = 'carrera';
  static nombre = 'Carrera de agitar';
  static instrucciones = 'Agita el móvil todo lo que puedas para llegar el primero a la meta';
  static control = 'agitar';
  static duracion = 45_000;

  constructor(ids, opciones) {
    super(ids, opciones);
    // progreso de 0 a 1; llegada en segundos de ronda, o null si aún no ha llegado
    this.corredores = new Map(ids.map((id) => [id, { progreso: 0, intensidad: 0, llegada: null, puesto: 0, conectado: true }]));
  }

  onInput(id, entrada) {
    const c = this.corredores.get(id);
    if (entrada.type !== 'shake' || !c || c.llegada !== null) return;
    // El mando solo envía cuando la intensidad cambia, así que se guarda la última hasta la siguiente.
    c.intensidad = entrada.intensity;
  }

  tick(dt) {
    for (const [id, c] of this.corredores) {
      if (c.llegada !== null) continue;
      c.progreso = Math.min(1, c.progreso + c.intensidad * VELOCIDAD * dt);
      if (c.progreso < 1) continue;
      c.llegada = this.tiempo;
      c.intensidad = 0;
      c.puesto = [...this.corredores.values()].filter((o) => o.llegada !== null).length;
      if (c.puesto === 1) this.limite = Math.min(this.limite, this.tiempo + PRORROGA);
      this.vibrar(id, 300);
      this.avisar(id, { type: 'finished', place: c.puesto });
    }
  }

  // Termina cuando han llegado todos los que siguen conectados.
  terminado() {
    const enCarrera = [...this.corredores.values()].filter((c) => c.conectado);
    return super.terminado() || (enCarrera.length > 0 && enCarrera.every((c) => c.llegada !== null));
  }

  estado() {
    return {
      players: [...this.corredores].map(([id, c]) => ({
        id,
        progress: Math.round(c.progreso * 1000) / 1000,
        intensity: Math.round(c.intensidad * 100) / 100,
        place: c.puesto, // 0 mientras no llega
      })),
    };
  }

  conectado(id) {
    const c = this.corredores.get(id);
    if (c) c.conectado = true;
  }

  desconectado(id) {
    const c = this.corredores.get(id);
    if (!c) return;
    c.conectado = false;
    c.intensidad = 0;
  }

  quitar(id) {
    this.corredores.delete(id);
  }

  // Primero los que han llegado, por orden de llegada; después el resto, por lo lejos que han llegado.
  getResults() {
    const orden = [...this.corredores]
      .map(([id, c]) => ({ id, llegada: c.llegada ?? Infinity, progreso: c.progreso }))
      .sort((a, b) => a.llegada - b.llegada || b.progreso - a.progreso);
    return conPuestos(orden, (a, b) => a.llegada === b.llegada && a.progreso === b.progreso).map(({ id, puesto }) => ({
      id,
      puesto,
    }));
  }
}
