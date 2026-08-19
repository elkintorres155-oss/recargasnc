import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const createOrderSchema = z.object({
  productId: z.string().min(1).max(80),
  productName: z.string().min(1).max(120),
  packId: z.string().max(80).default(''),
  packLabel: z.string().max(120).default(''),
  packSku: z.string().max(120).default(''),
  playerId: z.string().max(80).default(''),
  amountNio: z.number().positive().max(500000),
  paymentMethodCode: z.string().max(60).default(''),
  customerName: z.string().max(120).default(''),
  customerPhone: z.string().max(40).default(''),
});

export const createOrder = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => createOrderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from('orders')
      .insert({
        user_id: userId,
        product_id: data.productId,
        product_name: data.productName,
        pack_id: data.packId,
        pack_label: data.packLabel,
        pack_sku: data.packSku,
        player_id: data.playerId,
        amount_nio: data.amountNio,
        payment_method_code: data.paymentMethodCode,
        customer_name: data.customerName,
        customer_phone: data.customerPhone,
        status: 'pending_payment' as const,
      })
      .select('id, order_code, amount_nio, status')
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const receiptSchema = z.object({
  orderId: z.string().uuid(),
  imageDataUrl: z
    .string()
    .regex(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/, 'Imagen inválida')
    .max(8_000_000),
});

export const submitReceipt = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => receiptSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, amount_nio, status, product_id, pack_id, pack_sku, player_id')
      .eq('id', data.orderId)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order) throw new Error('Orden no encontrada');
    if (order.status !== 'pending_payment' && order.status !== 'payment_rejected') {
      throw new Error('Esta orden ya tiene un comprobante en proceso.');
    }

    const { analyzeReceiptImage, judgeReceipt, dispatchToProvider } = await import(
      './fulfillment.server'
    );
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // Guardar la imagen en almacenamiento privado
    const [, base64 = ''] = data.imageDataUrl.split(',');
    const mime = data.imageDataUrl.slice(5, data.imageDataUrl.indexOf(';'));
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const path = `${userId}/${order.id}-${Date.now()}.${ext}`;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const { error: uploadError } = await supabaseAdmin.storage
      .from('receipts')
      .upload(path, bytes, { contentType: mime, upsert: false });
    if (uploadError) throw new Error(uploadError.message);

    const expected = Number(order.amount_nio);
    let verdict: 'approved' | 'review' | 'rejected' = 'review';
    let reason = '';
    let analysis: Awaited<ReturnType<typeof analyzeReceiptImage>> | null = null;

    try {
      analysis = await analyzeReceiptImage(data.imageDataUrl);
      const judged = judgeReceipt(analysis, expected);
      verdict = judged.verdict;
      reason = judged.reason;
    } catch (e) {
      verdict = 'review';
      reason = 'No se pudo analizar automáticamente; revisión manual.';
      console.error('[receipt-ai]', e);
    }

    // Anti-duplicado: misma referencia usada antes
    if (verdict === 'approved' && analysis?.reference) {
      const { data: dup } = await supabaseAdmin
        .from('payment_receipts')
        .select('id')
        .eq('detected_reference', analysis.reference)
        .neq('order_id', order.id)
        .limit(1);
      if (dup && dup.length > 0) {
        verdict = 'rejected';
        reason = 'Este comprobante ya fue usado en otra orden.';
      }
    }

    await supabaseAdmin.from('payment_receipts').insert({
      order_id: order.id,
      user_id: userId,
      storage_path: path,
      declared_amount_nio: expected,
      detected_amount_nio: analysis?.amount ?? null,
      detected_bank: analysis?.bank ?? null,
      detected_reference: analysis?.reference ?? null,
      detected_date: analysis?.date ?? null,
      confidence: analysis?.confidence ?? null,
      ai_verdict: verdict,
      ai_reason: reason,
      ai_raw: analysis as never,
    });

    let status:
      | 'receipt_review'
      | 'payment_rejected'
      | 'payment_approved'
      | 'provider_processing' = 'receipt_review';
    if (verdict === 'rejected') status = 'payment_rejected';
    if (verdict === 'approved') status = 'payment_approved';

    let providerMessage = '';
    if (verdict === 'approved') {
      const dispatch = await dispatchToProvider({
        orderId: order.id,
        productId: order.product_id,
        packId: order.pack_sku || '',
        playerId: order.player_id,
      });
      providerMessage = dispatch.message;
      if (dispatch.dispatched) status = 'provider_processing';
    }

    await supabaseAdmin
      .from('orders')
      .update({ status, status_reason: [reason, providerMessage].filter(Boolean).join(' ') })
      .eq('id', order.id);

    return { verdict, reason, status, providerMessage };
  });

export const getMyOrders = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from('orders')
      .select(
        'id, order_code, product_name, pack_label, player_id, amount_nio, status, status_reason, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getAdminOrders = createServerFn({ method: 'GET' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Forbidden');
    const { data, error } = await context.supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const statusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum([
    'pending_payment',
    'receipt_review',
    'payment_rejected',
    'payment_approved',
    'provider_processing',
    'completed',
    'failed',
    'refunded',
  ]),
  reason: z.string().max(300).default(''),
});

export const setOrderStatus = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => statusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc('has_role', {
      _user_id: context.userId,
      _role: 'admin',
    });
    if (!isAdmin) throw new Error('Forbidden');
    const { error } = await context.supabase
      .from('orders')
      .update({ status: data.status, status_reason: data.reason })
      .eq('id', data.orderId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
