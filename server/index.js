// Servidor de PartyPad: sirve la pantalla principal, el mando, el código compartido y los packs.
import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT ?? 3000;

const app = express();

app.use('/', express.static(path.join(ROOT, 'host')));
app.use('/mando', express.static(path.join(ROOT, 'controller')));
app.use('/shared', express.static(path.join(ROOT, 'shared')));
app.use('/packs', express.static(path.join(ROOT, 'packs')));

app.listen(PORT, () => {
  console.log(`PartyPad escuchando en http://localhost:${PORT}`);
  console.log(`  Pantalla principal: http://localhost:${PORT}/`);
  console.log(`  Mando:              http://localhost:${PORT}/mando`);
});
