import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Teléfono guardado en el perfil del usuario (para autocompletar en las compras). */
export const getMyPhone = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from('profiles')
      .select('phone')
      .eq('id', context.userId)
      .maybeSingle();
    return { phone: data?.phone ?? '' };
  });

export const saveMyPhone = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ phone: z.string().trim().min(8).max(20) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from('profiles')
      .update({ phone: data.phone })
      .eq('id', context.userId);
    if (error) throw new Error(error.message);
    return { ok: true as const, phone: data.phone };
  });
