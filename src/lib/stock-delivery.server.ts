import { notifyAdminTelegram } from './telegram.server';

export type StockPackConfig = { requiresStock: boolean; service: string };

/** Busca en el catálogo (store_settings) si el paquete comprado se entrega con stock. */
export async function getStockPackConfig(
  productId: string,
  packId: string,
): Promise<StockPackConfig> {
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
          requiresStock: !!pack?.requiresStock,
          service: String(pack?.serviceSlug || product?.id || ''),
        };
      }
    }
  }
  return { requiresStock: false, service: '' };
}

export type ClaimedAccount = {
  service: string;
  email: string;
  password: string;
  profile: string;
  pin: string;
  notes: string;
  expires_at: string | null;
};

/** Reclama una cuenta disponible del inventario de forma atómica. */
export async function claimAccountForOrder(args: {
  service: string;
  orderId: string;
  userId: string;
  productName: string;
}): Promise<ClaimedAccount | null> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin.rpc('claim_stock_account', {
    _service: args.service,
    _order_id: args.orderId,
    _user_id: args.userId,
    _product_name: args.productName,
  });
  if (error) {
    console.error('claim_stock_account falló:', error.message);
    return null;
  }
  const acc = data as unknown as ClaimedAccount | null;
  if (!acc || !acc.email) return null;
  return acc;
}

export async function notifyAccountDelivered(args: {
  productName: string;
  packLabel: string;
  amountNio: number;
  orderCode: string;
  account: ClaimedAccount;
  customerEmail: string;
  customerPhone: string;
}): Promise<void> {
  await notifyAdminTelegram(
    [
      '🎬 <b>Cuenta entregada</b>',
      `Producto: ${args.productName} ${args.packLabel}`,
      `Precio: C$${args.amountNio.toFixed(2)}`,
      `Orden: ${args.orderCode}`,
      `Cuenta: ${args.account.email} / ${args.account.password}`,
      args.account.profile ? `Perfil: ${args.account.profile}` : '',
      args.account.pin ? `PIN: ${args.account.pin}` : '',
      `Cliente: ${args.customerEmail || 'sin correo'} · ${args.customerPhone}`,
      `Fecha: ${new Date().toLocaleString('es-NI', { timeZone: 'America/Managua' })}`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

export async function notifyOutOfStock(args: {
  productName: string;
  packLabel: string;
  service: string;
  orderCode: string;
  customerPhone: string;
}): Promise<void> {
  await notifyAdminTelegram(
    [
      '⚠️ <b>SIN STOCK</b>',
      `Producto: ${args.productName} ${args.packLabel}`,
      `Servicio: ${args.service}`,
      `Orden: ${args.orderCode}`,
      `Cliente: ${args.customerPhone}`,
      'Entrega manual pendiente.',
    ].join('\n'),
  );
}
