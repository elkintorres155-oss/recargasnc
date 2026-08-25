/**
 * WhatsApp vía Twilio (gateway de conectores de Lovable).
 * Requiere: conexión Twilio enlazada (TWILIO_API_KEY + LOVABLE_API_KEY)
 * y el secreto TWILIO_WHATSAPP_FROM (ej: whatsapp:+14155238886 o +14155238886).
 */

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/twilio';

/** Normaliza un número nicaragüense a formato E.164. */
export function toWaNumber(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 8) return `+505${digits}`;
  return `+${digits}`;
}

function waChannel(raw: string): string {
  const v = (raw || '').trim();
  if (!v) return '';
  return v.startsWith('whatsapp:') ? v : `whatsapp:${v.startsWith('+') ? v : `+${v.replace(/\D/g, '')}`}`;
}

type SendResult = { sent: boolean; message: string; id?: string | undefined };

async function sendTwilioMessage(params: Record<string, string>): Promise<SendResult> {
  const lovableKey = process.env['LOVABLE_API_KEY'];
  const twilioKey = process.env['TWILIO_API_KEY'];
  const from = process.env['TWILIO_WHATSAPP_FROM'];
  if (!lovableKey || !twilioKey) return { sent: false, message: 'Twilio no está conectado.' };
  if (!from) return { sent: false, message: 'Falta configurar TWILIO_WHATSAPP_FROM.' };

  try {
    const res = await fetch(`${GATEWAY_URL}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        'X-Connection-Api-Key': twilioKey,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ From: waChannel(from), ...params }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`Twilio request failed [${res.status}]: ${text}`);
      return { sent: false, message: `Twilio (${res.status}): ${text.slice(0, 300)}` };
    }
    const json = JSON.parse(text) as { sid?: string };
    return { sent: true, message: 'Mensaje enviado por WhatsApp.', id: json.sid };
  } catch (e) {
    return { sent: false, message: e instanceof Error ? e.message : 'Error de red con Twilio.' };
  }
}

export type TopupDoneMessage = {
  phone: string;
  productName: string;
  packLabel: string;
  amountLabel: string;
  orderCode: string;
  playerId?: string;
  imageUrl?: string;
};

/** Aviso "tu recarga fue realizada correctamente" con la imagen del paquete. */
export async function sendTopupCompleted(input: TopupDoneMessage): Promise<SendResult> {
  const to = toWaNumber(input.phone);
  if (!to) return { sent: false, message: 'Número de teléfono inválido.' };

  const body =
    `✅ ¡Tu recarga fue realizada correctamente!\n\n` +
    `• Producto: ${input.productName}\n` +
    `• Paquete: ${input.packLabel}\n` +
    `• Total: ${input.amountLabel}\n` +
    (input.playerId ? `• ID de jugador: ${input.playerId}\n` : '') +
    `• Orden: ${input.orderCode}\n\n` +
    `¡Gracias por tu compra!`;

  const params: Record<string, string> = { To: waChannel(to), Body: body };
  if (input.imageUrl?.startsWith('http')) params['MediaUrl'] = input.imageUrl;

  const withMedia = await sendTwilioMessage(params);
  if (withMedia.sent || !params['MediaUrl']) return withMedia;

  // Si la imagen falla (URL no accesible), reintentamos solo con texto.
  return sendTwilioMessage({ To: waChannel(to), Body: body });
}
