import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Configuración pública de la tienda (catálogo, precios, imágenes, bancos). */
export const getStoreSettings = createServerFn({ method: 'GET' }).handler(async () => {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('store_settings')
    .select('data, updated_at')
    .eq('id', 'default')
    .maybeSingle();
  return {
    json: data?.data ? JSON.stringify(data.data) : null,
    updatedAt: (data?.updated_at ?? null) as string | null,
  };
});

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  });
  if (!isAdmin) throw new Error('Forbidden');
}

/** Guarda la configuración completa (solo administradores). */
export const saveStoreSettings = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ json: z.string().max(4_000_000) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin
      .from('store_settings')
      .upsert({ id: 'default', data: JSON.parse(data.json), updated_at: new Date().toISOString() });
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const };
  });

const imageSchema = z.object({
  fileName: z.string().min(1).max(120),
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/, 'Imagen inválida')
    .max(8_000_000),
});

/** Sube una imagen del catálogo y devuelve una URL pública estable. */
export const uploadCatalogImage = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => imageSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const [meta, base64] = data.dataUrl.split(',');
    const contentType = meta!.slice(5, meta!.indexOf(';'));
    const ext = contentType.split('/')[1]!.replace('jpeg', 'jpg');
    const bytes = Uint8Array.from(atob(base64!), (c) => c.charCodeAt(0));
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const { error } = await supabaseAdmin.storage
      .from('catalog')
      .upload(path, bytes, { contentType, upsert: false });
    if (error) return { ok: false as const, message: error.message };
    return { ok: true as const, url: `/api/public/img/${path}` };
  });
