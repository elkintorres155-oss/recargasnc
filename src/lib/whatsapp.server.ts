/**
 * WhatsApp Cloud API (Meta) — envío de mensajes al cliente.
 * Requiere los secretos WHATSAPP_ACCESS_TOKEN y WHATSAPP_PHONE_NUMBER_ID.
 * Opcional: WHATSAPP_TEMPLATE_NAME / WHATSAPP_TEMPLATE_LANG para mensajes
 * fuera de la ventana de 24 horas.
 */

const GRAPH_VERSION = 'v21.0';

/** Normaliza un número nicaragüense a formato internacional sin "+". */
export function toWaNumber(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 8) return `505${digits}`;
  return digits;
}

type SendResult = { sent: boolean; message: string; id?: string | undefined };

async function callGraph(body: Record<string, unknown>): Promise<SendResult> {
  const token = process.env['WHATSAPP_ACCESS_TOKEN'];
  const phoneId = process.env['WHATSAPP_PHONE_NUMBER_ID'];
  if (!token || !phoneId) {
    return { sent: false, message: 'WhatsApp API no configurada.' };
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...body }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };
    if (!res.ok) {
      return {
        sent: false,
        message: `WhatsApp (${res.status}): ${json.error?.message ?? 'error desconocido'}`,
      };
    }
    return { sent: true, message: 'Mensaje enviado por WhatsApp.', id: json.messages?.[0]?.id };
  } catch (e) {
    return { sent: false, message: e instanceof Error ? e.message : 'Error de red con WhatsApp.' };
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

  const templateName = process.env['WHATSAPP_TEMPLATE_NAME'];
  if (templateName) {
    return callGraph({
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: process.env['WHATSAPP_TEMPLATE_LANG'] ?? 'es' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: input.productName },
              { type: 'text', text: input.packLabel },
              { type: 'text', text: input.amountLabel },
              { type: 'text', text: input.orderCode },
            ],
          },
        ],
      },
    });
  }

  const caption =
    `✅ ¡Tu recarga fue realizada correctamente!\n\n` +
    `• Producto: ${input.productName}\n` +
    `• Paquete: ${input.packLabel}\n` +
    `• Total: ${input.amountLabel}\n` +
    (input.playerId ? `• ID de jugador: ${input.playerId}\n` : '') +
    `• Orden: ${input.orderCode}\n\n` +
    `¡Gracias por tu compra!`;

  if (input.imageUrl?.startsWith('http')) {
    const withImage = await callGraph({
      to,
      type: 'image',
      image: { link: input.imageUrl, caption },
    });
    if (withImage.sent) return withImage;
  }

  return callGraph({ to, type: 'text', text: { body: caption, preview_url: false } });
}
