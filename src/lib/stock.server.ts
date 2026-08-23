/**
 * Control de existencias (stock) por paquete.
 * El stock vive dentro del catálogo guardado en `store_settings`.
 * `stock` nulo/indefinido = ilimitado. 0 = agotado.
 */

type PackLike = { id: string; stock?: number | null };
type ProductLike = { id: string; packs?: PackLike[] };
type CategoryLike = { items?: ProductLike[] };
type SettingsLike = { catalog?: CategoryLike[] };

async function loadSettings() {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data } = await supabaseAdmin
    .from('store_settings')
    .select('data')
    .eq('id', 'default')
    .maybeSingle();
  return (data?.data ?? null) as SettingsLike | null;
}

function findPack(settings: SettingsLike | null, productId: string, packId: string) {
  for (const cat of settings?.catalog ?? []) {
    for (const item of cat.items ?? []) {
      if (item.id !== productId) continue;
      const pack = (item.packs ?? []).find((p) => p.id === packId);
      if (pack) return pack;
    }
  }
  return null;
}

/** Devuelve el stock disponible o null si es ilimitado / no configurado. */
export async function getPackStock(productId: string, packId: string): Promise<number | null> {
  const settings = await loadSettings();
  const pack = findPack(settings, productId, packId);
  const value = pack?.stock;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Resta una unidad al stock del paquete (si tiene stock limitado). */
export async function decrementPackStock(productId: string, packId: string): Promise<void> {
  const settings = await loadSettings();
  if (!settings?.catalog) return;
  let changed = false;

  for (const cat of settings.catalog) {
    for (const item of cat.items ?? []) {
      if (item.id !== productId) continue;
      for (const pack of item.packs ?? []) {
        if (pack.id !== packId) continue;
        if (typeof pack.stock === 'number' && Number.isFinite(pack.stock)) {
          pack.stock = Math.max(0, pack.stock - 1);
          changed = true;
        }
      }
    }
  }

  if (!changed) return;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  await supabaseAdmin
    .from('store_settings')
    .upsert({ id: 'default', data: settings as never, updated_at: new Date().toISOString() });
}
