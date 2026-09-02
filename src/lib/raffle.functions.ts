import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const PRIZE_NIO = 100;

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  });
  if (!isAdmin) throw new Error('Forbidden');
}

/** Lunes 00:00 (hora Nicaragua, UTC-6) de la semana actual y su fin. */
function weekRange() {
  const now = new Date();
  const ni = new Date(now.getTime() - 6 * 3600_000);
  const dow = (ni.getUTCDay() + 6) % 7; // 0 = lunes
  const startNi = Date.UTC(ni.getUTCFullYear(), ni.getUTCMonth(), ni.getUTCDate() - dow);
  const start = new Date(startNi + 6 * 3600_000); // vuelve a UTC real
  const end = new Date(start.getTime() + 7 * 24 * 3600_000);
  const iso = (d: Date) => new Date(d.getTime() - 6 * 3600_000).toISOString().slice(0, 10);
  return { start, end, weekStart: iso(start), weekEnd: iso(new Date(end.getTime() - 1)) };
}

export type Participant = {
  userId: string;
  name: string;
  email: string;
  orders: number;
  spent: number;
};

/** Compradores de la semana actual (una entrada por usuario). Solo administradores. */
export const listWeekBuyers = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { start, end, weekStart, weekEnd } = weekRange();

    const { data: orders, error } = await context.supabase
      .from('orders')
      .select('user_id, amount_nio, status, created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .in('status', ['completed', 'payment_approved', 'provider_processing']);
    if (error) throw new Error(error.message);

    const map = new Map<string, Participant>();
    for (const o of orders ?? []) {
      if (!o.user_id) continue;
      const cur = map.get(o.user_id) ?? {
        userId: o.user_id,
        name: '',
        email: '',
        orders: 0,
        spent: 0,
      };
      cur.orders += 1;
      cur.spent += Number(o.amount_nio ?? 0);
      map.set(o.user_id, cur);
    }

    const ids = [...map.keys()];
    if (ids.length) {
      const { data: profiles } = await context.supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', ids);
      for (const p of profiles ?? []) {
        const cur = map.get(p.id);
        if (cur) {
          cur.name = p.full_name ?? '';
          cur.email = p.email ?? '';
        }
      }
    }

    const { data: winner } = await context.supabase
      .from('raffle_winners')
      .select('*')
      .eq('week_start', weekStart)
      .maybeSingle();

    return {
      weekStart,
      weekEnd,
      prize: PRIZE_NIO,
      participants: [...map.values()].sort((a, b) => b.spent - a.spent),
      winner: winner ?? null,
    };
  });

/** Historial de ganadores. Solo administradores. */
export const listRaffleWinners = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from('raffle_winners')
      .select('*')
      .order('week_start', { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/**
 * Sortea al ganador de la semana entre los compradores y le acredita C$100 de saldo.
 * Una sola vez por semana (índice único por week_start).
 */
export const drawWeeklyWinner = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ force: z.boolean().default(false) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { start, end, weekStart, weekEnd } = weekRange();

    const { data: existing } = await context.supabase
      .from('raffle_winners')
      .select('*')
      .eq('week_start', weekStart)
      .maybeSingle();
    if (existing && !data.force) {
      return { alreadyDrawn: true as const, winner: existing };
    }
    if (existing) throw new Error('Ya hay un ganador para esta semana.');

    const { data: orders, error } = await context.supabase
      .from('orders')
      .select('user_id, status, created_at')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .in('status', ['completed', 'payment_approved', 'provider_processing']);
    if (error) throw new Error(error.message);

    const ids = [...new Set((orders ?? []).map((o: any) => o.user_id).filter(Boolean))] as string[];
    if (!ids.length) throw new Error('No hay compradores esta semana.');

    const winnerId = ids[Math.floor(Math.random() * ids.length)]!;

    const { data: profile } = await context.supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', winnerId)
      .maybeSingle();

    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { error: txError } = await supabaseAdmin.rpc('apply_wallet_transaction', {
      _user_id: winnerId,
      _type: 'bonus',
      _amount: PRIZE_NIO,
      _description: `Premio ruleta semanal (${weekStart} al ${weekEnd})`,
      _reference: `raffle:${weekStart}`,
      _created_by: context.userId,
    });
    if (txError) throw new Error(txError.message);

    const { data: saved, error: saveError } = await supabaseAdmin
      .from('raffle_winners')
      .insert({
        user_id: winnerId,
        email: profile?.email ?? '',
        full_name: profile?.full_name ?? '',
        amount_nio: PRIZE_NIO,
        week_start: weekStart,
        week_end: weekEnd,
        participants: ids.length,
        created_by: context.userId,
      })
      .select('*')
      .single();
    if (saveError) throw new Error(saveError.message);

    return { alreadyDrawn: false as const, winner: saved };
  });
