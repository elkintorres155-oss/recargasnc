import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

/** Métodos de recarga soportados. Binance queda preparado para confirmación automática. */
export const TOPUP_METHODS = ['binance', 'bac', 'lafise', 'banpro'] as const;
export type TopupMethod = (typeof TOPUP_METHODS)[number];

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc('has_role', {
    _user_id: context.userId,
    _role: 'admin',
  });
  if (!isAdmin) throw new Error('Forbidden');
}

/** Saldo + totales del usuario autenticado. */
export const getMyWallet = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from('wallets')
      .select('balance_nio, total_topped_up_nio, total_spent_nio')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      balance: Number(data?.balance_nio ?? 0),
      toppedUp: Number(data?.total_topped_up_nio ?? 0),
      spent: Number(data?.total_spent_nio ?? 0),
    };
  });

/** Historial de movimientos del usuario autenticado. */
export const getMyTransactions = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('wallet_transactions')
      .select('id, type, amount_nio, balance_before, balance_after, description, reference, status, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Solicitudes de recarga del usuario autenticado. */
export const getMyTopups = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('topup_requests')
      .select('id, method_name, method_code, amount_nio, reference, status, review_reason, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Duración del código de nota que el cliente debe escribir en el concepto del pago. */
export const TOPUP_CODE_TTL_MS = 5 * 60 * 1000;

function randomCode() {
  const letters = 'abcdefghijkmnpqrstuvwxyz';
  let out = '';
  for (let i = 0; i < 6; i++) out += letters[Math.floor(Math.random() * letters.length)];
  return out;
}

/**
 * Devuelve el código de nota vigente del usuario (o genera uno nuevo de 6 letras
 * con 5 minutos de validez). El cliente debe escribirlo en el concepto del pago
 * y la IA lo lee en el comprobante para acreditar el saldo automáticamente.
 */
export const getTopupCode = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ force: z.boolean().default(false) }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const nowIso = new Date().toISOString();

    if (!data.force) {
      const { data: active } = await supabaseAdmin
        .from('topup_codes')
        .select('code, expires_at')
        .eq('user_id', userId)
        .is('used_at', null)
        .gt('expires_at', nowIso)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (active) return { code: active.code, expiresAt: active.expires_at };
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = randomCode();
      const expiresAt = new Date(Date.now() + TOPUP_CODE_TTL_MS).toISOString();
      const { data: row, error } = await supabaseAdmin
        .from('topup_codes')
        .insert({ user_id: userId, code, expires_at: expiresAt })
        .select('code, expires_at')
        .maybeSingle();
      if (!error && row) return { code: row.code, expiresAt: row.expires_at };
    }
    throw new Error('No se pudo generar el código, intenta de nuevo.');
  });

const topupSchema = z.object({
  method: z.enum(TOPUP_METHODS),
  methodName: z.string().max(60).default(''),
  amountNio: z.number().positive().max(500000),
  reference: z.string().max(120).default(''),
  noteCode: z.string().max(16).default(''),
  imageDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/, 'Imagen inválida')
    .max(8_000_000)
    .optional(),
});


/**
 * Crea una solicitud de recarga de saldo (pago manual: BAC / LAFISE / BANPRO / Binance manual).
 * El saldo NO se acredita aquí: queda PENDIENTE hasta que un administrador la apruebe
 * (o hasta que llegue la confirmación automática del proveedor de pagos).
 */
export const createTopupRequest = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => topupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    if (data.reference.trim()) {
      const { data: dup } = await supabaseAdmin
        .from('topup_requests')
        .select('id')
        .eq('status', 'approved')
        .ilike('reference', data.reference.trim())
        .limit(1);
      if (dup && dup.length > 0) {
        throw new Error('Esa referencia de pago ya fue acreditada anteriormente.');
      }
    }

    let receiptPath = '';
    if (data.imageDataUrl) {
      const [, base64 = ''] = data.imageDataUrl.split(',');
      const mime = data.imageDataUrl.slice(5, data.imageDataUrl.indexOf(';'));
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      receiptPath = `${userId}/topup-${Date.now()}.${ext}`;
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const { error: uploadError } = await supabaseAdmin.storage
        .from('receipts')
        .upload(receiptPath, bytes, { contentType: mime, upsert: false });
      if (uploadError) throw new Error(uploadError.message);
    }

    // Código de nota vigente del usuario (5 minutos). La IA debe leerlo en el comprobante.
    const noteCode = data.noteCode.trim().toLowerCase();
    const { data: codeRow } = noteCode
      ? await supabaseAdmin
          .from('topup_codes')
          .select('id, code, expires_at, used_at')
          .eq('user_id', userId)
          .ilike('code', noteCode)
          .maybeSingle()
      : { data: null };
    const codeValid =
      !!codeRow && !codeRow.used_at && new Date(codeRow.expires_at).getTime() > Date.now();

    // La IA lee el comprobante y extrae REFERENCIA, monto, banco, fecha y el código de nota.
    let ai: {
      reference: string;
      amount: number | null;
      bank: string;
      date: string;
      noteCode: string;
      confidence: number;
      verdict: string;
      notes: string;
    } = {
      reference: '',
      amount: null,
      bank: '',
      date: '',
      noteCode: '',
      confidence: 0,
      verdict: 'pending',
      notes: '',
    };

    if (data.imageDataUrl) {
      try {
        const { analyzeReceiptImage, judgeReceipt } = await import('@/lib/fulfillment.server');
        const analysis = await analyzeReceiptImage(data.imageDataUrl);
        const judged = judgeReceipt(analysis, data.amountNio);
        ai = {
          reference: analysis.reference ?? '',
          amount: analysis.amount,
          bank: analysis.bank ?? '',
          date: analysis.date ?? '',
          noteCode: (analysis.note_code ?? '').replace(/[^a-z0-9]/gi, '').toLowerCase(),
          confidence: analysis.confidence,
          verdict: judged.verdict,
          notes: judged.reason || analysis.notes,
        };
      } catch (e) {
        console.error('[topup-receipt-ai]', e);
        ai.verdict = 'error';
        ai.notes = 'No se pudo analizar el comprobante automáticamente.';
      }
    }


    // Detecta referencias repetidas también cuando el cliente no la escribió.
    const detectedRef = (data.reference.trim() || ai.reference).trim();
    if (detectedRef) {
      const { data: dupAi } = await supabaseAdmin
        .from('topup_requests')
        .select('id')
        .eq('status', 'approved')
        .or(`reference.ilike.${detectedRef},ai_reference.ilike.${detectedRef}`)
        .limit(1);
      if (dupAi && dupAi.length > 0) {
        throw new Error('Esa referencia de pago ya fue acreditada anteriormente.');
      }
    }

    // El saldo a acreditar es SIEMPRE el monto real leído en el comprobante.
    // Si el cliente escribió 100 pero pagó 35, se acreditan 35.
    const detectedAmount =
      ai.amount != null && ai.amount > 0 && ai.confidence >= 0.5 ? Number(ai.amount) : null;
    const effectiveAmount = detectedAmount ?? data.amountNio;
    const amountMismatch =
      detectedAmount != null && Math.abs(detectedAmount - data.amountNio) >= 0.01;

    const codeMatch = codeValid && !!ai.noteCode && ai.noteCode === noteCode;
    // Acreditación automática: la IA confía ≥90%, aprueba el comprobante
    // y el código de nota vigente coincide con el que aparece en la imagen.
    const autoApprove = ai.verdict === 'approved' && ai.confidence >= 0.9 && codeMatch;

    const { data: row, error } = await supabaseAdmin
      .from('topup_requests')
      .insert({
        user_id: userId,
        method_code: data.method,
        method_name: data.methodName || data.method.toUpperCase(),
        amount_nio: effectiveAmount,
        reference: data.reference.trim(),
        receipt_path: receiptPath,
        status: 'pending' as const,
        note_code: noteCode,
        ai_note_code: ai.noteCode,
        ai_reference: ai.reference,
        ai_amount_nio: ai.amount,
        ai_bank: ai.bank,
        ai_date: ai.date,
        ai_confidence: ai.confidence,
        ai_verdict: ai.verdict,
        ai_notes: [
          amountMismatch
            ? `Monto ajustado al comprobante: el cliente declaró C$ ${data.amountNio} y se acreditarán C$ ${effectiveAmount}.`
            : '',
          !codeValid && noteCode ? 'El código de nota venció o ya fue usado.' : '',
          codeValid && ai.noteCode && !codeMatch
            ? `El código leído (${ai.noteCode}) no coincide con el generado (${noteCode}).`
            : '',
          ai.notes,
        ]
          .filter(Boolean)
          .join(' ')
          .trim(),
      })
      .select('id, status, amount_nio')
      .single();
    if (error) throw new Error(error.message);

    let autoApproved = false;
    if (autoApprove && codeRow) {
      // Consume el código (evita reutilizarlo con otro comprobante).
      const { data: usedCode } = await supabaseAdmin
        .from('topup_codes')
        .update({ used_at: new Date().toISOString() })
        .eq('id', codeRow.id)
        .is('used_at', null)
        .select('id')
        .maybeSingle();
      if (usedCode) {
        try {
          const { reviewTopupById } = await import('@/lib/topup-review.server');
          const result = await reviewTopupById({
            topupId: row.id,
            approve: true,
            reason: `Aprobada automáticamente por la IA (${Math.round(ai.confidence * 100)}% de confianza, código ${noteCode}).`,
          });
          autoApproved = result.approved;
          if (autoApproved) {
            await supabaseAdmin
              .from('topup_requests')
              .update({ auto_approved: true, auto_source: 'ai' })
              .eq('id', row.id);
          }
        } catch (e) {
          console.error('[topup-auto-approve]', e);
        }
      }
    }

    const { notifyAdminTelegram, topupKeyboard } = await import('@/lib/telegram.server');
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle();
    await notifyAdminTelegram(
      [
        autoApproved
          ? '✅ <b>Recarga acreditada automáticamente por la IA</b>'
          : '💰 <b>Nueva solicitud de recarga de saldo</b>',
        `Cliente: ${prof?.full_name || prof?.email || userId}`,
        `Monto a acreditar: C$ ${effectiveAmount}${amountMismatch ? ` (el cliente declaró C$ ${data.amountNio})` : ''}`,
        `Método: ${data.methodName || data.method.toUpperCase()}`,
        `Referencia: ${data.reference.trim() || '—'}`,
        `Código de nota: ${noteCode || '—'} · Leído por la IA: ${ai.noteCode || '—'}`,
        `Comprobante: ${receiptPath ? 'sí' : 'no'}`,
        ...(receiptPath
          ? [
              '',
              '🤖 <b>Lectura IA del comprobante</b>',
              `Referencia detectada: ${ai.reference || '—'}`,
              `Monto detectado: ${ai.amount != null ? `C$ ${ai.amount}` : '—'}`,
              `Banco: ${ai.bank || '—'} · Fecha: ${ai.date || '—'}`,
              `Confianza: ${Math.round(ai.confidence * 100)}% · Veredicto: ${ai.verdict}`,
              ai.notes ? `Nota: ${ai.notes}` : '',
            ].filter(Boolean)
          : []),
        '',
        autoApproved
          ? 'El saldo ya fue acreditado, no requiere acción.'
          : 'Apruébala o recházala aquí mismo con los botones.',
      ].join('\n'),
      autoApproved ? undefined : topupKeyboard(row.id),
    );

    return { ...row, autoApproved, status: autoApproved ? 'approved' : row.status };

  });

/* ------------------------------- ADMIN ------------------------------- */

/** Recargas pendientes/recientes para el panel de administración. */
export const adminListTopups = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data, error } = await supabaseAdmin
      .from('topup_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const ids = [...new Set((data ?? []).map((r) => r.user_id))];
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')
      .in('id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

    return await Promise.all(
      (data ?? []).map(async (r) => {
        let receiptUrl: string | null = null;
        if (r.receipt_path) {
          const { data: signed } = await supabaseAdmin.storage
            .from('receipts')
            .createSignedUrl(r.receipt_path, 600);
          receiptUrl = signed?.signedUrl ?? null;
        }
        const p = byId.get(r.user_id);
        return {
          ...r,
          amount_nio: Number(r.amount_nio),
          email: p?.email ?? '',
          fullName: p?.full_name ?? '',
          receiptUrl,
        };
      }),
    );
  });

const reviewSchema = z.object({
  topupId: z.string().uuid(),
  approve: z.boolean(),
  reason: z.string().max(300).default(''),
});

/** Aprueba o rechaza una recarga. Al aprobar acredita el saldo de forma atómica. */
export const adminReviewTopup = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { reviewTopupById } = await import('@/lib/topup-review.server');
    return await reviewTopupById({
      topupId: data.topupId,
      approve: data.approve,
      reason: data.reason,
      reviewerId: context.userId,
    });
  });

/** Busca usuarios por correo o nombre y devuelve su saldo. */
export const adminSearchWallets = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ q: z.string().max(120).default('') }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    let query = supabaseAdmin.from('profiles').select('id, email, full_name').limit(25);
    if (data.q.trim()) query = query.or(`email.ilike.%${data.q.trim()}%,full_name.ilike.%${data.q.trim()}%`);
    const { data: profiles, error } = await query;
    if (error) throw new Error(error.message);

    const ids = (profiles ?? []).map((p) => p.id);
    const { data: wallets } = await supabaseAdmin
      .from('wallets')
      .select('user_id, balance_nio, total_topped_up_nio, total_spent_nio')
      .in('user_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    const byId = new Map((wallets ?? []).map((w) => [w.user_id, w]));

    return (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email ?? '',
      fullName: p.full_name ?? '',
      balance: Number(byId.get(p.id)?.balance_nio ?? 0),
      toppedUp: Number(byId.get(p.id)?.total_topped_up_nio ?? 0),
      spent: Number(byId.get(p.id)?.total_spent_nio ?? 0),
    }));
  });

/** Historial de movimientos de un usuario (admin). */
export const adminUserTransactions = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: rows, error } = await supabaseAdmin
      .from('wallet_transactions')
      .select('id, type, amount_nio, balance_after, description, created_at')
      .eq('user_id', data.userId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const adjustSchema = z.object({
  userId: z.string().uuid(),
  amountNio: z.number().min(-500000).max(500000).refine((n) => n !== 0, 'El monto no puede ser cero'),
  reason: z.string().min(3, 'Escribe el motivo del ajuste').max(300),
  type: z.enum(['adjustment', 'bonus', 'refund']).default('adjustment'),
});

/** Ajuste manual de saldo hecho por un administrador (queda registrado en el historial). */
export const adminAdjustBalance = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => adjustSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.rpc('apply_wallet_transaction', {
      _user_id: data.userId,
      _type: data.type,
      _amount: data.amountNio,
      _description: `${data.type === 'bonus' ? 'Bonificación' : data.type === 'refund' ? 'Reembolso' : 'Ajuste manual'}: ${data.reason}`,
      _reference: `admin:${context.userId}`,
      _created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
