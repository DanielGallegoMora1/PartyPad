// Service Worker del mando (controller/sw.js) con su versión calculada: un hash de todos los archivos que guarda
// en caché, que se leen de la lista ARCHIVOS del propio sw.js. Cualquier cambio en el mando da una versión nueva,
// así que nadie tiene que acordarse de subirla a mano.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// De la URL que guarda el Service Worker al archivo del repositorio.
function archivo(root, url) {
  if (url === '/mando/') return path.join(root, 'controller/index.html');
  if (url.startsWith('/mando/')) return path.join(root, 'controller', url.slice('/mando/'.length));
  return path.join(root, url.slice(1));
}

export function rutaServiceWorker(app, root) {
  app.get('/mando/sw.js', async (req, res, next) => {
    try {
      const codigo = await readFile(path.join(root, 'controller/sw.js'), 'utf8');
      const lista = codigo.match(/const ARCHIVOS = \[([\s\S]*?)\];/)[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
      const hash = createHash('sha256').update(codigo);
      for (const url of lista) hash.update(await readFile(archivo(root, url)));
      res
        .type('text/javascript')
        .set('Cache-Control', 'no-cache')
        .send(
          codigo
            .replace("const VERSION = '__VERSION__'", `const VERSION = '${hash.digest('hex').slice(0, 12)}'`)
            .replace('const PRIMERO_LA_RED = false', `const PRIMERO_LA_RED = ${process.env.NODE_ENV !== 'production'}`),
        );
    } catch (err) {
      next(err);
    }
  });
}
