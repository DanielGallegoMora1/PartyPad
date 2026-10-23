// Dirección a la que tiene que ir el móvil para abrir el mando, y su QR.
import QRCode from 'qrcode';

// PUBLIC_URL la pone el túnel (npm run dev) o el despliegue. Sin ella se usa la dirección
// con la que se abrió la pantalla, que solo sirve al móvil si no es localhost.
export function urlMando(req) {
  if (process.env.PUBLIC_URL) return new URL('/mando/', process.env.PUBLIC_URL).href;
  return `${req.protocol}://${req.get('host')}/mando/`;
}

export function rutasConexion(app) {
  app.get('/api/conexion', (req, res) => {
    res.json({ urlMando: urlMando(req) });
  });

  app.get('/qr.svg', async (req, res) => {
    const svg = await QRCode.toString(urlMando(req), { type: 'svg', margin: 1 });
    res.type('image/svg+xml').send(svg);
  });
}
