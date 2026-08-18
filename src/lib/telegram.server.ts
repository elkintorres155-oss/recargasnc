import { createHash, timingSafeEqual } from 'crypto';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

type InlineKeyboard = { text: string; callback_data: string }[][];

async function callTelegram(method: string, body: Record<string, unknown>): Promise<any | null> {
  try {
    const lovableKey = process.env['LOVABLE_API_KEY'];
    const telegramKey = process.env['TELEGRAM_API_KEY'];
    if (!lovableKey || !telegramKey) return null;

    const res = await fetch(`${GATEWAY_URL}/${method}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': telegramKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`Telegram ${method} failed [${res.status}]: ${await res.text()}`);
      return null;
    }
    const json = (await res.json()) as { ok?: boolean; description?: string };
    if (!json.ok) console.error(`Telegram ${method} error: ${json.description ?? 'unknown'}`);
    return json;
  } catch (err) {
    console.error(`Telegram ${method} exception`, err);
    return null;
  }
}

/** Secreto derivado para validar que el webhook viene de Telegram. */
export function telegramWebhookSecret(): string {
  const key = process.env['TELEGRAM_API_KEY'] ?? '';
  return createHash('sha256').update(`telegram-webhook:${key}`).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** ¿Este chat es el chat de administración autorizado? */
export function isAdminChat(chatId: number | string | undefined): boolean {
  const admin = process.env['TELEGRAM_ADMIN_CHAT_ID'];
  return !!admin && String(chatId) === String(admin);
}

/**
 * Envía un aviso al chat de administración por Telegram.
 * Nunca lanza: una falla de notificación no debe romper el flujo del usuario.
 */
export async function notifyAdminTelegram(text: string, keyboard?: InlineKeyboard): Promise<void> {
  const chatId = process.env['TELEGRAM_ADMIN_CHAT_ID'];
  if (!chatId) return;
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export async function sendTelegramMessage(
  chatId: number | string,
  text: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  await callTelegram('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  });
}

export async function answerCallbackQuery(id: string, text: string): Promise<void> {
  await callTelegram('answerCallbackQuery', { callback_query_id: id, text, show_alert: false });
}

export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
): Promise<void> {
  await callTelegram('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
  });
}

/** Botones de aprobar/rechazar para una solicitud de recarga. */
export function topupKeyboard(topupId: string): InlineKeyboard {
  return [
    [
      { text: '✅ Aprobar', callback_data: `tu:a:${topupId}` },
      { text: '❌ Rechazar', callback_data: `tu:r:${topupId}` },
    ],
  ];
}
