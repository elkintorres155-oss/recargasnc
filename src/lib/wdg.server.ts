// Cliente server-only del tercer proveedor (WDG, wdgzone.tech/api/v1).
// Autenticación con encabezado X-API-Key y X-Idempotency-Key en compras.
// Credenciales en Secrets: WDG_API_KEY, WDG_BASE_URL.

type Creds = { baseUrl: string; apiKey: string };

export function getWdgCredentials(): Creds | null {
  const apiKey = process.env['WDG_API_KEY'];
  const baseUrl = process.env['WDG_BASE_URL'] ?? 'https://wdgzone.tech/api/v1';
  if (!apiKey) return null;
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, '') };
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  init?: { query?: Record<string, string | undefined>; body?: unknown; idempotencyKey?: string },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const creds = getWdgCredentials();
  if (!creds) throw new Error('Proveedor 3 (WDG) no configurado');

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(init?.query ?? {})) {
    if (v !== undefined && v !== '') qs.set(k, v);
  }
  const url = `${creds.baseUrl}${path}${qs.toString() ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    method,
    headers: {
      'X-API-Key': creds.apiKey,
      Accept: 'application/json',
      ...(init?.idempotencyKey ? { 'X-Idempotency-Key': init.idempotencyKey.slice(0, 100) } : {}),
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(method === 'POST' ? { body: JSON.stringify(init?.body ?? {}) } : {}),
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

/** Saldo de la cuenta del proveedor. */
export const wdgBalance = () => request('GET', '/balance');

/** Categorías (juegos) disponibles. */
export const wdgCategories = () => request('GET', '/categories');

/** Productos/denominaciones (opcionalmente por categoría). */
export const wdgProducts = (categoryId?: string) =>
  request('GET', '/products', { query: { category_id: categoryId } });

/** Estado de un pedido del proveedor. */
export const wdgOrder = (orderId: string) => request('GET', `/orders/${orderId}`);

/**
 * Crea el pedido. `product_id` es numérico; algunos productos piden
 * campos extra (required_fields) que van en `fields`.
 */
export function wdgPurchase(body: {
  product_id: number;
  player_id: string;
  fields?: Record<string, string>;
  idempotencyKey: string;
}) {
  return request('POST', '/purchase', {
    idempotencyKey: body.idempotencyKey,
    body: {
      product_id: body.product_id,
      player_id: body.player_id,
      ...(body.fields && Object.keys(body.fields).length ? { fields: body.fields } : {}),
    },
  });
}
