// Mediciones de red para el estudio de compresión (ver docs/03-protocolo.md, "Qué medir para la memoria").
// Durante cada ronda se cuenta lo que de verdad viaja y lo que ocuparía en otros formatos:
// - Subida (mandos → servidor): los mensajes binarios reales, y los mismos mensajes en JSON y en MessagePack.
// - Bajada a la pantalla: los state_update en JSON reales, y en MessagePack y comprimidos con deflate.
// - Compresión delta: cuántas lecturas del sensor tomó cada mando y cuántas envió (lo cuenta el mando).
// - Latencia: ida y vuelta (RTT) de un ping de WebSocket a cada mando cada 2 s.
// Los resultados se ven en /medidas y se descargan en /api/medidas (JSON) o /api/medidas.csv.
import { createDeflateRaw, deflateRawSync, constants } from 'node:zlib';
import { encode } from '@msgpack/msgpack';

const MAX_HISTORIAL = 200; // rondas que se guardan en memoria
const PING = 2000; // ms entre pings de medida a cada mando
const historial = [];

// Bytes de la cabecera de una trama de WebSocket: 2, o 4 si el contenido pasa de 125 bytes (8 si pasa de 64 KB).
// Las tramas del navegador al servidor llevan además 4 bytes de máscara.
export function cabecera(bytes, mascara) {
  const base = bytes < 126 ? 2 : bytes < 65536 ? 4 : 10;
  return base + (mascara ? 4 : 0);
}

const bytesJson = (msg) => Buffer.byteLength(JSON.stringify(msg));
const r4 = (v) => Math.round(v * 10000) / 10000;

// Cómo sería la entrada en JSON o MessagePack: los mismos campos, con los decimales que tendría el sensor
// redondeados a 4 cifras (más no aporta nada y así la comparación no castiga de más a JSON).
function comoObjeto(id, e) {
  switch (e.type) {
    case 'tilt':
      return { type: 'tilt', player: id, x: r4(e.x), y: r4(e.y) };
    case 'shake':
      return { type: 'shake', player: id, intensity: r4(e.intensity) };
    case 'button':
      return { type: 'button', player: id, button: e.button, pressed: e.pressed };
    default:
      return { ...e, player: id };
  }
}

// Bytes del mensaje binario de cada lectura del sensor, según el control del minijuego.
const BYTES_LECTURA = { agitar: 3, inclinar: 4, apuntar: 4 };

export class Medicion {
  constructor({ sala, minijuego, control, jugadores }) {
    this.sala = sala;
    this.minijuego = minijuego;
    this.bytesLectura = BYTES_LECTURA[control] ?? 0;
    this.jugadores = jugadores;
    this.inicio = new Date();
    this.t0 = performance.now();
    this.segundos = 0;
    this.abierta = true;
    this.subida = { mensajes: 0, binario: 0, binarioCable: 0, json: 0, jsonCable: 0, msgpack: 0, msgpackCable: 0 };
    this.porTipo = {}; // tipo de entrada → mensajes
    this.muestras = { mandos: 0, tomadas: 0, enviadas: 0 };
    // En la bajada se comparan solo los contenidos: los mensajes son grandes y la cabecera apenas cuenta.
    this.bajada = { mensajes: 0, json: 0, msgpack: 0, deflate: 0, deflateContexto: 0 };
    this.rtts = [];

    // deflate con contexto: un único flujo para toda la ronda, como permessage-deflate con "context takeover".
    this.flujo = createDeflateRaw();
    this.flujo.on('data', (trozo) => (this.bajada.deflateContexto += trozo.length));

    historial.push(this);
    if (historial.length > MAX_HISTORIAL) historial.shift();
  }

  // Una entrada binaria de un mando (bytes: tamaño real del mensaje) ya decodificada.
  entrada(id, bytes, entrada) {
    if (!this.abierta) return;
    const objeto = comoObjeto(id, entrada);
    const json = bytesJson(objeto);
    const msgpack = encode(objeto).length;
    const s = this.subida;
    s.mensajes++;
    s.binario += bytes;
    s.binarioCable += bytes + cabecera(bytes, true);
    s.json += json;
    s.jsonCable += json + cabecera(json, true);
    s.msgpack += msgpack;
    s.msgpackCable += msgpack + cabecera(msgpack, true);
    this.porTipo[entrada.type] = (this.porTipo[entrada.type] ?? 0) + 1;
  }

  // Un mensaje de estado que se manda a la pantalla durante la ronda.
  estado(msg) {
    if (!this.abierta) return;
    const texto = Buffer.from(JSON.stringify(msg));
    const b = this.bajada;
    b.mensajes++;
    b.json += texto.length;
    b.msgpack += encode(msg).length;
    b.deflate += deflateRawSync(texto).length;
    this.flujo.write(texto);
    this.flujo.flush(constants.Z_SYNC_FLUSH);
  }

  // Lo que cuenta un mando al dejar de leer el sensor. Puede llegar justo después de cerrar la ronda.
  estadisticasMando(tomadas, enviadas) {
    if (!Number.isInteger(tomadas) || !Number.isInteger(enviadas) || tomadas <= 0 || enviadas < 0) return;
    this.muestras.mandos++;
    this.muestras.tomadas += tomadas;
    // Al parar, el mando puede mandar un último mensaje (volver a 0) que no corresponde a ninguna lectura.
    this.muestras.enviadas += Math.min(enviadas, tomadas);
  }

  rtt(ms) {
    if (this.abierta && ms >= 0 && ms < 10_000) this.rtts.push(ms);
  }

  cerrar() {
    if (!this.abierta) return;
    this.abierta = false;
    this.segundos = (performance.now() - this.t0) / 1000;
    this.flujo.end();
  }

  // Resumen con totales y valores por segundo, que es lo que va a la memoria.
  resumen() {
    const segundos = this.abierta ? (performance.now() - this.t0) / 1000 : this.segundos;
    const porSegundo = (bytes) => Math.round((bytes / Math.max(segundos, 0.001)) * 10) / 10;
    const { subida, bajada, muestras } = this;
    // Sin compresión delta, cada lectura que no se envió habría sido un mensaje más, con su cabecera.
    const lectura = this.bytesLectura + cabecera(this.bytesLectura, true);
    const binarioSinDelta = muestras.tomadas && this.bytesLectura ? subida.binarioCable + (muestras.tomadas - muestras.enviadas) * lectura : null;
    const ordenados = [...this.rtts].sort((a, b) => a - b);
    const percentil = (p) => (ordenados.length ? Math.round(ordenados[Math.min(ordenados.length - 1, Math.floor(p * ordenados.length))] * 10) / 10 : null);
    return {
      sala: this.sala,
      minijuego: this.minijuego,
      jugadores: this.jugadores,
      inicio: this.inicio.toISOString(),
      segundos: Math.round(segundos * 10) / 10,
      subida: {
        ...subida,
        binarioSinDeltaCable: binarioSinDelta,
        porTipo: this.porTipo,
        mensajesPorSegundo: Math.round((subida.mensajes / Math.max(segundos, 0.001)) * 10) / 10,
        bytesPorSegundo: {
          json: porSegundo(subida.jsonCable),
          msgpack: porSegundo(subida.msgpackCable),
          binarioSinDelta: binarioSinDelta === null ? null : porSegundo(binarioSinDelta),
          binario: porSegundo(subida.binarioCable),
        },
      },
      muestras: { ...muestras, ahorroDelta: muestras.tomadas ? Math.round((1 - muestras.enviadas / muestras.tomadas) * 1000) / 10 : null },
      bajada: {
        ...bajada,
        bytesPorSegundo: {
          json: porSegundo(bajada.json),
          msgpack: porSegundo(bajada.msgpack),
          deflate: porSegundo(bajada.deflate),
          deflateContexto: porSegundo(bajada.deflateContexto),
        },
      },
      rtt: {
        n: ordenados.length,
        media: ordenados.length ? Math.round((ordenados.reduce((a, b) => a + b, 0) / ordenados.length) * 10) / 10 : null,
        p50: percentil(0.5),
        p95: percentil(0.95),
        max: percentil(1),
      },
    };
  }
}

// Pings de medida a los mandos de la ronda. El pong trae de vuelta la marca de tiempo (ver ws.js).
export function medirLatencia(sockets) {
  const marca = () => {
    const b = Buffer.alloc(8);
    b.writeDoubleLE(performance.now());
    return b;
  };
  const enviar = () => {
    for (const s of sockets()) if (s?.readyState === 1) s.ping(marca());
  };
  enviar();
  return setInterval(enviar, PING);
}

// Lee la marca de tiempo de un pong de medida; null si es un pong del latido normal.
export function rttDePong(datos) {
  return datos?.length === 8 ? performance.now() - datos.readDoubleLE(0) : null;
}

const COLUMNAS = [
  ['sala', (r) => r.sala],
  ['minijuego', (r) => r.minijuego],
  ['jugadores', (r) => r.jugadores],
  ['inicio', (r) => r.inicio],
  ['segundos', (r) => r.segundos],
  ['subida_mensajes', (r) => r.subida.mensajes],
  ['subida_mensajes_s', (r) => r.subida.mensajesPorSegundo],
  ['subida_binario_B', (r) => r.subida.binario],
  ['subida_json_B', (r) => r.subida.json],
  ['subida_msgpack_B', (r) => r.subida.msgpack],
  ['subida_cable_json_Bs', (r) => r.subida.bytesPorSegundo.json],
  ['subida_cable_msgpack_Bs', (r) => r.subida.bytesPorSegundo.msgpack],
  ['subida_cable_binario_sin_delta_Bs', (r) => r.subida.bytesPorSegundo.binarioSinDelta],
  ['subida_cable_binario_Bs', (r) => r.subida.bytesPorSegundo.binario],
  ['muestras_tomadas', (r) => r.muestras.tomadas],
  ['muestras_enviadas', (r) => r.muestras.enviadas],
  ['ahorro_delta_pct', (r) => r.muestras.ahorroDelta],
  ['bajada_mensajes', (r) => r.bajada.mensajes],
  ['bajada_json_Bs', (r) => r.bajada.bytesPorSegundo.json],
  ['bajada_msgpack_Bs', (r) => r.bajada.bytesPorSegundo.msgpack],
  ['bajada_deflate_Bs', (r) => r.bajada.bytesPorSegundo.deflate],
  ['bajada_deflate_contexto_Bs', (r) => r.bajada.bytesPorSegundo.deflateContexto],
  ['rtt_media_ms', (r) => r.rtt.media],
  ['rtt_p50_ms', (r) => r.rtt.p50],
  ['rtt_p95_ms', (r) => r.rtt.p95],
];

export function rutasMedidas(app) {
  const resumenes = (req) => {
    const sala = String(req.query.sala ?? '').toUpperCase();
    return historial.filter((m) => !sala || m.sala === sala).map((m) => m.resumen());
  };
  app.get('/api/medidas', (req, res) => res.json(resumenes(req)));
  app.get('/api/medidas.csv', (req, res) => {
    const filas = resumenes(req).map((r) => COLUMNAS.map(([, f]) => f(r) ?? '').join(','));
    res.type('text/csv').attachment('medidas-partypad.csv').send([COLUMNAS.map(([n]) => n).join(','), ...filas].join('\n'));
  });
}
