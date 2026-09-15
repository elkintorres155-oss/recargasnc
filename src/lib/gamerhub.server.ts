// Cliente server-only de GamerHub (portal.gamerhubstore.shop).
// Autenticación oficial:
//   X-API-Key: API_KEY
//   X-Timestamp: unix seconds (±300s del servidor de GamerHub)
//   X-Signature: HMAC-SHA256 hex de  api_key + "|" + timestamp + "|" + raw_body
//   (GET sin body => raw_body vacío, el payload termina en "|")
// El cuerpo firmado es EXACTAMENTE la cadena enviada (no se re-serializa).
// Credenciales en Secrets: GAMERHUB_API_KEY, GAMERHUB_API_SECRET, GAMERHUB_BASE_URL.

type Creds = { baseUrl: string; apiKey: string; apiSecret: string };

export function getGamerHubCredentials(): Creds | null {
  const apiKey = process.env['GAMERHUB_API_KEY'];
  const apiSecret = process.env['GAMERHUB_API_SECRET'];
  const baseUrl = process.env['GAMERHUB_BASE_URL'] ?? 'https://portal.gamerhubstore.shop/v1';
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret, baseUrl: baseUrl.replace(/\/$/, '') };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  init?: { query?: Record<string, string | number | undefined>; body?: unknown },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const creds = getGamerHubCredentials();
  if (!creds) throw new Error('GamerHub no configurado');

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(init?.query ?? {})) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const url = `${creds.baseUrl}${path}${qs.toString() ? `?${qs}` : ''}`;

  // Serializamos UNA sola vez: esta misma cadena se firma y se envía.
  const rawBody = method === 'POST' ? JSON.stringify(init?.body ?? {}) : '';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const payload = `${creds.apiKey}|${timestamp}|${rawBody}`;
  const signature = await hmacSha256Hex(creds.apiSecret, payload);

  const res = await fetch(url, {
    method,
    headers: {
      'X-API-Key': creds.apiKey,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(method === 'POST' ? { body: rawBody } : {}),
  });

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* respuesta no JSON */
  }
  return { ok: res.ok, status: res.status, body: parsed };
}

/** GET firmado genérico (solo lectura). */
export const gamerHubGet = (path: string, query?: Record<string, string | number | undefined>) =>
  request('GET', path, query ? { query } : undefined);

/** Saldo de la cuenta (lectura, no consume nada). */
export const gamerHubBalance = () => request('GET', '/balance');

/** Catálogo de productos (lectura). */
export const gamerHubProducts = () => request('GET', '/products');
