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
    return { ok: res.ok, status: res.status, body: res.body };
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
    return { ok: res.ok, status: res.status, body: res.body };
  });
