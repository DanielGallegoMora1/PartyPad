// Campaña de mediciones para la memoria: arranca un servidor propio, juega partidas con bots (2, 4 y 8 jugadores,
// y 8 casi quietos) y escribe las tablas en docs/mediciones/. Tarda unos 8 minutos.
//
//   npm run medir                      todas las configuraciones
//   npm run medir -- --rapido          solo 2 y 8 jugadores
//   npm run medir -- --recursos        solo la tabla de los recursos de los packs, sin jugar partidas
//
// Los bots se conectan por WebSocket como los móviles, pero en el mismo ordenador: los bytes y los mensajes son
// reales, la latencia no. Para la latencia y el ahorro de la compresión delta con personas, mirad /medidas
// después de jugar con móviles de verdad.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { zipSync } from 'fflate';
import { fileURLToPath } from 'node:url';
import { encode } from '@msgpack/msgpack';
import { encodeButton, encodeShake, encodeTilt, encodeVibrate } from '../shared/protocol.js';
import { cabecera } from '../server/medidas.js';

const raiz = fileURLToPath(new URL('..', import.meta.url));
const PORT = 3999;
const URL_HTTP = `http://localhost:${PORT}`;
const CONFIGURACIONES = process.argv.includes('--rapido')
  ? [[2], [8]]
  : [[2], [4], [8], [8, '--quieto']];

// Tamaño de un mensaje suelto en cada formato

function tamanos() {
  const ejemplos = [
    ['TILT (inclinación)', encodeTilt(3, 0.2345, -0.8812), { type: 'tilt', player: 3, x: 0.2345, y: -0.8812 }],
    ['SHAKE (agitar)', encodeShake(3, 0.52), { type: 'shake', player: 3, intensity: 0.52 }],
    ['BUTTON (botón)', encodeButton(3, 0, true), { type: 'button', player: 3, button: 0, pressed: true }],
    ['VIBRATE (vibrar)', encodeVibrate(3, 300), { type: 'vibrate', player: 3, ms: 300 }],
  ];
  const filas = ejemplos.map(([nombre, binario, objeto]) => {
    const json = Buffer.byteLength(JSON.stringify(objeto));
    const msgpack = encode(objeto).length;
    const msgpack32 = encode(objeto, { forceFloat32: true }).length;
    const bin = binario.byteLength;
    return `| ${nombre} | ${json} B | ${msgpack} B | ${msgpack32} B | **${bin} B** | ${bin + cabecera(bin, true)} B frente a ${json + cabecera(json, true)} B |`;
  });
  return [
    '| Mensaje | JSON | MessagePack | MessagePack (float32) | Binario propio | En el cable desde el móvil (binario frente a JSON) |',
    '|---|---|---|---|---|---|',
    ...filas,
  ].join('\n');
}

// Recursos de los packs: cada recurso frente a su original sin comprimir, y el ZIP con distintas opciones.
// Los originales (PNG y WAV) están en packs/<id>/originales/ y no viajan en el pack.

const sinExtension = (nombre) => nombre.replace(/\.[^.]+$/, '');
const veces = (a, b) => `${(a / b).toFixed(1).replace('.', ',')} veces menos`;

function recursosPacks() {
  const filas = [];
  const zips = [];
  for (const id of readdirSync(`${raiz}packs`)) {
    const dir = `${raiz}packs/${id}`;
    if (!existsSync(`${dir}/pack.json`) || !existsSync(`${dir}/originales`)) continue;
    const originales = readdirSync(`${dir}/originales`);
    for (const recurso of readdirSync(`${dir}/recursos`)) {
      const enPack = readFileSync(`${dir}/recursos/${recurso}`).length;
      for (const original of originales.filter((o) => sinExtension(o) === sinExtension(recurso))) {
        const bytes = readFileSync(`${dir}/originales/${original}`).length;
        filas.push(`| ${id} | ${original} → ${recurso} | ${bytes} B | **${enPack} B** | ${veces(bytes, enPack)} |`);
      }
      // Variantes para comparar, como el mismo sonido en Opus a menos bitrate.
      for (const variante of originales.filter((o) => o.startsWith(`${sinExtension(recurso)}-`) && /-\d+kbps\./.test(o))) {
        const bytes = readFileSync(`${dir}/originales/${variante}`).length;
        filas.push(`| ${id} | ${variante} (alternativa a ${recurso}) | | ${bytes} B | |`);
      }
    }
    // El ZIP: sin comprimir, con deflate en todo y como lo arma el servidor (deflate solo en el código,
    // porque WebP y Opus ya van comprimidos).
    const archivos = ['pack.json', 'pantalla.js', ...readdirSync(`${dir}/recursos`).map((r) => `recursos/${r}`)];
    const datos = Object.fromEntries(archivos.map((a) => [a, new Uint8Array(readFileSync(`${dir}/${a}`))]));
    const armar = (nivel) => zipSync(Object.fromEntries(Object.entries(datos).map(([a, d]) => [a, [d, { level: nivel(a) }]]))).length;
    const total = Object.values(datos).reduce((t, d) => t + d.length, 0);
    const comprimido = (a) => /\.(webp|webm)$/.test(a);
    zips.push(`| ${id} | ${total} B | ${armar(() => 0)} B | ${armar(() => 9)} B | **${armar((a) => (comprimido(a) ? 0 : 9))} B** |`);
  }
  return [
    '| Pack | Original → en el pack | Original | En el pack | Ahorro |',
    '|---|---|---|---|---|',
    ...filas,
    '',
    '| Pack | Archivos sueltos | ZIP sin comprimir | ZIP con deflate en todo | ZIP del servidor (deflate solo en el código) |',
    '|---|---|---|---|---|',
    ...zips,
  ].join('\n');
}

// Servidor y partidas

function arrancarServidor() {
  const servidor = spawn(process.execPath, ['server/index.js'], { cwd: raiz, env: { ...process.env, PORT } });
  return new Promise((resolve, reject) => {
    servidor.stdout.on('data', (d) => d.toString().includes('escuchando') && resolve(servidor));
    servidor.once('exit', (code) => reject(new Error(`El servidor terminó con código ${code}`)));
  });
}

function simular(jugadores, extra) {
  return new Promise((resolve, reject) => {
    const args = ['scripts/simular.js', '--jugadores', String(jugadores), '--url', `ws://localhost:${PORT}`];
    if (extra) args.push(extra);
    const hijo = spawn(process.execPath, args, { cwd: raiz });
    let salida = '';
    hijo.stdout.on('data', (d) => (salida += d));
    hijo.stderr.on('data', (d) => (salida += d));
    hijo.on('exit', (code) => {
      const sala = salida.match(/Sala (\w{4})/)?.[1];
      if (code !== 0 || !sala) reject(new Error(`La simulación falló:\n${salida}`));
      else resolve(sala);
    });
  });
}

// Tablas

const kb = (v) => (v == null ? '–' : v >= 1000 ? `${(v / 1000).toFixed(2).replace('.', ',')} KB/s` : `${Math.round(v)} B/s`);
const pct = (v) => (v == null ? '–' : `${v.toFixed(1).replace('.', ',')} %`);
const NOMBRES = { carrera: 'Carrera de agitar', laberinto: 'Laberinto', reflejos: 'Reflejos' };

function tablaSubida(filas) {
  return [
    '| Minijuego | Jugadores | Mensajes/s | JSON | MessagePack | Binario sin delta | Binario + delta | Binario + delta frente a JSON | Lecturas que no se envían |',
    '|---|---|---|---|---|---|---|---|---|',
    ...filas.map(({ etiqueta, m }) => {
      const b = m.subida.bytesPorSegundo;
      const veces = b.binario ? `${(b.json / b.binario).toFixed(1).replace('.', ',')} veces menos` : '–';
      return `| ${NOMBRES[m.minijuego]} | ${etiqueta} | ${m.subida.mensajesPorSegundo.toString().replace('.', ',')} | ${kb(b.json)} | ${kb(b.msgpack)} | ${kb(b.binarioSinDelta)} | **${kb(b.binario)}** | ${veces} | ${pct(m.muestras.ahorroDelta)} |`;
    }),
  ].join('\n');
}

function tablaBajada(filas) {
  return [
    '| Minijuego | Jugadores | Mensajes/s | JSON | MessagePack | Deflate por mensaje | Deflate con contexto |',
    '|---|---|---|---|---|---|---|',
    ...filas.map(({ etiqueta, m }) => {
      const b = m.bajada.bytesPorSegundo;
      const porSegundo = (m.bajada.mensajes / m.segundos).toFixed(1).replace('.', ',');
      return `| ${NOMBRES[m.minijuego]} | ${etiqueta} | ${porSegundo} | ${kb(b.json)} | ${kb(b.msgpack)} | ${kb(b.deflate)} | ${kb(b.deflateContexto)} |`;
    }),
  ].join('\n');
}

function csv(filas) {
  const cols = ['configuracion', 'minijuego', 'jugadores', 'segundos', 'mensajes_s', 'json_Bs', 'msgpack_Bs', 'binario_sin_delta_Bs', 'binario_Bs', 'ahorro_delta_pct', 'pantalla_json_Bs', 'pantalla_msgpack_Bs', 'pantalla_deflate_Bs', 'pantalla_deflate_contexto_Bs'];
  return [
    cols.join(','),
    ...filas.map(({ etiqueta, m }) =>
      [etiqueta, m.minijuego, m.jugadores, m.segundos, m.subida.mensajesPorSegundo, m.subida.bytesPorSegundo.json, m.subida.bytesPorSegundo.msgpack, m.subida.bytesPorSegundo.binarioSinDelta ?? '', m.subida.bytesPorSegundo.binario, m.muestras.ahorroDelta ?? '', m.bajada.bytesPorSegundo.json, m.bajada.bytesPorSegundo.msgpack, m.bajada.bytesPorSegundo.deflate, m.bajada.bytesPorSegundo.deflateContexto].join(','),
    ),
  ].join('\n');
}

// Campaña

const fecha = new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });
const carpeta = `${raiz}docs/mediciones`;
mkdirSync(carpeta, { recursive: true });

const informeRecursos = `# Recursos de los packs

Generado con \`npm run medir\` el ${fecha}. Las imágenes de los packs van en WebP y los sonidos en Opus (dentro de WebM); los originales en PNG y WAV están en \`packs/<id>/originales/\` para poder comparar.

${recursosPacks()}

WebP y Opus ya están comprimidos, así que volver a pasarles deflate dentro del ZIP apenas ahorra: el servidor solo comprime el código y el \`pack.json\`, y guarda el resto tal cual.
`;
writeFileSync(`${carpeta}/recursos.md`, informeRecursos);
console.log('Escrito en docs/mediciones/recursos.md');
if (process.argv.includes('--recursos')) process.exit();

const servidor = await arrancarServidor();
const filas = [];
try {
  for (const [jugadores, extra] of CONFIGURACIONES) {
    const etiqueta = `${jugadores}${extra ? ' (quietos)' : ''}`;
    process.stdout.write(`Partida con ${etiqueta} jugadores… `);
    const sala = await simular(jugadores, extra);
    const medidas = await fetch(`${URL_HTTP}/api/medidas?sala=${sala}`).then((r) => r.json());
    for (const m of medidas) filas.push({ etiqueta, m });
    console.log(`hecho (sala ${sala})`);
  }
} finally {
  servidor.kill();
}

const orden = (a, b) => a.m.minijuego.localeCompare(b.m.minijuego);
const informe = `# Mediciones con bots

Generado con \`npm run medir\` el ${fecha}. Cada configuración es una partida con los tres minijuegos, jugada por bots que se conectan por WebSocket como los móviles (ver \`scripts/simular.js\`). Los bytes y los mensajes son reales; la latencia no, porque los bots están en el mismo ordenador. Las mediciones con móviles de verdad se ven en \`/medidas\` al jugar y se descargan en CSV.

## Tamaño de cada mensaje

${tamanos()}

MessagePack guarda los decimales como float64 (9 bytes); con \`forceFloat32\` baja un poco, pero sigue llevando los nombres de los campos. El binario propio cuantiza la inclinación a \`int8\` y la intensidad a \`uint8\`. En el cable, cada mensaje del móvil lleva además la cabecera de WebSocket: 2 bytes y 4 de máscara.

## Subida: mandos → servidor

Bytes por segundo de todos los mandos juntos durante la ronda, con las cabeceras de WebSocket. JSON y MessagePack son lo que ocuparían esos mismos mensajes. «Binario sin delta» es lo que se enviaría mandando todas las lecturas del sensor (lo cuenta cada mando); «Lecturas que no se envían» es lo que ahorra la compresión delta.

${tablaSubida([...filas].sort(orden))}

## Bajada: servidor → pantalla

Los \`state_update\` que recibe la pantalla durante la ronda, sin cabeceras. «Deflate con contexto» comprime toda la ronda en un mismo flujo, como la extensión permessage-deflate de WebSocket.

${tablaBajada([...filas].sort(orden))}
`;

writeFileSync(`${carpeta}/bots.md`, informe);
writeFileSync(`${carpeta}/bots.csv`, csv(filas));
console.log('\nEscrito en docs/mediciones/bots.md y docs/mediciones/bots.csv');
