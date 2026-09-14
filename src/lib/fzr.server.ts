// Cliente server-only del proveedor secundario (FZR, api.fzr.cards/api/v2).
// Autenticación simple con Bearer token. Credenciales en Secrets: FZR_API_KEY, FZR_BASE_URL.

type Creds = { baseUrl: string; apiKey: string };

export function getFzrCredentials(): Creds | null {
  const apiKey = process.env['FZR_API_KEY'];
  const baseUrl = process.env['FZR_BASE_URL'] ?? 'https://api.fzr.cards/api/v2';
  if (!apiKey) return null;
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, '') };
}

async function request(
  method: 'GET' | 'POST',
  path: string,
  init?: { query?: Record<string, string | undefined>; body?: unknown },
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const creds = getFzrCredentials();
  if (!creds) throw new Error('Proveedor secundario no configurado');

  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(init?.query ?? {})) {
    if (v !== undefined && v !== '') qs.set(k, v);
  }
  const url = `${creds.baseUrl}${path}${qs.toString() ? `?${qs}` : ''}`;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${creds.apiKey}`,
      Accept: 'application/json',
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
export const fzrBalance = () => request('GET', '/balance');

/** Categorías (juegos) disponibles. */
export const fzrCategories = (cursor?: string) =>
  request('GET', '/topups', { query: { cursor, limit: '200' } });

/** Denominaciones y campos requeridos de una categoría. */
export const fzrOffers = (categoryId: string) =>
  request('GET', '/topups/offers', { query: { category_id: categoryId } });

/** Estado de un pedido del proveedor. */
export const fzrOrder = (orderId: string) => request('GET', `/orders/${orderId}`);

/** Crea el pedido de recarga. */
export function fzrCreateOrder(body: {
  category_id: string;
  offer_id: string;
  fields: Record<string, string>;
}) {
  return request('POST', '/topups/order', { body });
}

/** Nombres de campos que pide la categoría (player_id, user_id, server_id...). */
export async function fzrCategoryFields(categoryId: string): Promise<string[]> {
  const res = await fzrOffers(categoryId);
  const fields = (res.body as { fields?: Array<{ key?: string }> } | null)?.fields ?? [];
  return fields.map((f) => String(f?.key ?? '')).filter(Boolean);
}

/** Categorías que admiten validación de ID en FZR (GET /topups/validate-id). */
export const fzrValidationCategories = () => request('GET', '/topups/validate-id');

/** Valida el ID de jugador contra FZR. `zoneId` solo para juegos con zona/servidor. */
export function fzrValidateId(categoryId: string, playerId: string, zoneId?: string) {
  return request('POST', '/topups/validate-id', {
    body: {
      category_id: categoryId,
      fields: { player_id: playerId, ...(zoneId ? { zone_id: zoneId } : {}) },
    },
  });
}

/**
 * Mapea un producto de la tienda a la categoría de validación de FZR.
 * FZR valida con categorías genéricas (free_fire, pubg_mobile, mobile_legends...).
 */
export function fzrValidationCategoryFor(productId: string, serviceCode = ''): string {
  const p = `${productId} ${serviceCode}`.toLowerCase();
  if (p.includes('magic') && p.includes('chess')) return 'magic_chess_gogo_global';
  if (p.includes('free') && p.includes('fire')) return 'free_fire';
  if (p.includes('freefire')) return 'free_fire';
  if (p.includes('pubg')) return 'pubg_mobile';
  if (p.includes('mobile-legends') || p.includes('mobile_legends') || p.includes('mobile legends'))
    return 'mobile_legends';
  return '';
}
