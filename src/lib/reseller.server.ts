// Server-only: nivel del usuario y precio oficial del paquete (nunca confiar en el cliente).
import { packPrice, type PriceTier } from './pricing';

export async function getUserTier(userId: string): Promise<PriceTier> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('reseller_members')
    .select('tier')
    .eq('user_id', userId)
    .maybeSingle();
  return (data?.tier ?? 'public') as PriceTier;
}

/** Precio oficial del paquete según el catálogo guardado y el nivel del usuario. */
export async function resolvePackPrice(args: {
  userId: string;
  productId: string;
  packId: string;
}): Promise<{ tier: PriceTier; price: number | null }> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const tier = await getUserTier(args.userId);
  const { data } = await supabaseAdmin
    .from('store_settings')
    .select('data')
    .eq('id', 'default')
    .maybeSingle();

  const catalog = (data?.data as { catalog?: any[] } | null)?.catalog ?? [];
  for (const cat of catalog) {
    for (const product of cat?.items ?? []) {
      if (product?.id !== args.productId) continue;
      for (const pack of product?.packs ?? []) {
        if (pack?.id !== args.packId) continue;
        return { tier, price: packPrice(pack, tier) };
      }
    }
  }
  return { tier, price: null };
}
