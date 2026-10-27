// Pone puesto a una lista ya ordenada. Quien empata con el anterior comparte su puesto: 1, 2, 2, 4.
export function conPuestos(ordenados, empatan) {
  let puesto = 0;
  return ordenados.map((x, i) => {
    if (i === 0 || !empatan(ordenados[i - 1], x)) puesto = i + 1;
    return { ...x, puesto };
  });
}

// Base de los minijuegos. Cada uno hereda de Minijuego e implementa onInput, tick, estado y getResults
// (ver docs/02-arquitectura.md). La partida lo crea al empezar la ronda y le pasa el tiempo con avanzar().
export class Minijuego {
  static id = '';
  static nombre = '';
  static instrucciones = '';
  static control = ''; // qué muestra el mando: 'agitar', 'inclinar', 'tocar', 'opciones' o 'apuntar'
  static duracion = 30_000; // en ms; la ronda termina antes si terminado() lo dice
  static envio = 100; // ms entre state_update a la pantalla
  static reloj = true; // false para que la pantalla no enseñe el tiempo que queda (el Cronómetro)
  static opciones = null; // con control 'opciones': qué botones enseña el mando (ver shared/opciones.js)
  static multiples = false; // con control 'opciones': true si se puede pulsar varias veces por turno (Simón dice)

  // ids: jugadores de la ronda. vibrar(id, ms) y avisar(id, msg) llegan al mando de ese jugador; pantalla(msg),
  // a la pantalla al momento; perfil(id) da { id, name, avatar, color } de un jugador.
  constructor(ids, { vibrar, avisar, pantalla = () => {}, perfil = () => null }) {
    this.ids = ids;
    this.vibrar = vibrar;
    this.avisar = avisar;
    this.pantalla = pantalla;
    this.perfil = perfil;
    this.tiempo = 0; // segundos desde que empezó la ronda
    this.limite = this.constructor.duracion / 1000;
    this.enviarAhora = false; // true para que la partida mande el estado a la pantalla sin esperar
  }

  static info() {
    return { id: this.id, name: this.nombre, instructions: this.instrucciones, control: this.control, clock: this.reloj, options: this.opciones, multi: this.multiples };
  }

  get restante() {
    return Math.max(0, this.limite - this.tiempo);
  }

  avanzar(dt) {
    this.tiempo += dt;
    this.tick(dt);
  }

  terminado() {
    return this.tiempo >= this.limite;
  }

  // Un mensaje para el mando de cada jugador de la ronda.
  avisarTodos(msg) {
    for (const id of this.ids) this.avisar(id, msg);
  }

  // Entradas ya decodificadas de shared/protocol.js: { type: 'shake', intensity }, { type: 'tilt', x, y }…
  onInput(id, entrada) {}

  // Datos en JSON del mando que no caben en los mensajes binarios (los trazos de Dibuja).
  onDatos(id, msg) {}

  tick(dt) {}

  // Lo que no cambia en toda la ronda, como el mapa. Se envía a la pantalla al cambiar de fase.
  escenario() {
    return null;
  }

  // Lo que necesita la pantalla para dibujar la ronda. Se envía cada `envio` ms.
  estado() {
    return {};
  }

  // Puesto con el que ya ha terminado la ronda, o 0 si sigue jugando.
  puesto(id) {
    return 0;
  }

  conectado(id) {}
  desconectado(id) {}
  quitar(id) {}

  // [{ id, puesto }] de primero a último; los empatados comparten puesto.
  getResults() {
    return [];
  }
}
