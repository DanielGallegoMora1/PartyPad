// WebSocket de PartyPad. Cada conexión dice qué es con ?rol=pantalla o ?rol=mando.
// Los eventos de sala llegan en JSON y las entradas de los mandos en binario (ver docs/03-protocolo.md).
import { WebSocketServer } from 'ws';
import { MSG } from '../shared/protocol.js';
import { buscarSala, crearSala, enviar } from './salas.js';

const noExiste = (code) => ({ type: 'room_info', code, exists: false });

function mensajePantalla(socket, msg) {
  const sala = socket.sala;
  switch (msg.type) {
    case 'create_room': {
      if (sala) return;
      const nueva = crearSala();
      nueva.conectarPantalla(socket);
      enviar(socket, { type: 'room_created', code: nueva.code, token: nueva.hostToken });
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
      const { error, jugador } = sala.unir(socket, msg.name, msg.color);
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
  }
}

const unido = (sala, j) => ({
  type: 'joined',
  code: sala.code,
  token: j.token,
  state: sala.state,
  hostConnected: sala.host !== null,
  player: { id: j.id, name: j.name, color: j.color },
});

export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, req) => {
    const rol = new URL(req.url, 'http://localhost').searchParams.get('rol');
    if (rol !== 'pantalla' && rol !== 'mando') {
      socket.close(4000, 'Falta ?rol=pantalla o ?rol=mando');
      return;
    }
    socket.sala = null;
    socket.jugador = null;
    socket.observando = null;

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

  return wss;
}
