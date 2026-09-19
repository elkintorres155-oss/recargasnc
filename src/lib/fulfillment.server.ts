// Server-only helpers: análisis de comprobantes con IA y despacho al proveedor.

export type ReceiptAnalysis = {
  is_receipt: boolean;
  amount: number | null;
  currency: string | null;
  bank: string | null;
  reference: string | null;
  date: string | null;
  note_code: string | null;
  confidence: number;
  notes: string;
};

const SYSTEM_PROMPT = `Eres un verificador de comprobantes de pago bancarios de Nicaragua
(LAFISE, BAC, BANPRO, Billetera Móvil, Binance Pay). Analiza la imagen y responde SOLO con JSON válido:
{"is_receipt":boolean,"amount":number|null,"currency":"NIO"|"USD"|null,"bank":string|null,
"reference":string|null,"date":string|null,"note_code":string|null,"confidence":number,"notes":string}
- amount es el monto transferido en números (sin símbolos).
- note_code es el código corto de 6 letras que el cliente escribió en el concepto/nota/descripción
  del pago (ej: "xyuadz"). Devuélvelo en minúsculas y sin espacios; null si no aparece.
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
    note_code: typeof parsed.note_code === 'string' ? parsed.note_code.trim().toLowerCase() : null,

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
  /** Proveedor elegido para este paquete. */
  provider?: 'flashtopup' | 'fzr' | 'wdg' | 'gamerhub';
  /** category_id de FZR (solo proveedor secundario). */
  fzrCategory?: string;
  /** product_code de GamerHub (ej. freefire-latam). */
  gamerhubProduct?: string;
}): Promise<{
  dispatched: boolean;
  providerOrderId: string | null;
  message: string;
  redeemCode?: string | null;
}> {
  if (input.provider === 'fzr') return dispatchToFzr(input);
  if (input.provider === 'wdg') return dispatchToWdg(input);
  if (input.provider === 'gamerhub') return dispatchToGamerHub(input);
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
        message: `El proveedor rechazó la recarga (${res.status})${providerError ? `: ${providerError}` : ''}`,
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


/**
 * Despacho al tercer proveedor (WDG): POST /purchase con
 * product_id numérico (el SKU del paquete) + player_id.
 */
async function dispatchToWdg(input: {
  orderId: string;
  packId: string;
  playerId: string;
}): Promise<{
  dispatched: boolean;
  providerOrderId: string | null;
  message: string;
  redeemCode?: string | null;
}> {
  const { getWdgCredentials, wdgPurchase } = await import('./wdg.server');

  if (!getWdgCredentials()) {
    return {
      dispatched: false,
      providerOrderId: null,
      message: 'Proveedor 3 (WDG) no configurado. Se procesará manualmente.',
    };
  }

  const productId = Number((input.packId || '').trim());
  if (!Number.isFinite(productId) || productId <= 0) {
    return {
      dispatched: false,
      providerOrderId: null,
      message:
        'Este paquete no tiene el código numérico del proveedor 3 (WDG) configurado. Se procesará manualmente.',
    };
  }

  const rawPlayer = (input.playerId || '').trim();
  const split = rawPlayer.match(/^(.+?)\s*[|(]\s*([A-Za-z0-9._-]{1,64})\s*\)?$/);
  const userId = split ? split[1]!.trim() : rawPlayer;

  try {
    const res = await wdgPurchase({
      product_id: productId,
      player_id: userId,
      idempotencyKey: input.orderId,
    });
    const body = res.body as {
      success?: boolean;
      data?: {
        order_id?: string | number;
        id?: string | number;
        status?: string;
        code?: string;
        codes?: unknown;
        redeem_code?: string;
        pin?: string;
        serial?: string;
        voucher?: string;
        credentials?: unknown;
      };
      order_id?: string | number;
      status?: string;
      code?: string;
      error?: { code?: string; message?: string };
      message?: string;
    };
    const providerOrderIdRaw =
      body?.data?.order_id ?? body?.data?.id ?? body?.order_id ?? null;
    const providerOrderId = providerOrderIdRaw != null ? String(providerOrderIdRaw) : null;
    const status = String(body?.data?.status ?? body?.status ?? '').toLowerCase();
    const failed =
      body?.success === false ||
      ['failed', 'rejected', 'cancelled', 'canceled', 'error'].includes(status);

    if (!res.ok || failed) {
      console.warn('[wdg] provider rejected order', { status: res.status, body: res.body });
      const detail = body?.error?.message ?? body?.message ?? '';
      return {
        dispatched: false,
        providerOrderId: null,
        message: `El proveedor rechazó la recarga (${res.status})${detail ? `: ${detail}` : ''}`,
      };
    }

    // Algunos productos (ej. Robux) se entregan como código canjeable.
    const d = body?.data ?? {};
    const fromList = Array.isArray(d.codes)
      ? d.codes
          .map((c) =>
            typeof c === 'string'
              ? c
              : typeof (c as { code?: string })?.code === 'string'
                ? (c as { code: string }).code
                : '',
          )
          .filter(Boolean)
          .join('\n')
      : '';
    const redeemCode =
      (d.redeem_code ?? d.code ?? d.voucher ?? d.serial ?? d.pin ?? fromList ?? '') || null;

    return {
      dispatched: true,
      providerOrderId,
      redeemCode,
      message: 'Recarga enviada al proveedor.',
    };
  } catch (e) {
    console.error('[wdg]', e);
    return {
      dispatched: false,
      providerOrderId: null,
      message: 'No se pudo contactar al proveedor; se procesará manualmente.',
    };
  }
}

/**
 * Despacho al proveedor secundario (FZR): POST /topups/order con
 * category_id + offer_id + los campos que pide la categoría (player_id/user_id/server_id).
 */
async function dispatchToFzr(input: {
  orderId: string;
  packId: string;
  playerId: string;
  serverId?: string;
  fzrCategory?: string;
}): Promise<{ dispatched: boolean; providerOrderId: string | null; message: string }> {
  const { getFzrCredentials, fzrCategoryFields, fzrCreateOrder } = await import('./fzr.server');

  if (!getFzrCredentials()) {
    return {
      dispatched: false,
      providerOrderId: null,
      message: 'Proveedor secundario no configurado. Se procesará manualmente.',
    };
  }

  const categoryId = (input.fzrCategory || '').trim();
  const offerId = (input.packId || '').trim();
  if (!categoryId || !offerId) {
    return {
      dispatched: false,
      providerOrderId: null,
      message:
        'Este paquete no tiene el juego o el código del proveedor secundario configurado. Se procesará manualmente.',
    };
  }

  const rawPlayer = (input.playerId || '').trim();
  const split = rawPlayer.match(/^(.+?)\s*[|(]\s*([A-Za-z0-9._-]{1,64})\s*\)?$/);
  const userId = split ? split[1]!.trim() : rawPlayer;
  const serverId = (input.serverId || split?.[2] || '').trim();

  try {
    let keys: string[] = [];
    try {
      keys = await fzrCategoryFields(categoryId);
    } catch {
      keys = [];
    }
    const fields: Record<string, string> = {};
    for (const key of keys.length ? keys : ['player_id']) {
      if (/server/i.test(key)) {
        if (serverId) fields[key] = serverId;
      } else {
        fields[key] = userId;
      }
    }

    const res = await fzrCreateOrder({ category_id: categoryId, offer_id: offerId, fields });
    const body = res.body as {
      ok?: boolean;
      order_id?: string;
      order?: { order_id?: string; status?: string };
      status?: string;
      error?: string;
      message?: string;
    };
    const providerOrderId = body?.order?.order_id ?? body?.order_id ?? null;
    const status = String(body?.order?.status ?? body?.status ?? '').toLowerCase();
    const failed =
      body?.ok === false ||
      ['failed', 'rejected', 'cancelled', 'canceled', 'error'].includes(status);

    if (!res.ok || failed) {
      console.warn('[fzr] provider rejected order', { status: res.status, body: res.body });
      const detail = body?.error ?? body?.message ?? '';
      return {
        dispatched: false,
        providerOrderId: null,
        message: `El proveedor rechazó la recarga (${res.status})${detail ? `: ${detail}` : ''}`,
      };
    }

    return { dispatched: true, providerOrderId, message: 'Recarga enviada al proveedor.' };
  } catch (e) {
    console.error('[fzr]', e);
    return {
      dispatched: false,
      providerOrderId: null,
      message: 'No se pudo contactar al proveedor; se procesará manualmente.',
    };
  }
}

/**
 * Despacho a GamerHub: POST /v1/orders con { product, sku, player_id }.
 * `product` es el product_code (ej. freefire-latam) y `sku` el paquete.
 */
async function dispatchToGamerHub(input: {
  orderId: string;
  packId: string;
  playerId: string;
  gamerhubProduct?: string;
}): Promise<{
  dispatched: boolean;
  providerOrderId: string | null;
  message: string;
  redeemCode?: string | null;
}> {
  const gh = await import('./gamerhub.server');
  if (!gh.getGamerHubCredentials()) {
    return {
      dispatched: false,
      providerOrderId: null,
      message: 'Proveedor GamerHub no configurado. Se procesará manualmente.',
    };
  }

  const product = String(input.gamerhubProduct ?? '').trim();
  const sku = String(input.packId ?? '').trim();
  if (!product || !sku) {
    return {
      dispatched: false,
      providerOrderId: null,
      message:
        'Este paquete no tiene el producto/SKU de GamerHub configurado. Se procesará manualmente.',
    };
  }

  try {
    const res = await gh.gamerHubOrder({
      product,
      sku,
      playerId: String(input.playerId ?? '').trim(),
      reference: input.orderId,
    });
    const body = (res.body ?? {}) as {
      success?: boolean;
      status?: string;
      message?: string;
      error?: string | { message?: string };
      data?: {
        order_id?: string | number;
        id?: string | number;
        status?: string;
        code?: string;
        redeem_code?: string;
      };
      order_id?: string | number;
    };
    const idRaw = body?.data?.order_id ?? body?.data?.id ?? body?.order_id ?? null;
    const providerOrderId = idRaw != null ? String(idRaw) : null;
    const status = String(body?.data?.status ?? body?.status ?? '').toLowerCase();
    const failed =
      body?.success === false ||
      ['failed', 'rejected', 'cancelled', 'canceled', 'error'].includes(status);

    if (!res.ok || failed) {
      console.warn('[gamerhub] provider rejected order', { status: res.status, body: res.body });
      const detail =
        typeof body?.error === 'string'
          ? body.error
          : (body?.error?.message ?? body?.message ?? '');
      return {
        dispatched: false,
        providerOrderId: null,
        message: `El proveedor rechazó la recarga (${res.status})${detail ? `: ${detail}` : ''}`,
      };
    }

    const redeemCode = (body?.data?.redeem_code ?? body?.data?.code ?? '') || null;
    return {
      dispatched: true,
      providerOrderId,
      redeemCode,
      message: 'Recarga enviada al proveedor.',
    };
  } catch (e) {
    console.error('[gamerhub]', e);
    return {
      dispatched: false,
      providerOrderId: null,
      message: 'No se pudo contactar al proveedor; se procesará manualmente.',
    };
  }
}
