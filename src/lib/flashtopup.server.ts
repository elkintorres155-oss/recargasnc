// Cliente server-only para FlashTopUp (reseller v2), firmado con HMAC-SHA256.
// Las credenciales viven en Secrets: TOPUP_PROVIDER_BASE_URL, TOPUP_PROVIDER_API_ID,
// TOPUP_PROVIDER_API_KEY. Nunca se exponen al navegador.

type Credentials = { baseUrl: string; apiId: string; apiKey: string };

export function getCredentials(): Credentials | null {
  const baseUrl = process.env['TOPUP_PROVIDER_BASE_URL'];
  const apiId = process.env['TOPUP_PROVIDER_API_ID'];
  const apiKey = process.env['TOPUP_PROVIDER_API_KEY'];
  if (!baseUrl || !apiId || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/$/, ''), apiId, apiKey };
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

/** Firma canónica: api_id + timestamp + cuerpo JSON, con HMAC-SHA256 sobre la API key. */
export async function signedRequest(
  path: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const creds = getCredentials();
  if (!creds) throw new Error('Credenciales del proveedor no configuradas');

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const body = JSON.stringify({ ...payload, api_id: creds.apiId, timestamp });
  const signature = await hmacSha256Hex(creds.apiKey, `${creds.apiId}${timestamp}${body}`);

  const res = await fetch(`${creds.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Id': creds.apiId,
      'X-Timestamp': timestamp,
      'X-Signature': signature,
    },
    body,
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
