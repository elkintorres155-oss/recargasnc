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

  const headers = {
    'X-API-Key': creds.apiKey,
    'X-Timestamp': timestamp,
    'X-Signature': signature,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  // Si hay relay/proxy con IP fija (TOPUP_PROXY_URL), salimos por ahí:
  // GamerHub exige lista blanca de IP y las IPs de salida del hosting varían.
  const proxyUrl = process.env['TOPUP_PROXY_URL'];
  const proxySecret = process.env['TOPUP_PROXY_SECRET'];
  if (proxyUrl) {
    const base = proxyUrl.replace(/\/$/, '');
    const envelope = JSON.stringify({
      url,
      method,
      headers,
      ...(method === 'POST' ? { body: rawBody } : {}),
    });
    const relayHeaders = {
      'Content-Type': 'application/json',
      ...(proxySecret ? { 'X-Relay-Secret': proxySecret } : {}),
    };
    // Algunos relays exponen la ruta /verify además de la raíz: probamos la raíz
    // y, si el relay mismo falla (404 / ruta no configurada), reintentamos en /verify.
    let relayRes = await fetch(base, { method: 'POST', headers: relayHeaders, body: envelope });
    if (relayRes.status === 404 || relayRes.status === 405) {
      relayRes = await fetch(`${base}/verify`, {
        method: 'POST',
        headers: relayHeaders,
        body: envelope,
      });
    }
    const relayText = await relayRes.text();
    let relayJson: { status?: number; body?: string } = {};
    try {
      relayJson = JSON.parse(relayText);
    } catch {
      /* relay no devolvió JSON */
    }
    const status = Number(relayJson.status ?? relayRes.status);
    const text = typeof relayJson.body === 'string' ? relayJson.body : relayText;
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* respuesta no JSON */
    }
    return { ok: status >= 200 && status < 300, status, body: parsed };
  }

  const res = await fetch(url, {
    method,
    headers,
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

/**
 * Verificación de ID de jugador.
 * POST /v1/verify con body EXACTO:
 *   { product_code: "freefire-latam", payload: { input1: "<PLAYER_ID>" } }
 * `payload` es un objeto (no un array) y Free Fire LATAM solo usa input1.
 */
export const gamerHubVerify = (productCode: string, playerId: string) =>
  request('POST', '/verify', {
    body: { product_code: productCode, payload: { input1: playerId } },
  });

/**
 * product_code de GamerHub para verificar el ID, según el producto/SKU de la tienda.
 * Free Fire LATAM => "freefire-latam" (solo requiere Player ID, sin zone_id).
 */
export function gamerHubProductCodeFor(productId?: string, serviceCode?: string): string | null {
  const hay = `${productId ?? ''} ${serviceCode ?? ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (hay.includes('freefire')) return 'freefire-latam';
  return null;
}

type AnyRec = Record<string, unknown>;

function pickString(obj: AnyRec, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Resultado normalizado de la verificación.
 * GamerHub puede devolver el resultado en la raíz o dentro de `data`/`result`,
 * y marcar la validez con `valid`, `verified`, `is_valid` o `status: "VERIFIED"`.
 * La región (US, LATAM, BR…) es solo informativa: NUNCA invalida el ID.
 */
export async function gamerHubCheckId(
  productCode: string,
  playerId: string,
): Promise<{ ok: boolean; valid: boolean; nickname: string | null; region: string | null }> {
  const res = await gamerHubVerify(productCode, playerId);
  if (!res.ok) return { ok: false, valid: false, nickname: null, region: null };

  const root = (res.body ?? {}) as AnyRec;
  const nested = [root['data'], root['result'], root['payload'], root['player']]
    .filter((v): v is AnyRec => !!v && typeof v === 'object' && !Array.isArray(v));
  const info: AnyRec = Object.assign({}, ...nested, root);
  for (const n of nested) for (const [k, v] of Object.entries(n)) if (info[k] == null) info[k] = v;

  const statusText = String(
    pickString(info, ['status', 'state', 'message', 'result_status']) ?? '',
  ).toLowerCase();
  const flags = ['valid', 'verified', 'is_valid', 'isValid', 'success', 'ok'];
  let valid = false;
  for (const f of flags) {
    const v = info[f];
    if (v === true || v === 'true' || v === 1 || v === '1') valid = true;
    if (v === false || v === 'false') {
      // un false explícito en `valid`/`verified` manda
      if (f === 'valid' || f === 'verified' || f === 'is_valid' || f === 'isValid') {
        return {
          ok: true,
          valid: false,
          nickname: null,
          region: pickString(info, ['region', 'zone', 'server']),
        };
      }
    }
  }
  if (!valid && /verified|valid|ok|success/.test(statusText) && !/invalid|not/.test(statusText)) {
    valid = true;
  }

  const nickname = pickString(info, [
    'name',
    'nickname',
    'username',
    'player_name',
    'playerName',
    'nick',
    'account_name',
    'accountName',
    'user_name',
  ]);
  const region = pickString(info, ['region', 'zone', 'server', 'country']);

  // Si GamerHub devolvió el nombre del jugador, el ID existe.
  if (!valid && nickname) valid = true;

  return { ok: true, valid, nickname, region };
}

/**
 * Orden de recarga en GamerHub (documentado): POST /v1/orders
 * con { product, sku, player_id }.
 */
export const gamerHubOrder = (input: {
  product: string;
  sku: string;
  playerId: string;
  reference?: string;
}) =>
  request('POST', '/orders', {
    body: {
      product: input.product,
      sku: input.sku,
      player_id: input.playerId,
      ...(input.reference ? { reference: input.reference } : {}),
    },
  });
