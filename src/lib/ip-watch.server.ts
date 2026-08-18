import { notifyAdminTelegram } from './telegram.server';

const STATE_ID = 'egress_ip';

type IpState = { ip?: string; ipv6?: string; checkedAt?: string };

async function fetchIp(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = (await res.text()).trim();
    return text.length > 0 && text.length < 60 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Consulta la IP pública de salida y avisa por Telegram si cambió
 * respecto a la última guardada.
 */
export async function checkEgressIp(): Promise<{
  ip: string | null;
  ipv6: string | null;
  changed: boolean;
}> {
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const [ip, ipv6] = await Promise.all([
    fetchIp('https://api.ipify.org'),
    fetchIp('https://api64.ipify.org'),
  ]);

  const { data } = await supabaseAdmin
    .from('store_settings')
    .select('data')
    .eq('id', STATE_ID)
    .maybeSingle();

  const prev = (data?.data ?? {}) as IpState;
  const changed =
    (!!ip && prev.ip !== ip) || (!!ipv6 && ipv6 !== ip && prev.ipv6 !== ipv6);

  if (changed) {
    const lines = [
      '⚠️ <b>La IP del servidor cambió</b>',
      '',
      `IPv4 anterior: <code>${prev.ip ?? '—'}</code>`,
      `IPv4 nueva: <code>${ip ?? '—'}</code>`,
    ];
    if (ipv6 && ipv6 !== ip) {
      lines.push(`IPv6 anterior: <code>${prev.ipv6 ?? '—'}</code>`);
      lines.push(`IPv6 nueva: <code>${ipv6}</code>`);
    }
    lines.push('', 'Actualizá la lista blanca en el panel de FlashTopUp.');
    await notifyAdminTelegram(lines.join('\n'));
  }

  if (ip || ipv6) {
    await supabaseAdmin.from('store_settings').upsert({
      id: STATE_ID,
      data: {
        ip: ip ?? prev.ip ?? null,
        ipv6: ipv6 ?? prev.ipv6 ?? null,
        checkedAt: new Date().toISOString(),
      },
      updated_at: new Date().toISOString(),
    });
  }

  return { ip, ipv6, changed };
}
