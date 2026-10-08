// Cliente server-only de GamerHub.
// Mantiene la misma interfaz usada por provider.functions.ts.

type Creds = {
  baseUrl: string;
  apiKey: string;
  apiSecret: string;
};

type RequestResult = {
  ok: boolean;
  status: number;
  body: unknown;
};

export function getGamerHubCredentials(): Creds | null {
  const apiKey = process.env['GAMERHUB_API_KEY'];
  const apiSecret = process.env['GAMERHUB_API_SECRET'];
  const baseUrl =
    process.env['GAMERHUB_BASE_URL'] ??
    'https://portal.gamerhubstore.shop/v1';

  if (!apiKey || !apiSecret) return null;

  return {
    apiKey,
    apiSecret,
    baseUrl: baseUrl.replace(/\/$/, ''),
  };
}

async function hmacSha256Hex(
  secret: string,
  message: string,
): Promise<string> {
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(message),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function parseResponseBody(res: Response): Promise<unknown> {
  const text = await res.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  init?: {
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  },
): Promise<RequestResult> {
  const creds = getGamerHubCredentials();

  if (!creds) {
    throw new Error('GamerHub no configurado');
  }

  const qs = new URLSearchParams();

  for (const [key, value] of Object.entries(init?.query ?? {})) {
    if (value !== undefined && value !== '') {
      qs.set(key, String(value));
    }
  }

  const queryString = qs.toString();
  const url = `${creds.baseUrl}${path}${
    queryString ? `?${queryString}` : ''
  }`;

  const rawBody =
    method === 'POST'
      ? JSON.stringify(init?.body ?? {})
      : '';

  const timestamp = Math.floor(Date.now() / 1000).toString();

  const signaturePayload =
    `${creds.apiKey}|${timestamp}|${rawBody}`;

  const signature = await hmacSha256Hex(
    creds.apiSecret,
    signaturePayload,
  );

  const headers: Record<string, string> = {
    'X-API-Key': creds.apiKey,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  /*
   * Si existe proxy, lo usamos.
   *
   * /verify recibe directamente:
   * {
   *   product_code,
   *   payload: { input1 }
   * }
   *
   * Los demás endpoints usan el formato envelope
   * que espera el relay de GamerHub.
   */
  const proxyUrl =
    process.env['GAMERHUB_PROXY_URL'] ||
    process.env['TOPUP_PROXY_URL'];

  const proxySecret =
    process.env['GAMERHUB_PROXY_SECRET'] ||
    process.env['TOPUP_PROXY_SECRET'];

  if (proxyUrl) {
    const proxyBase = proxyUrl.replace(/\/$/, '');

    const relayHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (proxySecret) {
      relayHeaders['X-Relay-Secret'] = proxySecret;
    }
        if (proxySecret) {
      relayHeaders['X-Relay-Secret'] = proxySecret;
    }

    // IMPORTANTE:
    // El relay tiene endpoints directos para /verify y /order.
    if (
      (path === '/verify' || path === '/orders') &&
      method === 'POST'
    ) {
      const relayPath =
        path === '/verify' ? '/verify' : '/order';

      const relayRes = await fetch(`${proxyBase}${relayPath}`, {
        method: 'POST',
        headers: relayHeaders,
        body: rawBody,
      });

      const body = await parseResponseBody(relayRes);

      return {
        ok: relayRes.ok,
        status: relayRes.status,
        body,
      };
    }

    // Para GET y otros POST usamos el envelope del relay.
    const envelope = JSON.stringify({
      url,
      method,
      headers,
      ...(method === 'POST' ? { body: rawBody } : {}),
    });

    const relayRes = await fetch(proxyBase, {
      method: 'POST',
      headers: relayHeaders,
     
