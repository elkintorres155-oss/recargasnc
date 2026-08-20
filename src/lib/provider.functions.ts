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
  .inputValidator((input: { serviceCode: string; userId: string; serverId?: string }) => {
    const serviceCode = String(input?.serviceCode ?? '').trim();
    const userId = String(input?.userId ?? '').trim();
    const serverId = String(input?.serverId ?? '').trim();
    if (!serviceCode) throw new Error('Falta el código del paquete (SKU).');
    if (!userId || userId.length > 64) throw new Error('ID de jugador inválido.');
    if (serverId.length > 64) throw new Error('ID de servidor inválido.');
    return { serviceCode, userId, serverId };
  })
  .handler(async ({ data }) => {
    const { getCredentials, signedRequest } = await import('./flashtopup.server');
    if (!getCredentials()) {
      return { ok: false, valid: false, nickname: null as string | null, message: 'Proveedor no configurado.' };
    }

    const res = await signedRequest('/check-id', {
      service_code: data.serviceCode,
      user_id: data.userId,
      ...(data.serverId ? { server_id: data.serverId } : {}),
    });

    const body = res.body as {
      data?: { nickname?: string; username?: string; valid?: boolean };
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

    const nickname = body?.data?.nickname ?? body?.data?.username ?? body?.nickname ?? body?.username ?? null;
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
