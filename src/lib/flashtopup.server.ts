// Cliente server-only para FlashTopUp (reseller v2), firmado con HMAC-SHA256.
// Las credenciales viven en Secrets: TOPUP_PROVIDER_BASE_URL, TOPUP_PROVIDER_API_ID,
// TOPUP_PROVIDER_API_KEY. Nunca se exponen al navegador.
//
// Cadena canónica exacta (documentada por el proveedor):
// METHOD + "\n" + PATH + "\n" + TIMESTAMP + "\n" + NONCE + "\n" + SHA256(body)
// La firma es HMAC-SHA256(apiKey, canonical) en hexadecimal minúsculas.

type Credentials = { baseUrl: string; apiId: string; apiKey: string };

export function getCredentials(): Credentials | null {
  const baseUrl = process.env['TOPUP_PROVIDER_BASE_URL'];
  const apiId = process.env['TOPUP_PROVIDER_API_ID'];
  const apiKey = process.env['TOPUP_PROVIDER_API_KEY'];
  if (!baseUrl || !apiId || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiId, apiKey };
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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

async function buildSignature(
  method: 'GET' | 'POST',
  path: string,
  bodyStr: string,
  creds: Credentials,
): Promise<{ timestamp: string; nonce: string; signature: string }> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const bodyHash = await sha256Hex(bodyStr);
  const canonical = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
  const signature = await hmacSha256Hex(creds.apiKey, canonical);
  return { timestamp, nonce, signature };
}

/**
 * Si hay un relay/proxy con IP fija configurado (TOPUP_PROXY_URL), todas las
 * llamadas al proveedor salen por ahí para cumplir su lista blanca de IP.
 */
async function sendThroughProxyOrDirect(
  fullUrl: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  bodyStr: string,
): Promise<Response> {
  const proxyUrl = process.env['TOPUP_PROXY_URL'];
  const proxySecret = process.env['TOPUP_PROXY_SECRET'];

  if (proxyUrl) {
    const relayRes = await fetch(proxyUrl.replace(/\/$/, ''), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(proxySecret ? { 'X-Relay-Secret': proxySecret } : {}),
      },
      body: JSON.stringify({
        url: fullUrl,
        method,
        headers,
        body: method === 'POST' ? bodyStr : undefined,
      }),
    });

    const relayText = await relayRes.text();
    if (!relayRes.ok) {
      return new Response(
        JSON.stringify({ error: 'PROXY_ERROR', status: relayRes.status, detail: relayText }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    try {
      const parsed = JSON.parse(relayText) as { status: number; body: string };
      return new Response(parsed.body ?? '', { status: parsed.status ?? 502 });
    } catch {
      return new Response(relayText, { status: relayRes.status });
    }
  }

  return fetch(fullUrl, {
    method,
    headers,
    ...(method === 'POST' ? { body: bodyStr } : {}),
  });
}

async function doRequest(
  method: 'GET' | 'POST',
  fullUrl: string,
  path: string,
  bodyStr: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const creds = getCredentials();
  if (!creds) throw new Error('Credenciales del proveedor no configuradas');

  const { timestamp, nonce, signature } = await buildSignature(method, path, bodyStr, creds);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'RecargasNC/1.0',
    'X-FT-API-ID': creds.apiId,
    'X-FT-Timestamp': timestamp,
    'X-FT-Nonce': nonce,
    'X-FT-Signature': signature,
    // Modo de pruebas: el proveedor no descuenta saldo real.
    // Para desactivarlo, define TOPUP_SANDBOX=false.
    ...(process.env['TOPUP_SANDBOX'] === 'false' ? {} : { 'X-FT-Sandbox': 'true' }),
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';

  const res = await sendThroughProxyOrDirect(fullUrl, method, headers, bodyStr);

  const text = await res.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    /* respuesta no JSON */
  }

  return { ok: res.ok, status: res.status, body: parsed };
}

/** GET firmado. */
export async function signedGet(
  path: string,
  query?: Record<string, string | number | undefined>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const creds = getCredentials();
  if (!creds) throw new Error('Credenciales del proveedor no configuradas');

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const url = `${creds.baseUrl}${path}${qs.toString() ? `?${qs}` : ''}`;
  const canonicalPath = new URL(url).pathname;
  return doRequest('GET', url, canonicalPath, '');
}

/** POST firmado (crear orden, etc.). */
export async function signedRequest(
  path: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const creds = getCredentials();
  if (!creds) throw new Error('Credenciales del proveedor no configuradas');

  const url = `${creds.baseUrl}${path}`;
  const canonicalPath = new URL(url).pathname;
  return doRequest('POST', url, canonicalPath, JSON.stringify(payload));
}
