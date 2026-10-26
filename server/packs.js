// Packs descargables (ver docs/02-arquitectura.md, "Sistema de packs"). Cada carpeta de packs/ con un pack.json
// es un minijuego que se puede añadir sin tocar el resto del código:
//   pack.json      id, nombre, versión y si sale publicado al arrancar
//   servidor.js    la lógica, que se carga aquí (no viaja en el ZIP)
//   pantalla.js    la escena de Phaser, que descarga la pantalla
//   recursos/      sprites WebP y sonidos Opus
// El servidor arma el ZIP de cada pack en memoria, calcula su SHA-256 y publica la lista en /packs/manifest.json.
// Si cambia algo en packs/, o se publica un pack con `npm run publicar`, avisa a las pantallas para que lo descarguen.
import { readdir, readFile, stat } from 'node:fs/promises';
import { watch } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { zipSync } from 'fflate';
import { Minijuego, conPuestos } from './minijuegos/minijuego.js';

const YA_COMPRIMIDOS = /\.(webp|png|jpe?g|webm|ogg|opus|mp3|m4a)$/i; // van en el ZIP sin volver a comprimir
// Fecha fija dentro del ZIP: así el SHA-256 solo cambia si cambia el contenido, no en cada arranque.
const FECHA_ZIP = new Date('2026-01-01T00:00:00Z');
const EN_EL_ZIP = (ruta) => ruta === 'pack.json' || ruta === 'pantalla.js' || ruta.startsWith('recursos/');

let carpeta = null;
let versionManifest = 1;
const packs = new Map(); // id → { info, zip, sha256, publicado, Clase, tamanos }
const publicadosAMano = new Map(); // id → true/false, lo que se ha publicado o retirado desde que arrancó
const oyentes = new Set();

// Todas las rutas de archivos de una carpeta, relativas a ella y con barras normales.
async function archivos(dir, base = dir) {
  const lista = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) lista.push(...(await archivos(ruta, base)));
    else lista.push(path.relative(base, ruta).split(path.sep).join('/'));
  }
  return lista;
}

async function cargarPack(dir) {
  const info = JSON.parse(await readFile(path.join(dir, 'pack.json'), 'utf8'));
  if (!/^[a-z0-9-]+$/.test(info.id ?? '') || !info.version) throw new Error('pack.json necesita id y version');

  // ZIP: el código y el pack.json comprimidos con deflate; las imágenes y el audio, guardados tal cual.
  const contenido = {};
  const tamanos = { original: 0, recursos: {} };
  for (const ruta of (await archivos(dir)).filter(EN_EL_ZIP)) {
    const datos = new Uint8Array(await readFile(path.join(dir, ruta)));
    contenido[ruta] = [datos, { level: YA_COMPRIMIDOS.test(ruta) ? 0 : 9, mtime: FECHA_ZIP }];
    tamanos.original += datos.length;
    if (ruta.startsWith('recursos/')) tamanos.recursos[ruta] = datos.length;
  }
  const zip = Buffer.from(zipSync(contenido));
  const sha256 = createHash('sha256').update(zip).digest('hex');

  // La lógica del servidor, con la versión del archivo en la URL para que un cambio se vuelva a cargar.
  const servidor = path.join(dir, 'servidor.js');
  const { mtimeMs } = await stat(servidor);
  const { default: crear } = await import(`${pathToFileURL(servidor).href}?v=${mtimeMs}`);
  const Clase = crear({ Minijuego, conPuestos });
  Clase.id = info.id;
  Clase.nombre = info.name ?? Clase.nombre;

  return { info, zip, sha256, Clase, tamanos };
}

async function recargar() {
  const antes = JSON.stringify(manifest().packs);
  const nuevos = new Map();
  for (const e of await readdir(carpeta, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const dir = path.join(carpeta, e.name);
    try {
      await stat(path.join(dir, 'pack.json'));
    } catch {
      continue;
    }
    try {
      const pack = await cargarPack(dir);
      nuevos.set(pack.info.id, pack);
    } catch (err) {
      console.error(`No se ha podido cargar el pack ${e.name}: ${err.message}`);
    }
  }
  packs.clear();
  for (const [id, p] of nuevos) packs.set(id, p);
  if (JSON.stringify(manifest().packs) !== antes) avisar();
}

function avisar() {
  versionManifest++;
  for (const f of oyentes) f(manifest());
}

const publicado = (p) => publicadosAMano.get(p.info.id) ?? p.info.publicado !== false;

export function manifest() {
  return {
    version: versionManifest,
    packs: [...packs.values()].filter(publicado).map((p) => ({
      id: p.info.id,
      name: p.info.name,
      description: p.info.description ?? '',
      version: p.info.version,
      size: p.zip.length,
      sha256: p.sha256,
      url: `/packs/${p.info.id}-${p.info.version}.zip`,
    })),
  };
}

// Las clases de los packs publicados que tiene instalados una pantalla, para jugarlos en su partida.
export function minijuegosDePacks(instalados) {
  return [...packs.values()].filter((p) => publicado(p) && instalados.has(p.info.id)).map((p) => p.Clase);
}

export const alCambiarPacks = (f) => oyentes.add(f);

export function publicar(id, si = true) {
  const p = packs.get(id);
  if (!p) return false;
  if (publicado(p) !== si) {
    publicadosAMano.set(id, si);
    avisar();
  }
  return true;
}

// Publicar o retirar desde fuera del servidor (npm run publicar). Con ADMIN_TOKEN definido hay que mandarlo;
// sin él, solo se acepta desde el propio ordenador.
function autorizado(req) {
  const token = process.env.ADMIN_TOKEN;
  if (token) return req.get('authorization') === `Bearer ${token}`;
  const ip = req.socket.remoteAddress ?? '';
  // Lo que llega por el túnel (npm run dev) también sale de este ordenador, pero trae estas cabeceras.
  const deFuera = req.get('x-forwarded-for') || req.get('cf-connecting-ip');
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip) && !deFuera;
}

export async function iniciarPacks(app, dir) {
  carpeta = dir;
  await recargar();

  let espera = null;
  try {
    watch(carpeta, { recursive: true }, () => {
      clearTimeout(espera);
      espera = setTimeout(() => recargar().catch((err) => console.error(err)), 300);
    });
  } catch {
    // Sin vigilancia de archivos (algunos sistemas): los cambios se ven al reiniciar o con npm run publicar.
  }

  app.get('/packs/manifest.json', (req, res) => res.set('Cache-Control', 'no-store').json(manifest()));
  app.get('/packs/:archivo', (req, res, next) => {
    const p = [...packs.values()].find((p) => req.params.archivo === `${p.info.id}-${p.info.version}.zip`);
    if (!p || !publicado(p)) return next();
    res.type('application/zip').set('Cache-Control', 'public, max-age=31536000, immutable').send(p.zip);
  });
  // Tamaños para el estudio de compresión de los recursos.
  app.get('/api/packs', (req, res) =>
    res.json(
      [...packs.values()].map((p) => ({
        id: p.info.id,
        version: p.info.version,
        publicado: publicado(p),
        zip: p.zip.length,
        sinComprimir: p.tamanos.original,
        recursos: p.tamanos.recursos,
      })),
    ),
  );
  for (const [accion, si] of [['publicar', true], ['retirar', false]]) {
    app.post(`/api/packs/:id/${accion}`, (req, res) => {
      if (!autorizado(req)) return res.status(403).json({ error: 'No autorizado' });
      if (!publicar(req.params.id, si)) return res.status(404).json({ error: 'No existe ese pack' });
      res.json(manifest());
    });
  }
}
