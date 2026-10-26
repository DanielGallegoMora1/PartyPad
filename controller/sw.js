// Service Worker del mando: lo convierte en una PWA que carga al instante desde la caché.
// La versión no se escribe a mano: el servidor cambia __VERSION__ por un hash de los archivos de ARCHIVOS
// (ver server/pwa.js). Si cambia cualquiera, este archivo cambia, el navegador instala el Service Worker nuevo
// y se borra la caché anterior. Por eso se puede servir primero de la caché sin quedarse con archivos viejos.
const VERSION = '__VERSION__';
// En desarrollo (npm run dev) el servidor lo pone a true: primero la red, para ver cada cambio al recargar,
// y la caché solo si no hay conexión. En el despliegue, primero la caché.
const PRIMERO_LA_RED = false;
const CACHE = `partypad-mando-${VERSION}`;
const FUENTES = 'partypad-fuentes'; // Google Fonts: no cambian, se guardan aparte y no se borran con cada versión

// Lo mismo que lista server/pwa.js para calcular la versión.
const ARCHIVOS = [
  '/mando/',
  '/mando/main.js',
  '/mando/sensores.js',
  '/mando/style.css',
  '/mando/manifest.webmanifest',
  '/shared/base.css',
  '/shared/protocol.js',
  '/shared/colores.js',
  '/shared/icono.svg',
  '/shared/icono-192.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting()),
  );
});

// La versión nueva toma el control enseguida y borra las cachés de versiones anteriores.
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((c) => c !== CACHE && c !== FUENTES).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // Fuentes de Google: primero la caché; si no está, se descarga y se guarda.
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(FUENTES).then(async (c) => {
        const guardada = await c.match(request);
        if (guardada) return guardada;
        const respuesta = await fetch(request);
        if (respuesta.ok || respuesta.type === 'opaque') c.put(request, respuesta.clone());
        return respuesta;
      }),
    );
    return;
  }

  if (url.origin !== location.origin) return;
  // La página del mando lleva la sala en la URL (?sala=ABCD): es la misma página para cualquier sala.
  const navegacion = request.mode === 'navigate' && url.pathname.startsWith('/mando');
  const enCache = () => (navegacion ? caches.match('/mando/') : caches.match(request, { ignoreSearch: true }));
  if (PRIMERO_LA_RED) {
    e.respondWith(fetch(request).catch(() => enCache().then((r) => r ?? Response.error())));
    return;
  }
  // Lo que está en la caché, de la caché; el resto (la API, el QR…), de la red.
  e.respondWith(enCache().then((r) => r ?? fetch(request)));
});
