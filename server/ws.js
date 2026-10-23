// WebSocket del prototipo: una única partida, sin salas todavía.
// Los mandos envían entradas binarias que se reenvían a las pantallas, y las pantallas
// pueden enviar VIBRATE a un mando concreto. Los eventos de sala van en JSON (ver docs/03-protocolo.md).
import { WebSocketServer } from 'ws';
import { MSG } from '../shared/protocol.js';

const MAX_JUGADORES = 8;

export function attachWebSocket(server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const pantallas = new Set();
  const mandos = new Map(); // id de jugador → socket
  const joins = new Map(); // id de jugador → último JOIN, para las pantallas que lleguen después

  const aPantallas = (data, isBinary) => {
    for (const p of pantallas) p.send(data, { binary: isBinary });
  };
  const aPantallasJson = (msg) => aPantallas(JSON.stringify(msg), false);

  function idLibre() {
    for (let id = 1; id <= MAX_JUGADORES; id++) if (!mandos.has(id)) return id;
    return null;
  }

  wss.on('connection', (socket, req) => {
    const rol = new URL(req.url, 'http://localhost').searchParams.get('rol');

    if (rol === 'pantalla') {
      pantallas.add(socket);
      socket.send(JSON.stringify({ type: 'players', ids: [...mandos.keys()] }));
      for (const join of joins.values()) socket.send(join, { binary: true });

      socket.on('message', (data, isBinary) => {
        // Por ahora la pantalla solo envía VIBRATE: tipo, jugador, duración.
        if (!isBinary || data.length < 2 || data[0] !== MSG.VIBRATE) return;
        mandos.get(data[1])?.send(data, { binary: true });
      });
      socket.on('close', () => pantallas.delete(socket));
      return;
    }

    if (rol === 'mando') {
      const id = idLibre();
      if (id === null) {
        socket.close(4001, 'Partida llena');
        return;
      }
      mandos.set(id, socket);
      socket.send(JSON.stringify({ type: 'joined', id }));
      aPantallasJson({ type: 'player_joined', id });

      socket.on('message', (data, isBinary) => {
        if (!isBinary || data.length < 2) return;
        // El servidor manda sobre la identidad: un mando no puede hacerse pasar por otro.
        // JOIN no lleva jugador en el byte 1, así que se reenvía con el id delante.
        const salida = data[0] === MSG.JOIN
          ? Buffer.concat([Buffer.from([MSG.JOIN, id]), data.subarray(1)])
          : Buffer.from(data);
        if (data[0] === MSG.JOIN) joins.set(id, salida);
        else salida[1] = id;
        aPantallas(salida, true);
      });
      socket.on('close', () => {
        mandos.delete(id);
        joins.delete(id);
        aPantallasJson({ type: 'player_left', id });
      });
      return;
    }

    socket.close(4000, 'Falta ?rol=pantalla o ?rol=mando');
  });

  return wss;
}
