// Packs en la pantalla (ver docs/02-arquitectura.md, "Sistema de packs"): compara el manifest del servidor con lo
// guardado en IndexedDB, descarga solo lo nuevo o actualizado, comprueba su SHA-256 antes de guardarlo y registra
// la escena de cada pack en Phaser. Así un pack descargado una vez no se vuelve a bajar al recargar la página.
import { unzipSync, strFromU8 } from '/lib/fflate/esm/browser.js';
import * as Phaser from '/lib/phaser/phaser.esm.min.js';

const BD = 'partypad';
const ALMACEN = 'packs';

// IndexedDB con promesas. Si el navegador no la deja usar, los packs se descargan en cada visita.
function abrir() {
  return new Promise((resolve, reject) => {
    const peticion = indexedDB.open(BD, 1);
    peticion.onupgradeneeded = () => peticion.result.createObjectStore(ALMACEN, { keyPath: 'id' });
    peticion.onsuccess = () => resolve(peticion.result);
    peticion.onerror = () => reject(peticion.error);
  });
}

async function operar(modo, f) {
  const bd = await abrir();
  return new Promise((resolve, reject) => {
    const tx = bd.transaction(ALMACEN, modo);
    const peticion = f(tx.objectStore(ALMACEN));
    tx.oncomplete = () => resolve(peticion?.result);
    tx.onerror = () => reject(tx.error);
  });
}

const leerTodos = () => operar('readonly', (a) => a.getAll()).catch(() => []);
const guardar = (pack) => operar('readwrite', (a) => a.put(pack)).catch(() => {});
const borrar = (id) => operar('readwrite', (a) => a.delete(id)).catch(() => {});

async function sha256(datos) {
  const hash = await crypto.subtle.digest('SHA-256', datos);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const TIPOS = { webp: 'image/webp', png: 'image/png', webm: 'audio/webm', ogg: 'audio/ogg', js: 'text/javascript', json: 'application/json' };
const cargados = new Map(); // id → { version, sha256, info, Escena }

// Del ZIP a una escena de Phaser: los recursos se sirven como blob: y el código de la pantalla se importa como
// módulo. El pack no importa nada por ruta: recibe Phaser y las URL de sus recursos.
async function cargar(registro) {
  const previo = cargados.get(registro.id);
  if (previo?.sha256 === registro.sha256) return previo;
  const archivos = unzipSync(new Uint8Array(registro.zip));
  const recursos = {};
  for (const [ruta, datos] of Object.entries(archivos)) {
    if (!ruta.startsWith('recursos/')) continue;
    const tipo = TIPOS[ruta.split('.').pop()] ?? 'application/octet-stream';
    recursos[ruta] = URL.createObjectURL(new Blob([datos], { type: tipo }));
  }
  const info = JSON.parse(strFromU8(archivos['pack.json']));
  const codigo = URL.createObjectURL(new Blob([archivos['pantalla.js']], { type: 'text/javascript' }));
  const { default: crear } = await import(codigo);
  const pack = { id: registro.id, version: registro.version, sha256: registro.sha256, info, Escena: crear(Phaser, recursos) };
  cargados.set(registro.id, pack);
  return pack;
}

// Pone al día los packs. alProgresar(id, estado) se llama con 'descargando', 'nuevo', 'actualizado' o 'error'.
// Devuelve los packs listos para jugar.
export async function sincronizar(alProgresar = () => {}) {
  const manifest = await fetch('/packs/manifest.json', { cache: 'no-store' }).then((r) => r.json());
  const guardados = new Map((await leerTodos()).map((p) => [p.id, p]));

  const listos = [];
  for (const p of manifest.packs) {
    let registro = guardados.get(p.id);
    if (!registro || registro.version !== p.version || registro.sha256 !== p.sha256) {
      alProgresar(p.id, 'descargando', p);
      try {
        const zip = await fetch(p.url).then((r) => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.arrayBuffer();
        });
        // El hash se comprueba antes de instalar: si no coincide, se descarta y se queda la versión anterior.
        if ((await sha256(zip)) !== p.sha256) throw new Error('El SHA-256 no coincide');
        const estado = registro ? 'actualizado' : 'nuevo';
        registro = { id: p.id, version: p.version, sha256: p.sha256, zip, instalado: Date.now() };
        await guardar(registro);
        alProgresar(p.id, estado, p);
      } catch (err) {
        console.warn(`No se ha podido descargar el pack ${p.id}:`, err);
        alProgresar(p.id, 'error', p);
        if (!registro) continue;
      }
    }
    try {
      listos.push(await cargar(registro));
    } catch (err) {
      console.warn(`No se ha podido cargar el pack ${p.id}:`, err);
      alProgresar(p.id, 'error', p);
    }
  }

  // Los que el servidor ya no ofrece se borran: no se podrían jugar.
  for (const id of guardados.keys()) {
    if (!manifest.packs.some((p) => p.id === id)) {
      await borrar(id);
      cargados.delete(id);
    }
  }
  return listos;
}
