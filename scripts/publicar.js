// Publica (o retira) un pack en un servidor que ya está en marcha: las pantallas abiertas lo descargan al momento.
// Es lo que se hace en directo en la presentación.
//
//   npm run publicar -- apunta                                  en http://localhost:3000
//   npm run publicar -- apunta --retirar
//   npm run publicar -- apunta --url https://partypad.onrender.com --token <ADMIN_TOKEN>
//
// En local no hace falta token. En el despliegue hay que definir ADMIN_TOKEN en el servidor y pasar el mismo aquí
// (con --token o con la variable de entorno ADMIN_TOKEN).
const args = process.argv.slice(2);
const opcion = (nombre, defecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i === -1 ? defecto : args[i + 1];
};
const id = args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
if (!id) {
  console.error('Uso: npm run publicar -- <id del pack> [--retirar] [--url URL] [--token TOKEN]');
  process.exit(1);
}
const url = opcion('url', 'http://localhost:3000').replace(/\/$/, '');
const token = opcion('token', process.env.ADMIN_TOKEN);
const accion = args.includes('--retirar') ? 'retirar' : 'publicar';

const res = await fetch(`${url}/api/packs/${id}/${accion}`, {
  method: 'POST',
  headers: token ? { Authorization: `Bearer ${token}` } : {},
}).catch((err) => {
  console.error(`No se ha podido conectar con ${url}: ${err.message}`);
  process.exit(1);
});
const cuerpo = await res.json().catch(() => ({}));
if (!res.ok) {
  console.error(`Error ${res.status}: ${cuerpo.error ?? 'respuesta inesperada'}`);
  process.exit(1);
}
console.log(`Pack ${id} ${accion === 'publicar' ? 'publicado' : 'retirado'}. Manifest versión ${cuerpo.version}:`);
for (const p of cuerpo.packs) console.log(`  ${p.id} ${p.version} · ${p.size} B · sha256 ${p.sha256.slice(0, 16)}…`);
