// Arranque para desarrollo y pruebas: abre un túnel HTTPS de Cloudflare hacia el servidor local
// y luego arranca el servidor con PUBLIC_URL apuntando al túnel. Así el móvil se conecta desde
// cualquier red (aunque aísle los dispositivos) y la IP del ordenador no aparece en ningún sitio.
// El túnel vive en este proceso para que la URL no cambie cuando --watch reinicia el servidor.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bin, install, Tunnel } from 'cloudflared';

const PORT = process.env.PORT ?? 3000;
const ESPERA_MAX = 30_000;

function abrirTunel() {
  return new Promise((resolve, reject) => {
    const tunel = Tunnel.quick(`http://localhost:${PORT}`);
    let url = null;
    const timer = setTimeout(() => reject(new Error('El túnel no respondió a tiempo')), ESPERA_MAX);
    tunel.once('url', (u) => (url = u));
    // La URL llega antes de que el túnel acepte conexiones: esperamos a la primera conexión.
    tunel.once('connected', () => {
      clearTimeout(timer);
      resolve({ tunel, url });
    });
    tunel.once('error', reject);
    tunel.once('exit', (code) => reject(new Error(`cloudflared terminó con código ${code}`)));
  });
}

if (!existsSync(bin)) {
  console.log('Descargando cloudflared…');
  await install(bin);
}

console.log('Abriendo túnel HTTPS…');
let tunel;
try {
  const abierto = await abrirTunel();
  tunel = abierto.tunel;
  process.env.PUBLIC_URL = abierto.url;
} catch (err) {
  console.error(`No se pudo abrir el túnel: ${err.message}`);
  console.error('Sin túnel, el mando solo funcionará desde este ordenador. Prueba otra vez o usa "npm run local".');
}

const servidor = fileURLToPath(new URL('./index.js', import.meta.url));
const args = process.argv.includes('--watch') ? ['--watch', servidor] : [servidor];
const hijo = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });

function cerrar() {
  tunel?.stop();
  hijo.kill();
  process.exit();
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
hijo.on('exit', cerrar);
