import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

type Ctx = { supabase: any; userId: string };
async function assertAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc('has_role', { _user_id: ctx.userId, _role: 'admin' });
  if (!data) throw new Error('Forbidden');
}

export const adminListPayments = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ status: z.enum(['payment_submitted', 'payment_review', 'payment_approved', 'payment_rejected', 'all']) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    let q = supabaseAdmin
      .from('topup_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (data.status !== 'all') q = q.eq('payment_status', data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const ids = [...new Set((rows ?? []).map((r) => r.user_id))];
    const { data: profs } = ids.length
      ? await supabaseAdmin.from('profiles').select('id, full_name, email').in('id', ids)
      : { data: [] };
    const pm = new Map((profs ?? []).map((p) => [p.id, p.full_name || p.email || '']));
    const out = [];
    for (const r of rows ?? []) {
      let receiptUrl = '';
      if (r.receipt_path) {
        const { data: s } = await supabaseAdmin.storage.from('receipts').createSignedUrl(r.receipt_path, 600);
        receiptUrl = s?.signedUrl ?? '';
      }
      out.push({ ...r, customer: pm.get(r.user_id) ?? '', receiptUrl });
    }
    return out;
  });

export const adminPaymentAudit = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ topupId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { data: rows, error } = await context.supabase
      .from('payment_audit')
      .select('step, detail, created_at')
      .eq('topup_id', data.topupId)
      .order('created_at');
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: { step: string; detail: unknown; created_at: string }) => ({
      step: r.step,
      detail: JSON.stringify(r.detail ?? null),
      created_at: r.created_at,
    }));
  });

export const adminFinances = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as Ctx);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const [{ data: orders }, { data: topups }, { data: expenses }] = await Promise.all([
      supabaseAdmin.from('orders').select('amount_nio, cost_nio, status, created_at').limit(10000),
      supabaseAdmin.from('topup_requests').select('amount_nio, payment_status, created_at').limit(10000),
      supabaseAdmin.from('expenses').select('*').order('spent_on', { ascending: false }).limit(500),
    ]);
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const done = (orders ?? []).filter((o) => o.status === 'completed' || o.status === 'provider_processing');
    const sum = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 100) / 100;
    const totalSold = sum(done.map((o) => Number(o.amount_nio)));
    const providerCost = sum(done.map((o) => Number(o.cost_nio ?? 0)));
    const totalReceived = sum((topups ?? []).filter((t) => t.payment_status === 'payment_approved').map((t) => Number(t.amount_nio)));
    const totalExpenses = sum((expenses ?? []).filter((e) => e.currency === 'NIO').map((e) => Number(e.amount)));
    const count = (s: string) => (topups ?? []).filter((t) => t.payment_status === s).length;
    return {
      totalSold,
      totalReceived,
      providerCost,
      grossProfit: sum([totalSold, -providerCost]),
      totalExpenses,
      netProfit: sum([totalSold, -providerCost, -totalExpenses]),
      salesToday: sum(done.filter((o) => o.created_at.startsWith(today)).map((o) => Number(o.amount_nio))),
      salesMonth: sum(done.filter((o) => o.created_at.startsWith(month)).map((o) => Number(o.amount_nio))),
      pending: count('payment_submitted') + count('payment_pending'),
      review: count('payment_review'),
      approved: count('payment_approved'),
      rejected: count('payment_rejected'),
      expenses: expenses ?? [],
    };
  });

export const adminAddExpense = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z
      .object({
        description: z.string().trim().min(1).max(200),
        category: z.string().trim().min(1).max(60),
        amount: z.number().nonnegative().max(100000000),
        currency: z.enum(['NIO', 'USD']),
        spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        note: z.string().max(500).default(''),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { error } = await context.supabase.from('expenses').insert({
      description: data.description,
      category: data.category,
      amount: data.amount,
      currency: data.currency,
      spent_on: data.spentOn,
      note: data.note,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteExpense = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as Ctx);
    const { error } = await context.supabase.from('expenses').delete().eq('id', data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
