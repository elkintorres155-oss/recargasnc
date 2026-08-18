/**
 * Lógica compartida para aprobar/rechazar recargas de saldo.
 * La usan tanto el panel de administración como el bot de Telegram.
 * SOLO servidor: usa la clave de servicio.
 */
export type ReviewResult = {
  ok: boolean;
  approved: boolean;
  alreadyProcessed: boolean;
  message: string;
};

export async function reviewTopupById(params: {
  topupId: string;
  approve: boolean;
  reason?: string;
  reviewerId?: string | null;
}): Promise<ReviewResult> {
  const { topupId, approve } = params;
  const reason = params.reason ?? '';
  const reviewerId = params.reviewerId ?? null;
  const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

  const { data: req, error } = await supabaseAdmin
    .from('topup_requests')
    .select('id, user_id, amount_nio, status, method_name, reference')
    .eq('id', topupId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!req) return { ok: false, approved: false, alreadyProcessed: false, message: 'Solicitud no encontrada.' };
  if (req.status !== 'pending')
    return { ok: false, approved: false, alreadyProcessed: true, message: 'Esta solicitud ya fue procesada.' };

  if (!approve) {
    await supabaseAdmin
      .from('topup_requests')
      .update({
        status: 'rejected',
        review_reason: reason || 'Rechazada por el administrador.',
        reviewed_by: reviewerId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', req.id)
      .eq('status', 'pending');
    return { ok: true, approved: false, alreadyProcessed: false, message: 'Recarga rechazada.' };
  }

  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('topup_requests')
    .update({
      status: 'approved',
      review_reason: reason,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', req.id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed)
    return { ok: false, approved: false, alreadyProcessed: true, message: 'Esta solicitud ya fue procesada.' };

  const { error: txError } = await supabaseAdmin.rpc('apply_wallet_transaction', {
    _user_id: req.user_id,
    _type: 'topup',
    _amount: Number(req.amount_nio),
    _description: `Recarga ${req.method_name}`,
    _reference: req.reference ?? '',
    _topup_request_id: req.id,
    ...(reviewerId ? { _created_by: reviewerId } : {}),
  });
  if (txError) {
    await supabaseAdmin
      .from('topup_requests')
      .update({ status: 'pending', review_reason: 'Error al acreditar, reintentar.' })
      .eq('id', req.id);
    throw new Error(txError.message);
  }
  return { ok: true, approved: true, alreadyProcessed: false, message: 'Recarga aprobada.' };
}
