// Server-only: qué proveedor entrega cada paquete (según el catálogo guardado).

export type PackProvider = 'flashtopup' | 'fzr' | 'wdg' | 'gamerhub';

export type PackProviderConfig = {
  provider: PackProvider;
  /** SKU / service_code (FlashTopUp) u offer_id (FZR). */
  sku: string;
  /** category_id de FZR (ej. free_fire_latam). */
  fzrCategory: string;
  /** product_code de GamerHub (ej. freefire-latam). */
  gamerhubProduct: string;
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
        const provider: PackProvider =
          pack?.provider === 'fzr'
            ? 'fzr'
            : pack?.provider === 'wdg'
              ? 'wdg'
              : pack?.provider === 'gamerhub'
                ? 'gamerhub'
                : 'flashtopup';
        return {
          provider,
          sku: String(pack?.sku ?? ''),
          fzrCategory: String(pack?.fzrCategory ?? product?.fzrCategory ?? ''),
          gamerhubProduct: String(pack?.gamerhubProduct ?? product?.gamerhubProduct ?? ''),
        };
      }
    }
  }
  return { provider: 'flashtopup', sku: '', fzrCategory: '', gamerhubProduct: '' };
}
