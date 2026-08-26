import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const purchaseSchema = z.object({
  productId: z.string().min(1).max(80),
  productName: z.string().min(1).max(120),
  packId: z.string().max(80).default(''),
  packLabel: z.string().max(120).default(''),
  packSku: z.string().max(120).default(''),
  playerId: z.string().max(80).default(''),
  customerPhone: z.string().trim().min(8, 'Número de teléfono inválido').max(20),
  amountNio: z.number().positive().max(500000),
  productImageUrl: z.string().max(500).default(''),
});

/**
 * Compra pagada con el saldo interno del usuario.
 * 1) valida el saldo en el servidor, 2) descuenta de forma atómica, 3) crea la orden,
 * 4) envía la recarga al proveedor y 5) reembolsa automáticamente si el proveedor falla.
 */
export const purchaseWithBalance = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => purchaseSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    const { data: wallet } = await supabaseAdmin
      .from('wallets')
      .select('balance_nio')
      .eq('user_id', userId)
      .maybeSingle();
    const balance = Number(wallet?.balance_nio ?? 0);
    if (balance < data.amountNio) {
      return {
        ok: false as const,
        insufficient: true as const,
        missing: Number((data.amountNio - balance).toFixed(2)),
        balance,
        message: 'Saldo insuficiente',
      };
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert({
        user_id: userId,
        product_id: data.productId,
        product_name: data.productName,
        pack_id: data.packId,
        pack_label: data.packLabel,
        pack_sku: data.packSku,
        player_id: data.playerId,
        customer_phone: data.customerPhone,
        amount_nio: data.amountNio,
        payment_method_code: 'balance',
        paid_with_balance: true,
        status: 'pending_payment' as const,
      })
      .select('id, order_code')
      .single();
    if (orderError) throw new Error(orderError.message);

    // Guardamos el teléfono en el perfil para autocompletarlo la próxima vez
    await supabaseAdmin.from('profiles').update({ phone: data.customerPhone }).eq('id', userId);


    // Descuento atómico (falla si el saldo bajó entre medio)
    const { error: debitError } = await supabaseAdmin.rpc('apply_wallet_transaction', {
      _user_id: userId,
      _type: 'purchase',
      _amount: -data.amountNio,
      _description: `${data.productName}${data.packLabel ? ` · ${data.packLabel}` : ''}`,
      _reference: order.order_code,
      _order_id: order.id,
      _created_by: userId,
    });
    if (debitError) {
      await supabaseAdmin
        .from('orders')
        .update({ status: 'failed', status_reason: 'No se pudo descontar el saldo.' })
        .eq('id', order.id);
      return {
        ok: false as const,
        insufficient: true as const,
        missing: Number((data.amountNio - balance).toFixed(2)),
        balance,
        message: 'Saldo insuficiente',
      };
    }

    await supabaseAdmin
      .from('orders')
      .update({ status: 'payment_approved', status_reason: 'Pagado con saldo interno.' })
      .eq('id', order.id);

    const { dispatchToProvider } = await import('./fulfillment.server');
    const dispatch = await dispatchToProvider({
      orderId: order.id,
      productId: data.productId,
      packId: data.packSku,
      playerId: data.playerId,
    });

    if (dispatch.dispatched) {
      // Factura de agradecimiento al correo del cliente (su Gmail registrado)
      let emailSent = false;
      let emailNote = 'Tu cuenta no tiene correo registrado.';
      try {
        const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
        const email = authUser.user?.email;
        if (email) {
          const { sendTemplateEmail } = await import('./email-templates/send-email');
          const res = await sendTemplateEmail('topup-receipt', email, {
            templateData: {
              orderCode: order.order_code,
              productName: data.productName,
              packLabel: data.packLabel,
              amountLabel: `C$${data.amountNio.toFixed(2)}`,
              playerId: data.playerId,
              phone: data.customerPhone,
              imageUrl: data.productImageUrl,
              date: new Date().toLocaleString('es-NI', { timeZone: 'America/Managua' }),
            },
            idempotencyKey: `topup-receipt-${order.id}`,
          });
          emailSent = res.sent;
          emailNote = res.sent
            ? 'Factura enviada a tu correo.'
            : 'No enviamos la factura porque te diste de baja de los correos.';
        }
      } catch (e) {
        console.error('Factura por correo falló:', e);
        emailNote = e instanceof Error ? e.message : 'No se pudo enviar la factura.';
      }

      await supabaseAdmin
        .from('orders')
        .update({
          status: 'provider_processing',
          provider_order_id: dispatch.providerOrderId,
          status_reason: dispatch.message,
        })
        .eq('id', order.id);
      return {
        ok: true as const,
        orderCode: order.order_code,
        status: 'provider_processing',
        message: dispatch.message,
        email: emailSent,
        emailMessage: emailNote,
      };
    }

    // El proveedor no procesó la recarga (rechazo, error, o configuración pendiente):
    // siempre devolvemos el saldo al cliente de forma automática.
    const { error: refundError } = await supabaseAdmin.rpc('apply_wallet_transaction', {
      _user_id: userId,
      _type: 'refund',
      _amount: data.amountNio,
      _description: `Reembolso automático · ${data.productName}`,
      _reference: order.order_code,
      _order_id: order.id,
      _created_by: userId,
    });

    if (refundError) {
      await supabaseAdmin
        .from('orders')
        .update({
          status: 'failed',
          status_reason: `${dispatch.message} No se pudo reembolsar automáticamente: ${refundError.message}`,
        })
        .eq('id', order.id);
      return {
        ok: false as const,
        insufficient: false as const,
        orderCode: order.order_code,
        message: `${dispatch.message} No pudimos devolver el saldo automáticamente, contáctanos con el código ${order.order_code}.`,
      };
    }

    await supabaseAdmin
      .from('orders')
      .update({ status: 'refunded', status_reason: `${dispatch.message} Saldo reembolsado.` })
      .eq('id', order.id);

    return {
      ok: false as const,
      insufficient: false as const,
      orderCode: order.order_code,
      message: `${dispatch.message} Te devolvimos el saldo.`,
    };
  });

