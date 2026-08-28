import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

export type StockStatus = 'available' | 'reserved' | 'sold' | 'suspended' | 'expired';

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  available: 'Disponible',
  reserved: 'Reservada',
  sold: 'Vendida',
  suspended: 'Suspendida',
  expired: 'Vencida',
};

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  });
  if (!isAdmin) throw new Error('Forbidden');
}

const accountFields = z.object({
  service: z.string().trim().min(1).max(60),
  email: z.string().trim().max(160).default(''),
  password: z.string().max(200).default(''),
  profile: z.string().max(80).default(''),
  pin: z.string().max(20).default(''),
  notes: z.string().max(500).default(''),
  expiresAt: z.string().max(20).default(''),
  status: z
    .enum(['available', 'reserved', 'sold', 'suspended', 'expired'])
    .default('available'),
});

/** Inventario completo + resumen por servicio (solo administradores). */
export const listStock = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ service: z.string().max(60).default(''), status: z.string().max(20).default('') })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    let query = supabaseAdmin
      .from('stock_accounts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (data.service) query = query.eq('service', data.service);
    if (data.status) query = query.eq('status', data.status as StockStatus);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const { data: allRows } = await supabaseAdmin.from('stock_accounts').select('service, status');

    const summaryMap = new Map<string, Record<string, number>>();
    for (const r of allRows ?? []) {
      const entry = summaryMap.get(r.service) ?? {};
      entry[r.status] = (entry[r.status] ?? 0) + 1;
      summaryMap.set(r.service, entry);
    }
    const summary = [...summaryMap.entries()]
      .map(([service, counts]) => ({ service, counts }))
      .sort((a, b) => a.service.localeCompare(b.service));

    // Datos del cliente y de la orden para las cuentas entregadas
    const userIds = [...new Set((rows ?? []).map((r) => r.assigned_user_id).filter(Boolean))] as string[];
    const orderIds = [...new Set((rows ?? []).map((r) => r.order_id).filter(Boolean))] as string[];

    const profiles = userIds.length
      ? (await supabaseAdmin.from('profiles').select('id, full_name, email, phone').in('id', userIds)).data ?? []
      : [];
    const orders = orderIds.length
      ? (await supabaseAdmin.from('orders').select('id, order_code, product_name, pack_label').in('id', orderIds)).data ?? []
      : [];

    const pMap = new Map(profiles.map((p) => [p.id, p]));
    const oMap = new Map(orders.map((o) => [o.id, o]));

    return {
      accounts: (rows ?? []).map((r) => ({
        ...r,
        customer: r.assigned_user_id ? (pMap.get(r.assigned_user_id) ?? null) : null,
        order: r.order_id ? (oMap.get(r.order_id) ?? null) : null,
      })),
      summary,
      services: [...summaryMap.keys()].sort(),
    };
  });

/** Historial de movimientos del stock (solo administradores). */
export const listStockMovements = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data } = await supabaseAdmin
      .from('stock_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(300);
    return { movements: data ?? [] };
  });

/** Alta individual de una cuenta. */
export const createStockAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => accountFields.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: row, error } = await supabaseAdmin
      .from('stock_accounts')
      .insert({
        service: data.service,
        email: data.email,
        password: data.password,
        profile: data.profile,
        pin: data.pin,
        notes: data.notes,
        expires_at: data.expiresAt || null,
        status: data.status,
      })
      .select('id, email, service, status')
      .single();
    if (error) return { ok: false as const, message: error.message };
    await supabaseAdmin.from('stock_movements').insert({
      account_id: row.id,
      account_email: row.email,
      service: row.service,
      action: 'created',
      status_after: row.status,
      admin_id: context.userId,
      note: 'Cuenta creada manualmente',
    });
    return { ok: true as const };
  });

/** Alta masiva pegando líneas `correo:contraseña` (opcionalmente `:perfil:pin`). */
export const bulkCreateStock = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        service: z.string().trim().min(1).max(60),
        text: z.string().max(200_000),
        expiresAt: z.string().max(20).default(''),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const rows = data.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(/[:|;,\t]/).map((p) => p.trim());
        return {
          service: data.service,
          email: parts[0] ?? '',
          password: parts[1] ?? '',
          profile: parts[2] ?? '',
          pin: parts[3] ?? '',
          notes: '',
          expires_at: data.expiresAt || null,
          status: 'available' as const,
        };
      })
      .filter((r) => r.email);

    if (!rows.length) return { ok: false as const, created: 0, message: 'No se detectaron cuentas válidas.' };

    const { data: inserted, error } = await supabaseAdmin
      .from('stock_accounts')
      .insert(rows)
      .select('id, email, service, status');
    if (error) return { ok: false as const, created: 0, message: error.message };

    await supabaseAdmin.from('stock_movements').insert(
      (inserted ?? []).map((r) => ({
        account_id: r.id,
        account_email: r.email,
        service: r.service,
        action: 'created' as const,
        status_after: r.status,
        admin_id: context.userId,
        note: 'Alta masiva',
      })),
    );

    return { ok: true as const, created: inserted?.length ?? 0, message: '' };
  });

/** Edición / cambio de estado de una cuenta. */
export const updateStockAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    accountFields.partial().extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { id, expiresAt, ...rest } = data;

    const { data: before } = await supabaseAdmin
      .from('stock_accounts')
      .select('status, email, service')
      .eq('id', id)
      .maybeSingle();

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    if (expiresAt !== undefined) patch['expires_at'] = expiresAt || null;

    const { error } = await supabaseAdmin
      .from('stock_accounts')
      .update(patch as never)
      .eq('id', id);
    if (error) return { ok: false as const, message: error.message };

    await supabaseAdmin.from('stock_movements').insert({
      account_id: id,
      account_email: (rest.email ?? before?.email) || '',
      service: (rest.service ?? before?.service) || '',
      action: rest.status && rest.status !== before?.status ? 'status_changed' : 'updated',
      status_before: before?.status ?? null,
      status_after: (rest.status ?? before?.status) ?? null,
      admin_id: context.userId,
      note: 'Editada desde el panel',
    });
    return { ok: true as const };
  });

/** Elimina una cuenta del inventario. */
export const deleteStockAccount = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: before } = await supabaseAdmin
      .from('stock_accounts')
      .select('email, service, status')
      .eq('id', data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from('stock_accounts').delete().eq('id', data.id);
    if (error) return { ok: false as const, message: error.message };
    await supabaseAdmin.from('stock_movements').insert({
      account_email: before?.email ?? '',
      service: before?.service ?? '',
      action: 'deleted',
      status_before: before?.status ?? null,
      admin_id: context.userId,
      note: 'Eliminada desde el panel',
    });
    return { ok: true as const };
  });

/** Credenciales entregadas al cliente autenticado (solo las suyas). */
export const myStockAccounts = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data } = await supabaseAdmin
      .from('stock_accounts')
      .select('id, service, email, password, profile, pin, notes, expires_at, order_id, assigned_at')
      .eq('assigned_user_id', context.userId)
      .eq('status', 'sold')
      .order('assigned_at', { ascending: false })
      .limit(200);
    return { accounts: data ?? [] };
  });
