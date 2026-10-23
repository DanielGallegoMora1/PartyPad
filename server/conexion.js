// Dirección a la que tiene que ir el móvil para abrir el mando, y su QR.
import QRCode from 'qrcode';

const CODIGO = /^[A-Z]{4}$/;

// PUBLIC_URL la pone el túnel (npm run dev) o el despliegue. Sin ella se usa la dirección
// con la que se abrió la pantalla, que solo sirve al móvil si no es localhost.
function base(req) {
  return process.env.PUBLIC_URL ?? `${req.protocol}://${req.get('host')}`;
}

// Con código de sala, el QR lleva directamente a esa sala.
export function urlMando(req) {
  const url = new URL('/mando/', base(req));
  const sala = String(req.query.sala ?? '').toUpperCase();
  if (CODIGO.test(sala)) url.searchParams.set('sala', sala);
  return url.href;
}

export function rutasConexion(app) {
  app.get('/api/conexion', (req, res) => {
    // urlCorta es para escribirla a mano: sin protocolo ni código de sala.
    res.json({ urlMando: urlMando(req), urlCorta: `${new URL(base(req)).host}/mando` });
  });

  app.get('/qr.svg', async (req, res) => {
    const svg = await QRCode.toString(urlMando(req), { type: 'svg', margin: 1 });
    res.type('image/svg+xml').send(svg);
  });
}
