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
 * Despacho al proveedor de recargas (FlashTopUp u otro).
 * Todavía NO hay credenciales ni endpoints reales: la orden queda aprobada
 * y en espera de procesamiento hasta configurar el proveedor.
 */
export async function dispatchToProvider(_input: {
  orderId: string;
  productId: string;
  packId: string;
  playerId: string;
}): Promise<{ dispatched: boolean; providerOrderId: string | null; message: string }> {
  const apiKey = process.env['TOPUP_PROVIDER_API_KEY'];
  const baseUrl = process.env['TOPUP_PROVIDER_BASE_URL'];
  if (!apiKey || !baseUrl) {
    return {
      dispatched: false,
      providerOrderId: null,
      message: 'Proveedor de recargas aún no configurado: la recarga se procesará manualmente.',
    };
  }
  return {
    dispatched: false,
    providerOrderId: null,
    message: 'Proveedor configurado pero falta definir el endpoint de recarga.',
  };
}
