// Verificación de transferencias usando las notificaciones bancarias reales en Gmail.
// Server-only: usa LOVABLE_API_KEY y GOOGLE_MAIL_API_KEY, nunca expuestos al navegador.

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/google_mail/gmail/v1';
const BATCH_URL = 'https://connector-gateway.lovable.dev/google_mail/batch/gmail/v1';

export type BankEmail = {
  messageId: string;
  from: string;
  subject: string;
  date: string | null; // ISO
  bank: string | null;
  amounts: number[];
  currency: string | null;
  references: string[];
  text: string;
};

const BANK_PATTERNS: Array<{ bank: string; re: RegExp }> = [
  { bank: 'lafise', re: /lafise/i },
  { bank: 'bac', re: /\bbac\b|baccredomatic|credomatic/i },
  { bank: 'banpro', re: /banpro|promerica/i },
  { bank: 'binance', re: /binance/i },
  { bank: 'billetera', re: /billetera|tigo\s*money/i },
];

function creds() {
  const lovable = process.env['LOVABLE_API_KEY'];
  const gmail = process.env['GOOGLE_MAIL_API_KEY'];
  if (!lovable || !gmail) return null;
  return { lovable, gmail };
}

export function gmailConfigured() {
  return creds() !== null;
}

function headers(c: { lovable: string; gmail: string }) {
  return { Authorization: `Bearer ${c.lovable}`, 'X-Connection-Api-Key': c.gmail };
}

function b64urlDecode(s: string) {
  const b = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

type Part = { mimeType?: string; body?: { data?: string }; parts?: Part[] };
function extractText(p: Part | undefined): string {
  if (!p) return '';
  let out = '';
  if (p.body?.data && /text\/(plain|html)/.test(p.mimeType ?? 'text/plain')) {
    out += b64urlDecode(p.body.data);
  }
  for (const c of p.parts ?? []) out += '\n' + extractText(c);
  return out;
}

function htmlToText(s: string) {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAmounts(text: string): number[] {
  const out = new Set<number>();
  const re = /(?:C\$|NIO|US\$|USD|\$|monto[^0-9]{0,20})\s*([0-9]{1,3}(?:[,.][0-9]{3})*(?:[.,][0-9]{1,2})?|[0-9]+(?:[.,][0-9]{1,2})?)/gi;
  for (const m of text.matchAll(re)) {
    let raw = m[1] ?? '';
    // 1,234.56 -> 1234.56 ; 1.234,56 -> 1234.56
    if (/,\d{1,2}$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.');
    else raw = raw.replace(/,/g, '');
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) out.add(Math.round(n * 100) / 100);
  }
  return [...out];
}

function parseReferences(text: string): string[] {
  const out = new Set<string>();
  const re = /(?:referencia|ref\.?|no\.?\s*de\s*transacci[oó]n|transacci[oó]n|comprobante|autorizaci[oó]n|n[uú]mero)\s*[:#nº°.]*\s*([A-Z0-9-]{5,30})/gi;
  for (const m of text.matchAll(re)) if (m[1] && /\d/.test(m[1])) out.add(m[1].toUpperCase());
  return [...out];
}

function parseCurrency(text: string) {
  if (/US\$|USD|USDT/i.test(text)) return 'USD';
  if (/C\$|NIO|c[oó]rdoba/i.test(text)) return 'NIO';
  return null;
}

function detectBank(s: string) {
  return BANK_PATTERNS.find((b) => b.re.test(s))?.bank ?? null;
}

async function listMessageIds(c: { lovable: string; gmail: string }, q: string, max = 25) {
  const url = `${GATEWAY_URL}/users/me/messages?maxResults=${max}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: headers(c) });
  if (!res.ok) throw new Error(`Gmail list [${res.status}]: ${await res.text()}`);
  const body = (await res.json()) as { messages?: Array<{ id: string }> };
  return (body.messages ?? []).map((m) => m.id);
}

async function batchGetFull(c: { lovable: string; gmail: string }, ids: string[]) {
  if (ids.length === 0) return [];
  const boundary = `batch_${crypto.randomUUID().replace(/-/g, '')}`;
  const body =
    ids
      .slice(0, 50)
      .map(
        (id, i) =>
          `--${boundary}\r\nContent-Type: application/http\r\nContent-ID: <item${i}>\r\n\r\nGET /gmail/v1/users/me/messages/${id}?format=full\r\n\r\n`,
      )
      .join('') + `--${boundary}--`;
  const res = await fetch(BATCH_URL, {
    method: 'POST',
    headers: { ...headers(c), 'Content-Type': `multipart/mixed; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Gmail batch [${res.status}]: ${await res.text()}`);
  const ct = res.headers.get('content-type') ?? '';
  const bm = /boundary=("?)([^";]+)\1/i.exec(ct);
  if (!/multipart\/mixed/i.test(ct) || !bm) throw new Error('Respuesta batch de Gmail inválida');
  const text = await res.text();
  const parts = text.split(`--${bm[2]}`).filter((p) => p.trim() && p.trim() !== '--');
  const out: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  for (const part of parts) {
    const status = /HTTP\/1\.1\s+(\d{3})/.exec(part);
    const jsonStart = part.indexOf('{');
    if (!status || jsonStart < 0) continue;
    const code = Number(status[1]);
    const json = part.slice(jsonStart, part.lastIndexOf('}') + 1);
    if (code < 200 || code >= 300) {
      errors.push(`[${code}] ${json.slice(0, 200)}`);
      continue;
    }
    try {
      out.push(JSON.parse(json));
    } catch {
      errors.push('parte no parseable');
    }
  }
  if (errors.length) console.error('[gmail-batch] partes con error:', errors);
  return out;
}

function toBankEmail(m: Record<string, unknown>): BankEmail {
  const payload = m['payload'] as (Part & { headers?: Array<{ name: string; value: string }> }) | undefined;
  const h = (n: string) => payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? '';
  const from = h('from');
  const subject = h('subject');
  const internal = Number(m['internalDate'] ?? 0);
  const text = htmlToText(`${subject}\n${String(m['snippet'] ?? '')}\n${extractText(payload)}`).slice(0, 8000);
  return {
    messageId: String(m['id']),
    from,
    subject,
    date: internal ? new Date(internal).toISOString() : null,
    bank: detectBank(`${from} ${subject}`) ?? detectBank(text),
    amounts: parseAmounts(text),
    currency: parseCurrency(text),
    references: parseReferences(text),
    text,
  };
}

/** Busca notificaciones bancarias recientes (últimos N días) en el Gmail conectado. */
export async function searchBankEmails(opts: { days?: number; extraQuery?: string } = {}) {
  const c = creds();
  if (!c) throw new Error('Gmail no está conectado');
  const banks = '(lafise OR bac OR credomatic OR banpro OR binance OR transferencia OR "has recibido" OR acreditado)';
  const q = `newer_than:${opts.days ?? 3}d ${banks} ${opts.extraQuery ?? ''}`.trim();
  const ids = await listMessageIds(c, q, 30);
  const msgs = await batchGetFull(c, ids);
  return msgs.map(toBankEmail);
}

export type MatchInput = {
  method: string; // lafise | bac | banpro | binance | ...
  amount: number; // monto esperado (NIO)
  bankReference: string; // referencia del comprobante / cliente
  receiptDate: string | null;
  requestedAt: Date;
  excludeMessageIds: string[]; // correos ya usados en pagos aprobados
};

export type MatchResult = {
  status: 'matched' | 'partial' | 'not_found' | 'error';
  email: BankEmail | null;
  checks: { amount: boolean; bank: boolean; reference: boolean | null; date: boolean };
  notes: string[];
};

/** Busca en Gmail la transferencia que corresponde al pago. Nunca inventa coincidencias. */
export async function findMatchingTransfer(input: MatchInput): Promise<MatchResult> {
  const empty = { amount: false, bank: false, reference: null, date: false };
  let emails: BankEmail[];
  try {
    emails = await searchBankEmails({ days: 3 });
  } catch (e) {
    return { status: 'error', email: null, checks: empty, notes: [e instanceof Error ? e.message : String(e)] };
  }
  const ref = input.bankReference.replace(/\s/g, '').toUpperCase();
  const method = input.method.toLowerCase();
  const windowMs = 48 * 3600 * 1000;

  let best: { email: BankEmail; score: number; checks: MatchResult['checks'] } | null = null;
  for (const e of emails) {
    if (input.excludeMessageIds.includes(e.messageId)) continue;
    const amount = e.amounts.some((a) => Math.abs(a - input.amount) < 0.01);
    if (!amount) continue;
    const bank = !!e.bank && (method.includes(e.bank) || e.bank.includes(method));
    const refFound = ref.length >= 4 ? e.text.replace(/\s/g, '').toUpperCase().includes(ref) : null;
    const t = e.date ? new Date(e.date).getTime() : 0;
    const date = !!t && Math.abs(t - input.requestedAt.getTime()) <= windowMs;
    const score = (bank ? 2 : 0) + (refFound ? 3 : 0) + (date ? 1 : 0) + 1;
    if (!best || score > best.score) best = { email: e, score, checks: { amount, bank, reference: refFound, date } };
  }
  if (!best) {
    return { status: 'not_found', email: null, checks: empty, notes: ['No se encontró en Gmail una notificación con ese monto en los últimos 3 días.'] };
  }
  const notes: string[] = [];
  if (!best.checks.bank) notes.push('El banco del correo no coincide con el método elegido.');
  if (best.checks.reference === false) notes.push('La referencia del comprobante no aparece en el correo.');
  if (best.checks.reference === null) notes.push('No hay referencia bancaria para comparar.');
  if (!best.checks.date) notes.push('La fecha del correo está fuera del rango razonable.');
  // Coincidencia clara: monto + banco + fecha, y la referencia coincide o el banco no la muestra
  // (null o falso solo si no hay referencias en el correo).
  // Coincidencia clara: monto + banco + fecha, y la referencia aparece en el correo
  // (o el banco no incluye referencias en su notificación).
  const refOk = best.checks.reference === true || best.email.references.length === 0;
  const matched = best.checks.amount && best.checks.bank && best.checks.date && refOk;
  return { status: matched ? 'matched' : 'partial', email: best.email, checks: best.checks, notes };
}
