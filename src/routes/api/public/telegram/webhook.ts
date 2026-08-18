import { createFileRoute } from '@tanstack/react-router';
import {
  answerCallbackQuery,
  editMessageText,
  isAdminChat,
  safeEqual,
  sendTelegramMessage,
  telegramWebhookSecret,
  topupKeyboard,
} from '@/lib/telegram.server';
import { reviewTopupById } from '@/lib/topup-review.server';

const HELP = [
  '🤖 <b>Recargas NC — bot de administración</b>',
  '',
  '/pendientes — ver recargas de saldo pendientes',
  '/ayuda — ver estos comandos',
  '',
  'Cada solicitud nueva llega aquí con botones para <b>aprobar</b> o <b>rechazar</b>.',
].join('\n');

async function listPending(chatId: number | string) {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
  const { data, error } = await supabaseAdmin
    .from('topup_requests')
    .select('id, user_id, amount_nio, method_name, reference, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) {
    await sendTelegramMessage(chatId, `⚠️ Error al consultar: ${error.message}`);
    return;
  }
  if (!data || data.length === 0) {
    await sendTelegramMessage(chatId, '✅ No hay recargas pendientes.');
    return;
  }
  const ids = [...new Set(data.map((r) => r.user_id))];
  const { data: profiles } = await supabaseAdmin.from('profiles').select('id, email, full_name').in('id', ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p]));

  for (const r of data) {
    const p = byId.get(r.user_id);
    await sendTelegramMessage(
      chatId,
      [
        '💰 <b>Recarga pendiente</b>',
        `Cliente: ${p?.full_name || p?.email || r.user_id}`,
        `Monto: C$ ${Number(r.amount_nio)}`,
        `Método: ${r.method_name}`,
        `Referencia: ${r.reference || '—'}`,
      ].join('\n'),
      topupKeyboard(r.id),
    );
  }
}

export const Route = createFileRoute('/api/public/telegram/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!process.env['TELEGRAM_API_KEY']) return new Response('No configurado', { status: 503 });
        const expected = telegramWebhookSecret();
        const actual = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
        if (!safeEqual(actual, expected)) return new Response('Unauthorized', { status: 401 });

        const update = (await request.json()) as any;

        // --- Botones (aprobar / rechazar) ---
        const cb = update.callback_query;
        if (cb) {
          const chatId = cb.message?.chat?.id;
          if (!isAdminChat(chatId)) {
            await answerCallbackQuery(cb.id, 'No autorizado.');
            return Response.json({ ok: true });
          }
          const parts = String(cb.data ?? '').split(':');
          if (parts[0] !== 'tu' || !parts[2]) {
            await answerCallbackQuery(cb.id, 'Acción desconocida.');
            return Response.json({ ok: true });
          }
          const approve = parts[1] === 'a';
          try {
            const result = await reviewTopupById({
              topupId: parts[2],
              approve,
              reason: approve ? 'Aprobada desde Telegram.' : 'Rechazada desde Telegram.',
            });
            await answerCallbackQuery(cb.id, result.message);
            if (cb.message?.message_id) {
              const tag = result.alreadyProcessed
                ? '⚠️ Ya procesada'
                : result.approved
                  ? '✅ Aprobada'
                  : '❌ Rechazada';
              await editMessageText(
                chatId,
                cb.message.message_id,
                `${cb.message.text ?? ''}\n\n<b>${tag}</b>`,
              );
            }
          } catch (err) {
            await answerCallbackQuery(cb.id, 'Error al procesar.');
            console.error('Telegram review error', err);
          }
          return Response.json({ ok: true });
        }

        // --- Comandos ---
        const message = update.message ?? update.edited_message;
        const chatId = message?.chat?.id;
        const text = String(message?.text ?? '').trim().toLowerCase();
        if (!chatId || !text) return Response.json({ ok: true });
        if (!isAdminChat(chatId)) {
          await sendTelegramMessage(chatId, 'Este bot es solo para administración de Recargas NC.');
          return Response.json({ ok: true });
        }

        if (text.startsWith('/pendientes')) await listPending(chatId);
        else await sendTelegramMessage(chatId, HELP);

        return Response.json({ ok: true });
      },
    },
  },
});
