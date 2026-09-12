// Server-only: qué proveedor entrega cada paquete (según el catálogo guardado).

export type PackProvider = 'flashtopup' | 'fzr';

export type PackProviderConfig = {
  provider: PackProvider;
  /** SKU / service_code (FlashTopUp) u offer_id (FZR). */
  sku: string;
  /** category_id de FZR (ej. free_fire_latam). */
  fzrCategory: string;
};

export async function getPackProviderConfig(
  productId: string,
  packId: string,
): Promise<PackProviderConfig> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('store_settings')
    .select('data')
    .eq('id', 'default')
    .maybeSingle();

  const catalog = (data?.data as { catalog?: any[] } | null)?.catalog ?? [];
  for (const cat of catalog) {
    for (const product of cat?.items ?? []) {
      if (product?.id !== productId) continue;
      for (const pack of product?.packs ?? []) {
        if (pack?.id !== packId) continue;
        return {
          provider: pack?.provider === 'fzr' ? 'fzr' : 'flashtopup',
          sku: String(pack?.sku ?? ''),
          fzrCategory: String(pack?.fzrCategory ?? product?.fzrCategory ?? ''),
        };
      }
    }
  }
  return { provider: 'flashtopup', sku: '', fzrCategory: '' };
}
