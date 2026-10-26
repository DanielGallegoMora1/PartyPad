// Apunta y dispara: lógica del servidor. Cada jugador mueve una mirilla apuntando con el móvil y dispara con el
// botón; las dianas salen al azar y la primera que acierta se lleva los puntos (las doradas, más pequeñas, valen 3).
// Un pack exporta una función que recibe la base de los minijuegos, para no depender de rutas del servidor.
export default ({ Minijuego, conPuestos }) => {
  const DIANAS_MAX = 4; // a la vez en pantalla
  const CADA = 0.7; // s entre dianas nuevas
  const VIDA = 2.6; // s que dura una diana
  const RADIO = 0.06; // de la diana normal, en fracción del alto del campo
  const RADIO_ORO = 0.04;
  const PROB_ORO = 0.2;
  const RECARGA = 0.3; // s mínimos entre dos disparos del mismo jugador
  const RECIENTE = 0.6; // s que un disparo sigue en el estado, para que la pantalla lo vea aunque se pierda un envío

  return class Apunta extends Minijuego {
    static id = 'apunta';
    static nombre = 'Apunta y dispara';
    static instrucciones = 'Apunta con el móvil a la pantalla y dispara a las dianas. ¡Las doradas valen el triple!';
    static control = 'apuntar';
    static duracion = 40_000;
    static envio = 50;

    constructor(ids, opciones) {
      super(ids, opciones);
      // El campo mide ANCHO × 1: x de 0 a ANCHO e y de 0 a 1.
      this.ancho = 16 / 9;
      this.tiradores = new Map(ids.map((id) => [id, { x: this.ancho / 2, y: 0.5, puntos: 0, ultimoDisparo: -1, conectado: true }]));
      this.dianas = [];
      this.siguienteDiana = 0.4;
      this.numero = 0; // para dar un número único a cada diana y cada disparo
      this.disparos = [];
    }

    tick(dt) {
      this.dianas = this.dianas.filter((d) => d.muere > this.tiempo && !d.acertada);
      this.disparos = this.disparos.filter((d) => this.tiempo - d.t < RECIENTE);
      if (this.tiempo >= this.siguienteDiana && this.dianas.length < DIANAS_MAX) {
        this.siguienteDiana = this.tiempo + CADA * (0.6 + Math.random() * 0.8);
        const oro = Math.random() < PROB_ORO;
        const r = oro ? RADIO_ORO : RADIO;
        const vida = oro ? VIDA * 0.7 : VIDA;
        this.dianas.push({
          n: ++this.numero,
          x: r + 0.05 + Math.random() * (this.ancho - 2 * r - 0.1),
          y: r + 0.05 + Math.random() * (1 - 2 * r - 0.1),
          r,
          oro,
          nace: this.tiempo,
          muere: this.tiempo + vida,
        });
      }
    }

    onInput(id, entrada) {
      const t = this.tiradores.get(id);
      if (!t) return;
      // La inclinación del protocolo (TILT) hace aquí de puntero: de -1 a 1 en cada eje, 0 en el centro.
      if (entrada.type === 'tilt') {
        t.x = ((entrada.x + 1) / 2) * this.ancho;
        t.y = (entrada.y + 1) / 2;
      } else if (entrada.type === 'button' && entrada.pressed && this.tiempo - t.ultimoDisparo >= RECARGA) {
        t.ultimoDisparo = this.tiempo;
        this.disparar(id, t);
      }
    }

    disparar(id, t) {
      const diana = this.dianas
        .filter((d) => !d.acertada && Math.hypot(d.x - t.x, d.y - t.y) <= d.r * 1.15)
        .sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0];
      const puntos = diana ? (diana.oro ? 3 : 1) : 0;
      if (diana) {
        diana.acertada = true;
        t.puntos += puntos;
        this.vibrar(id, diana.oro ? 120 : 50);
      }
      this.disparos.push({ n: ++this.numero, t: this.tiempo, id, x: t.x, y: t.y, diana: diana?.n ?? null, puntos });
      this.enviarAhora = true;
    }

    escenario() {
      return { width: this.ancho };
    }

    estado() {
      const r = (v) => Math.round(v * 1000) / 1000;
      return {
        players: [...this.tiradores].map(([id, t]) => ({ id, x: r(t.x), y: r(t.y), score: t.puntos })),
        targets: this.dianas.map((d) => ({ n: d.n, x: r(d.x), y: r(d.y), r: d.r, gold: d.oro, life: r((d.muere - this.tiempo) / (d.muere - d.nace)) })),
        shots: this.disparos.map(({ t, ...d }) => ({ ...d, x: r(d.x), y: r(d.y) })),
      };
    }

    conectado(id) {
      const t = this.tiradores.get(id);
      if (t) t.conectado = true;
    }

    desconectado(id) {
      const t = this.tiradores.get(id);
      if (t) t.conectado = false;
    }

    quitar(id) {
      this.tiradores.delete(id);
    }

    getResults() {
      const orden = [...this.tiradores].map(([id, t]) => ({ id, puntos: t.puntos })).sort((a, b) => b.puntos - a.puntos);
      return conPuestos(orden, (a, b) => a.puntos === b.puntos).map(({ id, puesto }) => ({ id, puesto }));
    }
  };
};
