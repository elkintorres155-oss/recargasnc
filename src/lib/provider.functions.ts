import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Lista de productos del proveedor (solo administradores). */
export const listProviderProducts = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Solo administradores');

    const { signedGet } = await import('./flashtopup.server');
    const res = await signedGet('/products');
    return { ok: res.ok, status: res.status, json: JSON.stringify(res.body ?? null) };
  });

/** Servicios/denominaciones de un producto (solo administradores). */
export const listProviderServices = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Solo administradores');

    const { signedGet } = await import('./flashtopup.server');
    const res = await signedGet('/services', { product_id: data.productId });
    return { ok: res.ok, status: res.status, json: JSON.stringify(res.body ?? null) };
  });

/**
 * POST /check-id — valida el ID de jugador (y servidor) contra el proveedor
 * antes de comprar. Requiere sesión para evitar abuso del endpoint.
 */
export const checkPlayerId = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { serviceCode: string; userId: string; serverId?: string; validationCode?: string }) => {
    const serviceCode = String(input?.serviceCode ?? '').trim();
    const validationCode = String(input?.validationCode ?? '').trim() || serviceCode;
    const userId = String(input?.userId ?? '').trim();
    const serverId = String(input?.serverId ?? '').trim();
    if (!serviceCode) throw new Error('Falta el código del paquete (SKU).');
    if (!userId || userId.length > 64) throw new Error('ID de jugador inválido.');
    if (serverId.length > 64) throw new Error('ID de servidor inválido.');
    return { serviceCode, userId, serverId, validationCode };
  })
  .handler(async ({ data }) => {
    const { getCredentials, signedRequest, signedGet } = await import('./flashtopup.server');
    if (!getCredentials()) {
      return { ok: false, valid: false, nickname: null as string | null, message: 'Proveedor no configurado.' };
    }

    // El proveedor valida con `validation_code` (p. ej. "freefire_latam"),
    // que vive en GET /products, no con el SKU del paquete.
    let validationCode = data.validationCode === data.serviceCode ? '' : data.validationCode;
    if (!validationCode) {
      const prod = await signedGet('/products');
      const list = (prod.body as { data?: Array<{ product_code?: string; validation_code?: string; check_id_status?: string }> })?.data ?? [];
      let best: { code: string; len: number } | null = null;
      for (const p of list) {
        const pc = String(p.product_code ?? '');
        if (!pc || !p.validation_code) continue;
        if (data.serviceCode.startsWith(pc) && (!best || pc.length > best.len)) {
          best = { code: String(p.validation_code), len: pc.length };
        }
      }
      if (!best) {
        return {
          ok: false,
          valid: false,
          nickname: null as string | null,
          message: 'Este juego no admite verificación de ID con el proveedor.',
        };
      }
      validationCode = best.code;
    }

    const res = await signedRequest('/check-id', {
      validation_code: validationCode,
      user_id: data.userId,
      ...(data.serverId ? { server_id: data.serverId } : {}),
    });

    const body = res.body as {
      data?: { nickname?: string; username?: string; account_name?: string; valid?: boolean };
      nickname?: string;
      username?: string;
      message?: string;
      error?: { message?: unknown; errors?: Array<{ message?: string }> };
    };

    if (!res.ok) {
      const fieldErrors = Array.isArray(body?.error?.errors)
        ? body.error!.errors!.map((e) => e.message).filter(Boolean).join(' ')
        : '';
      const msg =
        fieldErrors ||
        (typeof body?.error?.message === 'string'
          ? body.error.message
          : typeof body?.message === 'string'
            ? body.message
            : `Error ${res.status}`);
      return { ok: false, valid: false, nickname: null as string | null, message: msg };
    }

    const nickname =
      body?.data?.account_name ?? body?.data?.nickname ?? body?.data?.username ?? body?.nickname ?? body?.username ?? null;
    const valid = body?.data?.valid !== false && Boolean(nickname || res.ok);

    return {
      ok: true,
      valid,
      nickname,
      message: valid
        ? nickname
          ? `Cuenta encontrada: ${nickname}`
          : 'ID válido.'
        : 'El proveedor no reconoce este ID.',
    };
  });

/** Juegos disponibles en el proveedor secundario (FZR). Solo administradores. */
export const listFzrCategories = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { cursor?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Solo administradores');

    const { fzrCategories } = await import('./fzr.server');
    const res = await fzrCategories(data.cursor);
    return { ok: res.ok, status: res.status, json: JSON.stringify(res.body ?? null) };
  });

/** Denominaciones (offer_id) y campos de un juego del proveedor secundario. */
export const listFzrOffers = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { categoryId: string }) => {
    const categoryId = String(input?.categoryId ?? '').trim();
    if (!categoryId) throw new Error('Falta el juego (category_id).');
    return { categoryId };
  })
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Solo administradores');

    const { fzrOffers } = await import('./fzr.server');
    const res = await fzrOffers(data.categoryId);
    return { ok: res.ok, status: res.status, json: JSON.stringify(res.body ?? null) };
  });

/** Saldo de la cuenta en el proveedor secundario. */
export const getFzrBalance = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Solo administradores');

    const { fzrBalance } = await import('./fzr.server');
    const res = await fzrBalance();
    return { ok: res.ok, status: res.status, json: JSON.stringify(res.body ?? null) };
  });
