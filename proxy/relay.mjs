// Relay con IP fija para FlashTopUp.
// Ejecutar en un servidor propio (VPS / Oracle Cloud Free Tier):
//   RELAY_SECRET=tu-secreto node relay.mjs
// Escucha en el puerto 8787 (configurable con PORT).

import http from 'node:http';

const PORT = Number(process.env.PORT || 8787);
const SECRET = process.env.RELAY_SECRET || '';
// Varios proveedores separados por coma (ALLOWED_HOSTS) o uno solo (ALLOWED_HOST).
const ALLOWED_HOSTS = (
  process.env.ALLOWED_HOSTS ||
  process.env.ALLOWED_HOST ||
  'api.flashtopup.com,portal.gamerhubstore.shop'
)
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405).end('Method Not Allowed');
    return;
  }
  if (SECRET && req.headers['x-relay-secret'] !== SECRET) {
    res.writeHead(401).end('Unauthorized');
    return;
  }

  let raw = '';
  for await (const chunk of req) raw += chunk;

  try {
    const { url, method, headers, body } = JSON.parse(raw);
    const target = new URL(url);
    if (target.hostname !== ALLOWED_HOST) {
      res.writeHead(400).end('Host no permitido');
      return;
    }

    const upstream = await fetch(target, {
      method: method || 'GET',
      headers: headers || {},
      ...(body ? { body } : {}),
    });
    const text = await upstream.text();

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: upstream.status, body: text }));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: String(err) }));
  }
});

server.listen(PORT, () => console.log(`Relay escuchando en :${PORT}`));
