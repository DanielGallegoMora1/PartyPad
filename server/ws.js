// WebSocket de PartyPad. Cada conexión dice qué es con ?rol=pantalla o ?rol=mando.
// Los eventos de sala llegan en JSON y las entradas de los mandos en binario (ver docs/03-protocolo.md).
import { WebSocketServer } from 'ws';
import { MSG } from '../shared/protocol.js';
import { buscarSala, crearSala, enviar } from './salas.js';
import { rttDePong } from './medidas.js';
import { alCambiarPacks } from './packs.js';

// Cada LATIDO ms se manda un ping a todas las conexiones; la que no ha contestado al anterior se da por perdida.
// Así se detecta un móvil que se queda sin red sin cerrar la conexión, y el túnel o el proxy del despliegue
// no cortan las conexiones que pasan un rato sin mensajes (por ejemplo, un mando esperando en el lobby).
const LATIDO = 15_000;

const noExiste = (code) => ({ type: 'room_info', code, exists: false });

function mensajePantalla(socket, msg) {
  const sala = socket.sala;
  switch (msg.type) {
    case 'create_room': {
      if (sala) return;
      const nueva = crearSala();
      nueva.conectarPantalla(socket);
      enviar(socket, { type: 'room_created', code: nueva.code, token: nueva.hostToken });
      nueva.avisarMinijuegos();
      return;
    }
    case 'resume_room': {
      const encontrada = buscarSala(msg.code);
      if (sala || !encontrada || encontrada.hostToken !== msg.token) {
        enviar(socket, { type: 'resume_error' });
        return;
      }
      encontrada.conectarPantalla(socket);
      enviar(socket, { type: 'room_resumed', code: encontrada.code, state: encontrada.state, players: encontrada.lista });
      encontrada.avisarMinijuegos();
      encontrada.partida?.avisarPantalla();
      return;
    }
    case 'start_game':
      return sala?.empezar();
    case 'back_to_lobby':
      return sala?.volverAlLobby();
    case 'kick':
      return sala?.quitar(msg.id, 'kicked');
    case 'close_room':
      return sala?.cerrar();
    case 'packs_installed':
      return sala?.ponerPacks(msg.ids);
  }
}

function mensajeMando(socket, msg) {
  switch (msg.type) {
    case 'room_info': {
      if (socket.jugador) return;
      const sala = buscarSala(msg.code);
      if (sala) sala.observar(socket);
      else enviar(socket, noExiste(msg.code));
      return;
    }
    case 'join_room': {
      if (socket.jugador) return;
      const sala = buscarSala(msg.code);
      if (!sala) {
        enviar(socket, { type: 'join_error', reason: 'not_found' });
        return;
      }
      const { error, jugador } = sala.unir(socket, msg.name, msg.avatar);
      if (error) {
        enviar(socket, { type: 'join_error', reason: error });
        return;
      }
      enviar(socket, unido(sala, jugador));
      return;
    }
    case 'rejoin': {
      if (socket.jugador) return;
      const sala = buscarSala(msg.code);
      const jugador = sala?.reconectar(socket, msg.token);
      if (!jugador) {
        enviar(socket, { type: 'rejoin_error' });
        return;
      }
      enviar(socket, unido(sala, jugador));
      sala.partida?.conectado(jugador);
      return;
    }
    case 'leave_room':
      return socket.jugador && socket.sala.quitar(socket.jugador.id);
    case 'input_stats':
      return socket.jugador && socket.sala.partida?.medicion?.estadisticasMando(msg.samples, msg.sent);
  }
}

const unido = (sala, j) => ({
  type: 'joined',
  code: sala.code,
  token: j.token,
  state: sala.state,
  hostConnected: sala.host !== null,
  player: { id: j.id, name: j.name, color: j.color, avatar: j.avatar },
});

export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    const rol = new URL(req.url, 'http://localhost').searchParams.get('rol');
    if (rol !== 'pantalla' && rol !== 'mando') {
      socket.close(4000, 'Falta ?rol=pantalla o ?rol=mando');
      return;
    }
    socket.rol = rol;
    socket.sala = null;
    socket.jugador = null;
    socket.observando = null;
    socket.vivo = true;
    socket.on('pong', (datos) => {
      socket.vivo = true;
      const rtt = rttDePong(datos); // los pings de medida llevan la hora a la que salieron
      if (rtt !== null) socket.sala?.partida?.medicion?.rtt(rtt);
    });

    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        if (data.length < 2) return;
        if (rol === 'pantalla' && data[0] === MSG.VIBRATE) socket.sala?.vibrar(data);
        if (rol === 'mando' && socket.jugador) socket.sala.entrada(socket.jugador, data);
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      if (rol === 'pantalla') mensajePantalla(socket, msg);
      else mensajeMando(socket, msg);
    });

    socket.on('close', () => {
      if (rol === 'pantalla') socket.sala?.desconectarPantalla(socket);
      else {
        socket.sala?.desconectarJugador(socket);
        socket.observando?.dejarDeObservar(socket);
      }
    });
  });

  // Cuando hay un pack nuevo o actualizado, todas las pantallas lo descargan.
  alCambiarPacks(({ version }) => {
    for (const s of wss.clients) if (s.rol === 'pantalla') enviar(s, { type: 'packs_updated', version });
  });

  const latido = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.vivo) {
        socket.terminate();
        continue;
      }
      socket.vivo = false;
      socket.ping();
    }
  }, LATIDO);
  wss.on('close', () => clearInterval(latido));

  return wss;
}
