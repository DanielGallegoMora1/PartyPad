// Salas de PartyPad: cada pantalla crea una sala con un código de 4 letras y hasta 16 jugadores.
// Los eventos de sala van en JSON (ver docs/03-protocolo.md).
import { randomUUID } from 'node:crypto';
import { COLORES } from '../shared/colores.js';
import { AVATARES } from '../shared/avatares.js';
import { decode, encodeVibrate } from '../shared/protocol.js';
import { Partida } from './partida.js';
import { minijuegosPartida } from './minijuegos/index.js';

export const MAX_JUGADORES = COLORES.length; // 16: cada jugador tiene un color distinto
const MAX_NOMBRE = 16; // en caracteres
const ESPERA_JUGADOR = 30_000; // para reconectarse antes de perder el sitio en el lobby
const ESPERA_PANTALLA = 10 * 60_000; // sin pantalla, la sala se cierra
const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // sin I ni O, que se confunden con 1 y 0

const salas = new Map(); // código → Sala

export const enviar = (socket, msg) => {
  if (socket?.readyState === 1) socket.send(JSON.stringify(msg));
};

function nuevoCodigo() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => LETRAS[Math.floor(Math.random() * LETRAS.length)]).join('');
  } while (salas.has(code));
  return code;
}

export function crearSala() {
  const sala = new Sala(nuevoCodigo());
  salas.set(sala.code, sala);
  return sala;
}

export const buscarSala = (code) => salas.get(String(code ?? '').toUpperCase());

// Lo que pueden ver la pantalla y los mandos de un jugador: sin token ni socket.
const publico = (j) => ({ id: j.id, name: j.name, color: j.color, avatar: j.avatar, connected: j.socket !== null });

function limpiarNombre(name) {
  return typeof name === 'string' ? [...name.trim()].slice(0, MAX_NOMBRE).join('') : '';
}

export class Sala {
  constructor(code) {
    this.code = code;
    this.hostToken = randomUUID();
    this.host = null;
    this.state = 'lobby'; // lobby | jugando
    this.partida = null;
    this.jugadores = new Map(); // id → { id, name, color, avatar, token, socket, timer }
    this.observadores = new Set(); // mandos que eligen nombre y avatar, para avisarles de los avatares libres
    this.packs = new Set(); // ids de los packs que la pantalla tiene descargados
    this.timerCierre = null;
  }

  get lista() {
    return [...this.jugadores.values()].map(publico);
  }

  info() {
    return {
      type: 'room_info',
      code: this.code,
      exists: true,
      state: this.state,
      full: this.jugadores.size >= MAX_JUGADORES,
      takenAvatars: [...this.jugadores.values()].map((j) => j.avatar),
    };
  }

  aPantalla(msg) {
    enviar(this.host, msg);
  }

  aMandos(msg) {
    for (const j of this.jugadores.values()) enviar(j.socket, msg);
  }

  aJugador(id, msg) {
    enviar(this.jugadores.get(id)?.socket, msg);
  }

  avisarObservadores() {
    const info = this.info();
    for (const s of this.observadores) enviar(s, info);
  }

  // Pantalla

  conectarPantalla(socket) {
    if (this.host && this.host !== socket) {
      this.host.sala = null;
      this.host.close(4003, 'La sala se ha abierto en otra pantalla');
    }
    this.host = socket;
    socket.sala = this;
    clearTimeout(this.timerCierre);
    this.aMandos({ type: 'host_status', connected: true });
  }

  desconectarPantalla(socket) {
    if (this.host !== socket) return;
    this.host = null;
    this.aMandos({ type: 'host_status', connected: false });
    this.timerCierre = setTimeout(() => this.cerrar(), ESPERA_PANTALLA);
  }

  // La pantalla dice qué packs tiene descargados; se le responde con los minijuegos que tendrá la partida.
  ponerPacks(ids) {
    this.packs = new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []);
    this.avisarMinijuegos();
  }

  avisarMinijuegos() {
    this.aPantalla({ type: 'minigames', list: minijuegosPartida(this.packs).map((M) => M.info()) });
  }

  // Desde el lobby o, para jugar otra vez, desde el podio.
  empezar() {
    const enPodio = this.partida?.fase === 'podio';
    if ((this.state !== 'lobby' && !enPodio) || this.jugadores.size < 2) return;
    if (minijuegosPartida(this.packs).length === 0) return;
    this.partida?.parar();
    this.state = 'jugando';
    this.partida = new Partida(this);
    this.partida.empezar();
    this.avisarObservadores();
  }

  volverAlLobby() {
    if (this.state === 'lobby') return;
    this.partida.parar();
    this.partida = null;
    this.state = 'lobby';
    const msg = { type: 'back_to_lobby' };
    this.aPantalla(msg);
    this.aMandos(msg);
    // Los que se desconectaron durante la partida ya no tienen sitio guardado.
    for (const j of this.jugadores.values()) if (!j.socket) this.esperarReconexion(j);
    this.avisarObservadores();
  }

  cerrar() {
    clearTimeout(this.timerCierre);
    this.partida?.parar();
    const msg = { type: 'room_closed' };
    for (const j of this.jugadores.values()) {
      clearTimeout(j.timer);
      enviar(j.socket, msg);
      if (j.socket) j.socket.jugador = j.socket.sala = null;
    }
    for (const s of this.observadores) {
      enviar(s, msg);
      s.observando = null;
    }
    enviar(this.host, msg);
    if (this.host) this.host.sala = null;
    salas.delete(this.code);
  }

  // Mandos

  observar(socket) {
    socket.observando?.observadores.delete(socket);
    this.observadores.add(socket);
    socket.observando = this;
    enviar(socket, this.info());
  }

  dejarDeObservar(socket) {
    this.observadores.delete(socket);
    socket.observando = null;
  }

  // El jugador elige nombre y avatar; el color se lo da el servidor (el primero libre).
  unir(socket, name, avatar) {
    if (this.state !== 'lobby') return { error: 'started' };
    if (this.jugadores.size >= MAX_JUGADORES) return { error: 'full' };
    name = limpiarNombre(name);
    if (!name) return { error: 'invalid_name' };
    if (!Number.isInteger(avatar) || avatar < 0 || avatar >= AVATARES.length) return { error: 'invalid_avatar' };
    const otros = [...this.jugadores.values()];
    if (otros.some((j) => j.avatar === avatar)) return { error: 'avatar_taken' };
    const color = COLORES.findIndex((_, i) => !otros.some((j) => j.color === i));

    let id = 1;
    while (this.jugadores.has(id)) id++;
    const j = { id, name, color, avatar, token: randomUUID(), socket, timer: null };
    this.jugadores.set(id, j);
    this.dejarDeObservar(socket);
    socket.sala = this;
    socket.jugador = j;

    this.aPantalla({ type: 'player_joined', player: publico(j) });
    this.avisarObservadores();
    return { jugador: j };
  }

  reconectar(socket, token) {
    const j = [...this.jugadores.values()].find((j) => j.token === token);
    if (!j) return null;
    clearTimeout(j.timer);
    const anterior = j.socket;
    j.socket = socket;
    socket.sala = this;
    socket.jugador = j;
    if (anterior) {
      anterior.jugador = anterior.sala = null;
      anterior.close(4004, 'Has entrado desde otra pestaña o dispositivo');
    }
    this.dejarDeObservar(socket);
    this.aPantalla({ type: 'player_status', id: j.id, connected: true });
    return j;
  }

  desconectarJugador(socket) {
    const j = socket.jugador;
    if (!j || j.socket !== socket) return;
    j.socket = null;
    this.aPantalla({ type: 'player_status', id: j.id, connected: false });
    // En partida se le guarda el sitio y el minijuego decide qué hacer mientras tanto.
    if (this.state === 'lobby') this.esperarReconexion(j);
    else this.partida.desconectado(j.id);
  }

  esperarReconexion(j) {
    clearTimeout(j.timer);
    j.timer = setTimeout(() => this.quitar(j.id), ESPERA_JUGADOR);
  }

  // motivo: 'kicked' si lo expulsa el anfitrión; sin motivo si se va él o no vuelve a tiempo.
  quitar(id, motivo) {
    const j = this.jugadores.get(id);
    if (!j) return;
    clearTimeout(j.timer);
    this.jugadores.delete(id);
    if (motivo) enviar(j.socket, { type: motivo });
    if (j.socket) j.socket.jugador = j.socket.sala = null;
    this.aPantalla({ type: 'player_left', id });
    this.partida?.quitar(id);
    // Sin jugadores no hay partida que seguir.
    if (this.state === 'jugando' && this.jugadores.size === 0) this.volverAlLobby();
    this.avisarObservadores();
  }

  // Entradas binarias de los mandos. El jugador es el del socket, no el del mensaje,
  // para que nadie se haga pasar por otro.
  entrada(j, data) {
    const msg = decode(data);
    if (msg) this.partida?.entrada(j.id, msg, data.length);
  }

  vibrar(data) {
    this.jugadores.get(data[1])?.socket?.send(data, { binary: true });
  }

  vibrarJugador(id, ms) {
    this.jugadores.get(id)?.socket?.send(encodeVibrate(id, ms), { binary: true });
  }
}
