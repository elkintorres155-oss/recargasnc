// Server-only helpers: análisis de comprobantes con IA y despacho al proveedor.

export type ReceiptAnalysis = {
  is_receipt: boolean;
  amount: number | null;
  currency: string | null;
  bank: string | null;
  reference: string | null;
  date: string | null;
  confidence: number;
  notes: string;
};

const SYSTEM_PROMPT = `Eres un verificador de comprobantes de pago bancarios de Nicaragua
(LAFISE, BAC, BANPRO, Billetera Móvil, Binance Pay). Analiza la imagen y responde SOLO con JSON válido:
{"is_receipt":boolean,"amount":number|null,"currency":"NIO"|"USD"|null,"bank":string|null,
"reference":string|null,"date":string|null,"confidence":number,"notes":string}
- amount es el monto transferido en números (sin símbolos).
- confidence entre 0 y 1 según qué tan legible y auténtico se ve el comprobante.
- Si la imagen está editada, borrosa, o no es un comprobante, is_receipt=false y explica en notes.`;

export async function analyzeReceiptImage(imageDataUrl: string): Promise<ReceiptAnalysis> {
  const apiKey = process.env['LOVABLE_API_KEY'];
  if (!apiKey) throw new Error('Falta LOVABLE_API_KEY');

  const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analiza este comprobante y devuelve solo el JSON.' },
            { type: 'image_url', image_url: { url: imageDataUrl } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = json.choices?.[0]?.message?.content ?? '';
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('La IA no devolvió un resultado legible');
  const parsed = JSON.parse(match[0]) as Partial<ReceiptAnalysis>;

  return {
    is_receipt: Boolean(parsed.is_receipt),
    amount: typeof parsed.amount === 'number' ? parsed.amount : null,
    currency: parsed.currency ?? null,
    bank: parsed.bank ?? null,
    reference: parsed.reference ?? null,
    date: parsed.date ?? null,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    notes: parsed.notes ?? '',
  };
}

export type Verdict = {
  verdict: 'approved' | 'review' | 'rejected';
  reason: string;
};

/** Reglas anti-fraude: rechaza montos con diferencias grandes. */
export function judgeReceipt(analysis: ReceiptAnalysis, expected: number): Verdict {
  if (!analysis.is_receipt) {
    return { verdict: 'rejected', reason: analysis.notes || 'La imagen no parece un comprobante de pago.' };
  }
  if (analysis.amount == null) {
    return { verdict: 'review', reason: 'No se pudo leer el monto del comprobante.' };
  }
  if (analysis.currency === 'USD') {
    return { verdict: 'review', reason: 'El comprobante está en dólares; requiere revisión manual.' };
  }
  if (analysis.confidence < 0.6) {
    return { verdict: 'review', reason: 'La imagen es poco legible; requiere revisión manual.' };
  }

  const tolerance = Math.max(5, expected * 0.01);
  const diff = analysis.amount - expected;

  if (diff < -tolerance) {
    return {
      verdict: 'rejected',
      reason: `El monto pagado (C$ ${analysis.amount}) es menor al total de la orden (C$ ${expected}).`,
    };
  }
  if (diff > Math.max(50, expected * 0.2)) {
    return {
      verdict: 'review',
      reason: `El monto pagado (C$ ${analysis.amount}) es muy superior al total (C$ ${expected}). Revisión manual.`,
    };
  }
  return { verdict: 'approved', reason: 'Pago verificado automáticamente.' };
}

/**
 * Despacho al proveedor de recargas (FlashTopUp, reseller v2, firma HMAC-SHA256).
 * Payload documentado: reference_id + service_code + product_type + quantity
 * más los campos del producto (user_id, y server_id cuando aplica).
 * El `service_code` sale del SKU configurado en el panel de administración.
 */
export async function dispatchToProvider(input: {
  orderId: string;
  productId: string;
  packId: string;
  playerId: string;
  serverId?: string;
}): Promise<{ dispatched: boolean; providerOrderId: string | null; message: string }> {
  const { getCredentials, signedRequest } = await import('./flashtopup.server');
  const creds = getCredentials();
  const orderPath = process.env['TOPUP_PROVIDER_ORDER_PATH'];

  if (!creds) {
    return {
      dispatched: false,
      providerOrderId: null,
      message: 'Proveedor de recargas aún no configurado: la recarga se procesará manualmente.',
    };
  }
  if (!orderPath) {
    return {
      dispatched: false,
      providerOrderId: null,
      message:
        'Credenciales del proveedor listas; falta el endpoint de recarga y el código de producto. Se procesará manualmente.',
    };
  }

  // El SKU del paquete debe ser el service_code exacto de GET /services.
  const serviceCode = (input.packId || '').trim();
  if (!serviceCode) {
    return {
      dispatched: false,
      providerOrderId: null,
      message:
        'Este paquete todavía no tiene el código del proveedor (SKU) configurado. Se procesará manualmente.',
    };
  }

  // playerId puede venir como "usuario|servidor" o "usuario (servidor)".
  const rawPlayer = (input.playerId || '').trim();
  const split = rawPlayer.match(/^(.+?)\s*[|(]\s*([A-Za-z0-9._-]{1,64})\s*\)?$/);
  const userId = split ? split[1]!.trim() : rawPlayer;
  const serverId = (input.serverId || split?.[2] || '').trim();

  try {
    const res = await signedRequest(orderPath, {
      reference_id: input.orderId,
      service_code: serviceCode,
      product_type: 'topup',
      quantity: 1,
      user_id: userId,
      ...(serverId ? { server_id: serverId } : {}),
    });
    const body = res.body as {
      data?: { order_id?: string; order_status?: string };
      order_id?: string;
      order_status?: string;
      status?: string;
      success?: boolean;
      message?: string;
      error?: { message?: unknown; errors?: Array<{ message?: string }> };
    };
    const providerOrderId = body?.data?.order_id ?? body?.order_id ?? null;
    const rawStatus = (body?.data?.order_status ?? body?.order_status ?? body?.status ?? '')
      .toString()
      .toLowerCase();
    // Nunca declarar éxito si el proveedor reporta fallo, aunque responda HTTP 200.
    const providerFailed =
      ['failed', 'rejected', 'cancelled', 'canceled', 'error'].includes(rawStatus) ||
      body?.success === false;
    if (!res.ok || providerFailed) {
      const fieldErrors = Array.isArray(body?.error?.errors)
        ? body.error!.errors!.map((e) => e.message).filter(Boolean).join(' ')
        : '';
      const providerError =
        fieldErrors ||
        (typeof body?.error?.message === 'string'
          ? body.error.message
          : typeof body?.message === 'string'
            ? body.message
            : '');
      console.warn('[flashtopup] provider rejected order', {
        status: res.status,
        body: res.body,
        serviceCode,
      });
      return {
        dispatched: false,
        providerOrderId: null,
        message: `El proveedor rechazó la recarga (${res.status})${providerError ? `: ${providerError}` : ''}. Se procesará manualmente.`,
      };
    }

    return {
      dispatched: true,
      providerOrderId,
      message: 'Recarga enviada al proveedor.',
    };
  } catch (e) {
    console.error('[flashtopup]', e);
    return {
      dispatched: false,
      providerOrderId: null,
      message: 'No se pudo contactar al proveedor; se procesará manualmente.',
    };
  }
}

