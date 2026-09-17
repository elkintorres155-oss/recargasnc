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
 * Valida el ID de jugador antes de comprar. Primero intenta FZR (fazercards)
 * con POST /topups/validate-id; si el juego no está soportado, usa FlashTopUp.
 * Requiere sesión para evitar abuso del endpoint.
 */
export const checkPlayerId = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { serviceCode: string; userId: string; serverId?: string; validationCode?: string; productId?: string }) => {
    const serviceCode = String(input?.serviceCode ?? '').trim();
    const validationCode = String(input?.validationCode ?? '').trim() || serviceCode;
    const userId = String(input?.userId ?? '').trim();
    const serverId = String(input?.serverId ?? '').trim();
    const productId = String(input?.productId ?? '').trim();
    if (!serviceCode && !productId) throw new Error('Falta el código del paquete (SKU).');
    if (!userId || userId.length > 64) throw new Error('ID de jugador inválido.');
    if (serverId.length > 64) throw new Error('ID de servidor inválido.');
    return { serviceCode, userId, serverId, validationCode, productId };
  })
  .handler(async ({ data }) => {
    // 1) GamerHub: POST /v1/verify con { product_code, payload: { input1 } }
    const gh = await import('./gamerhub.server');
    if (gh.getGamerHubCredentials()) {
      const productCode = gh.gamerHubProductCodeFor(data.productId, data.serviceCode);
      if (productCode) {
        try {
          const res = await gh.gamerHubCheckId(productCode, data.userId);
          if (res.ok) {
            return {
              ok: true,
              valid: res.valid,
              nickname: res.valid ? res.nickname : null,
              message: res.valid
                ? res.nickname
                  ? `Cuenta encontrada: ${res.nickname}`
                  : 'ID válido.'
                : 'ID de jugador incorrecto. Revísalo e intenta de nuevo.',
            };
          }
        } catch {
          /* si GamerHub falla, seguimos con los otros proveedores */
        }
      }
    }

    // 2) FZR (fazercards)
    const fzr = await import('./fzr.server');
    if (fzr.getFzrCredentials()) {
      const category = fzr.fzrValidationCategoryFor(data.productId, data.serviceCode);
      if (category) {
        try {
          const res = await fzr.fzrValidateId(category, data.userId, data.serverId || undefined);
          const body = res.body as {
            ok?: boolean;
            valid?: boolean;
            player_name?: string;
            region?: string;
            error?: string;
          };
          if (res.ok && body?.valid) {
            const nickname = body.player_name ?? null;
            return {
              ok: true,
              valid: true,
              nickname,
              message: nickname ? `Cuenta encontrada: ${nickname}` : 'ID válido.',
            };
          }
          return {
            ok: true,
            valid: false,
            nickname: null as string | null,
            message:
              typeof body?.error === 'string' && body.error
                ? 'No pudimos validar este ID. Revísalo e intenta de nuevo.'
                : 'El proveedor no reconoce este ID.',
          };
        } catch {
          /* si FZR falla, seguimos con FlashTopUp */
        }
      }
    }

    // 2) FlashTopUp (respaldo)
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

/** Juegos/categorías del tercer proveedor (WDG). Solo administradores. */
export const listWdgCategories = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Solo administradores');

    const { wdgCategories } = await import('./wdg.server');
    const res = await wdgCategories();
    return { ok: res.ok, status: res.status, json: JSON.stringify(res.body ?? null) };
  });

/** Productos/denominaciones del tercer proveedor (WDG). Solo administradores. */
export const listWdgProducts = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { categoryId?: string } | undefined) => input ?? {})
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Solo administradores');

    const { wdgProducts } = await import('./wdg.server');
    const res = await wdgProducts(data.categoryId);
    return { ok: res.ok, status: res.status, json: JSON.stringify(res.body ?? null) };
  });

/** Saldo de la cuenta en el tercer proveedor (WDG). */
export const getWdgBalance = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Solo administradores');

    const { wdgBalance } = await import('./wdg.server');
    const res = await wdgBalance();
    return { ok: res.ok, status: res.status, json: JSON.stringify(res.body ?? null) };
  });

/** Prueba de autenticación GamerHub: saldo (GET de solo lectura). Solo administradores. */
export const getGamerHubBalance = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Solo administradores');

    const { gamerHubBalance } = await import('./gamerhub.server');
    const res = await gamerHubBalance();
    return { ok: res.ok, status: res.status, json: JSON.stringify(res.body ?? null) };
  });

/** Catálogo de productos de GamerHub (GET de solo lectura). Solo administradores. */
export const listGamerHubProducts = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Solo administradores');

    const { gamerHubProducts } = await import('./gamerhub.server');
    const res = await gamerHubProducts();
    return { ok: res.ok, status: res.status, json: JSON.stringify(res.body ?? null) };
  });
