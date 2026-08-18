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

/**
 * El proveedor no documenta con exactitud la cadena canónica, así que probamos
 * varias variantes conocidas y recordamos la que funciona.
 */
type SigParts = {
  apiId: string;
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  body: string;
};

const VARIANTS: Array<{ name: string; build: (p: SigParts) => string }> = [
  { name: 'concat', build: (p) => `${p.apiId}${p.timestamp}${p.nonce}${p.body}` },
  {
    name: 'method-path-nl',
    build: (p) => `${p.method}\n${p.path}\n${p.timestamp}\n${p.nonce}\n${p.body}`,
  },
  {
    name: 'id-nl',
    build: (p) => `${p.apiId}\n${p.timestamp}\n${p.nonce}\n${p.body}`,
  },
  {
    name: 'method-path-pipe',
    build: (p) => `${p.method}|${p.path}|${p.timestamp}|${p.nonce}|${p.body}`,
  },
  { name: 'ts-nonce-body', build: (p) => `${p.timestamp}${p.nonce}${p.body}` },
  {
    name: 'id-ts-nonce-path-body',
    build: (p) => `${p.apiId}${p.timestamp}${p.nonce}${p.path}${p.body}`,
  },
  {
    name: 'method-path-nl-noempty',
    build: (p) =>
      p.body
        ? `${p.method}\n${p.path}\n${p.timestamp}\n${p.nonce}\n${p.body}`
        : `${p.method}\n${p.path}\n${p.timestamp}\n${p.nonce}`,
  },
];

let workingVariant: string | null = null;

function isSignatureError(status: number, body: unknown): boolean {
  if (status !== 401 && status !== 403) return false;
  const txt = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return /signature|firma/i.test(txt);
}

async function doRequest(
  method: 'GET' | 'POST',
  fullUrl: string,
  path: string,
  bodyStr: string,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const creds = getCredentials();
  if (!creds) throw new Error('Credenciales del proveedor no configuradas');

  const ordered = workingVariant
    ? [
        ...VARIANTS.filter((v) => v.name === workingVariant),
        ...VARIANTS.filter((v) => v.name !== workingVariant),
      ]
    : VARIANTS;

  let last: { ok: boolean; status: number; body: unknown } = {
    ok: false,
    status: 0,
    body: null,
  };

  for (const variant of ordered) {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomUUID().replace(/-/g, '');
    const signature = await hmacSha256Hex(
      creds.apiKey,
      variant.build({
        apiId: creds.apiId,
        timestamp,
        nonce,
        method,
        path,
        body: bodyStr,
      }),
    );

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'RecargasNC/1.0',
      'X-FT-API-ID': creds.apiId,
      'X-FT-TIMESTAMP': timestamp,
      'X-FT-NONCE': nonce,
      'X-FT-SIGNATURE': signature,
    };
    if (method === 'POST') headers['Content-Type'] = 'application/json';

    const res = await fetch(fullUrl, {
      method,
      headers,
      ...(method === 'POST' ? { body: bodyStr } : {}),
    });

    const text = await res.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* respuesta no JSON */
    }

    last = { ok: res.ok, status: res.status, body: parsed };

    if (!isSignatureError(res.status, parsed)) {
      if (res.ok) workingVariant = variant.name;
      return last;
    }
  }

  return last;
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

