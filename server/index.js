// Servidor de PartyPad: sirve la pantalla principal, el mando, el código compartido y los packs.
import express from 'express';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { attachWebSocket } from './ws.js';
import { rutasConexion } from './conexion.js';
import { rutasMedidas } from './medidas.js';
import { iniciarPacks } from './packs.js';
import { rutaServiceWorker } from './pwa.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT ?? 3000;

const app = express();
app.set('trust proxy', true); // detrás de un túnel o del despliegue, para saber si es HTTPS

rutasConexion(app);
rutasMedidas(app);
// Para que el despliegue sepa que el servidor está arrancado.
app.get('/salud', (req, res) => res.json({ ok: true }));

app.use('/', express.static(path.join(ROOT, 'host'), { extensions: ['html'] })); // /medidas → medidas.html
rutaServiceWorker(app, ROOT); // antes que los archivos del mando: sw.js lleva la versión calculada
app.use('/mando', express.static(path.join(ROOT, 'controller')));
app.use('/shared', express.static(path.join(ROOT, 'shared')));
// Los packs no se sirven como archivos: el servidor arma sus ZIP y el manifest (ver packs.js).
await iniciarPacks(app, path.join(ROOT, 'packs'));
// Librerías de npm que usa el navegador: así basta con npm install, sin copiar nada a mano.
app.use('/lib/phaser', express.static(path.join(ROOT, 'node_modules/phaser/dist')));
app.use('/lib/fflate', express.static(path.join(ROOT, 'node_modules/fflate')));

const server = createServer(app);
attachWebSocket(server);

server.listen(PORT, () => {
  console.log(`PartyPad escuchando en http://localhost:${PORT}`);
  console.log(`  Pantalla principal: http://localhost:${PORT}/`);
  console.log(`  Mando:              http://localhost:${PORT}/mando`);
  if (process.env.PUBLIC_URL) console.log(`  Mando desde el móvil: ${new URL('/mando/', process.env.PUBLIC_URL).href}`);
  console.log(`  WebSocket:          ws://localhost:${PORT}/ws?rol=pantalla|mando`);
});
