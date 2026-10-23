// Servidor de PartyPad: sirve la pantalla principal, el mando, el código compartido y los packs.
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { attachWebSocket } from './ws.js';
import { rutasConexion } from './conexion.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT ?? 3000;

const app = express();
app.set('trust proxy', true); // detrás de un túnel o del despliegue, para saber si es HTTPS

rutasConexion(app);

app.use('/', express.static(path.join(ROOT, 'host')));
app.use('/mando', express.static(path.join(ROOT, 'controller')));
app.use('/shared', express.static(path.join(ROOT, 'shared')));
app.use('/packs', express.static(path.join(ROOT, 'packs')));

const server = createServer(app);
attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`PartyPad escuchando en http://localhost:${PORT}`);
  console.log(`  Pantalla principal: http://localhost:${PORT}/`);
  console.log(`  Mando:              http://localhost:${PORT}/mando`);
  if (process.env.PUBLIC_URL) console.log(`  Mando desde el móvil: ${new URL('/mando/', process.env.PUBLIC_URL).href}`);
  console.log(`  WebSocket:          ws://localhost:${PORT}/ws?rol=pantalla|mando`);
});
