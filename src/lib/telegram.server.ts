const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

/**
 * Envía un aviso al chat de administración por Telegram.
 * Nunca lanza: una falla de notificación no debe romper el flujo del usuario.
 */
export async function notifyAdminTelegram(text: string): Promise<void> {
  try {
    const lovableKey = process.env['LOVABLE_API_KEY'];
    const telegramKey = process.env['TELEGRAM_API_KEY'];
    const chatId = process.env['TELEGRAM_ADMIN_CHAT_ID'];
    if (!lovableKey || !telegramKey || !chatId) return;

    const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': telegramKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) {
      console.error(`Telegram notify failed [${res.status}]: ${await res.text()}`);
      return;
    }
    const json = (await res.json()) as { ok?: boolean; description?: string };
    if (!json.ok) console.error(`Telegram notify error: ${json.description ?? 'unknown'}`);
  } catch (err) {
    console.error('Telegram notify exception', err);
  }
}
