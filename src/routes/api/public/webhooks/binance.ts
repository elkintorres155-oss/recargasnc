import { createFileRoute } from '@tanstack/react-router';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Confirmación automática de pagos (Binance Pay o proveedor compatible).
 *
 * Arquitectura lista, SIN credenciales inventadas. Para activarla hay que
 * definir el secret `BINANCE_WEBHOOK_SECRET` y configurar en el proveedor
 * esta URL como webhook. El cuerpo esperado es JSON con, al menos:
 *   { "transactionId": "...", "amount": 100.5, "currency": "NIO", "reference": "<id de la solicitud de recarga>" }
 *
 * Flujo: verifica firma -> identifica la solicitud de recarga pendiente ->
 * comprueba el monto -> evita duplicados -> acredita el saldo y registra la transacción.
 */
export const Route = createFileRoute('/api/public/webhooks/binance')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env['BINANCE_WEBHOOK_SECRET'];
        if (!secret) {
          return new Response('Webhook no configurado', { status: 503 });
        }

        const body = await request.text();
        const signature = request.headers.get('x-signature') ?? '';
        const expected = createHmac('sha256', secret).update(body).digest('hex');
        const sig = Buffer.from(signature);
        const exp = Buffer.from(expected);
        if (sig.length !== exp.length || !timingSafeEqual(sig, exp)) {
          return new Response('Firma inválida', { status: 401 });
        }

        let payload: {
          transactionId?: string;
          amount?: number;
          currency?: string;
          reference?: string;
        };
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response('JSON inválido', { status: 400 });
        }

        const txId = String(payload.transactionId ?? '').trim();
        const reference = String(payload.reference ?? '').trim();
        const amount = Number(payload.amount ?? 0);
        if (!txId || !reference || !(amount > 0)) {
          return new Response('Datos incompletos', { status: 400 });
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

        // Idempotencia: la misma transacción no se acredita dos veces
        const { data: already } = await supabaseAdmin
          .from('topup_requests')
          .select('id')
          .eq('external_tx_id', txId)
          .limit(1);
        if (already && already.length > 0) {
          return new Response('ok (duplicado)', { status: 200 });
        }

        const { data: req } = await supabaseAdmin
          .from('topup_requests')
          .select('id, user_id, amount_nio, status')
          .eq('id', reference)
          .eq('status', 'pending')
          .maybeSingle();
        if (!req) return new Response('Solicitud no encontrada', { status: 404 });

        const expectedAmount = Number(req.amount_nio);
        if (Math.abs(expectedAmount - amount) > Math.max(expectedAmount * 0.01, 1)) {
          await supabaseAdmin
            .from('topup_requests')
            .update({
              status: 'pending',
              review_reason: `Monto recibido (${amount}) distinto al solicitado (${expectedAmount}). Requiere revisión manual.`,
              external_tx_id: txId,
            })
            .eq('id', req.id);
          return new Response('Monto no coincide', { status: 202 });
        }

        const { data: claimed } = await supabaseAdmin
          .from('topup_requests')
          .update({
            status: 'approved',
            external_tx_id: txId,
            auto_source: 'binance',
            reviewed_at: new Date().toISOString(),
            review_reason: 'Confirmado automáticamente por el proveedor de pagos.',
          })
          .eq('id', req.id)
          .eq('status', 'pending')
          .select('id')
          .maybeSingle();
        if (!claimed) return new Response('ok (ya procesada)', { status: 200 });

        const { error } = await supabaseAdmin.rpc('apply_wallet_transaction', {
          _user_id: req.user_id,
          _type: 'topup',
          _amount: expectedAmount,
          _description: 'Recarga automática Binance',
          _reference: txId,
          _topup_request_id: req.id,
        });
        if (error) {
          await supabaseAdmin
            .from('topup_requests')
            .update({ status: 'pending', review_reason: 'Error al acreditar, reintentar.' })
            .eq('id', req.id);
          return new Response('Error al acreditar', { status: 500 });
        }

        return new Response('ok', { status: 200 });
      },
    },
  },
});
