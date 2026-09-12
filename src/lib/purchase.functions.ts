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
  .handler(async ({ data: input, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

    // El precio SIEMPRE se calcula en el servidor según el nivel del usuario.
    const { resolvePackPrice } = await import('./reseller.server');
    const official = await resolvePackPrice({
      userId,
      productId: input.productId,
      packId: input.packId,
    });
    const data = { ...input, amountNio: official.price ?? input.amountNio };

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

    // ── Entrega con inventario de cuentas (streaming) ──────────────────────
    const {
      getStockPackConfig,
      claimAccountForOrder,
      notifyAccountDelivered,
      notifyOutOfStock,
    } = await import('./stock-delivery.server');
    const stockCfg = await getStockPackConfig(data.productId, data.packId);

    if (stockCfg.requiresStock) {
      const account = await claimAccountForOrder({
        service: stockCfg.service,
        orderId: order.id,
        userId,
        productName: data.productName,
      });

      if (account) {
        await supabaseAdmin
          .from('orders')
          .update({ status: 'completed', status_reason: 'Cuenta entregada automáticamente.' })
          .eq('id', order.id);

        let customerEmail = '';
        try {
          const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(userId);
          customerEmail = authUser.user?.email ?? '';
        } catch {
          /* sin correo */
        }

        await notifyAccountDelivered({
          productName: data.productName,
          packLabel: data.packLabel,
          amountNio: data.amountNio,
          orderCode: order.order_code,
          account,
          customerEmail,
          customerPhone: data.customerPhone,
        });

        return {
          ok: true as const,
          orderCode: order.order_code,
          status: 'completed',
          message: 'Tu compra se realizó correctamente.',
          account: {
            service: account.service,
            email: account.email,
            password: account.password,
            profile: account.profile,
            pin: account.pin,
            notes: account.notes,
            expiresAt: account.expires_at,
          },
        };
      }

      await supabaseAdmin
        .from('orders')
        .update({
          status: 'payment_approved',
          status_reason: 'Sin stock disponible. Entrega manual pendiente.',
        })
        .eq('id', order.id);

      await notifyOutOfStock({
        productName: data.productName,
        packLabel: data.packLabel,
        service: stockCfg.service,
        orderCode: order.order_code,
        customerPhone: data.customerPhone,
      });

      return {
        ok: true as const,
        orderCode: order.order_code,
        status: 'payment_approved',
        message: 'Tu pedido está en proceso, te lo entregamos en breve.',
      };
    }

    const { getPackProviderConfig } = await import('./provider-config.server');
    const providerCfg = await getPackProviderConfig(data.productId, data.packId);

    const { dispatchToProvider } = await import('./fulfillment.server');
    const dispatch = await dispatchToProvider({
      orderId: order.id,
      productId: data.productId,
      packId: providerCfg.sku || data.packSku,
      playerId: data.playerId,
      provider: providerCfg.provider,
      fzrCategory: providerCfg.fzrCategory,
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
          status_reason: 'Recarga aceptada y en proceso por el proveedor.',
        })
        .eq('id', order.id);
      return {
        ok: true as const,
        orderCode: order.order_code,
        status: 'provider_processing',
        message: 'Tu recarga se realizó correctamente.',
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
        message: `No se pudo realizar la recarga y no pudimos devolver el saldo automáticamente. Contáctanos con el código ${order.order_code}.`,
      };
    }

    await supabaseAdmin
      .from('orders')
      .update({
        status: 'refunded',
        status_reason: `Pago cancelado y saldo reembolsado. Motivo: ${dispatch.message}`,
      })
      .eq('id', order.id);

    return {
      ok: false as const,
      insufficient: false as const,
      orderCode: order.order_code,
      message: 'No se pudo realizar la recarga. Tu pago fue cancelado y el saldo fue devuelto a tu billetera.',
    };
  });

