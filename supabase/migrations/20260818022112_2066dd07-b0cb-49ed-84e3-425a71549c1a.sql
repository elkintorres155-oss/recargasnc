CREATE OR REPLACE FUNCTION public.apply_wallet_transaction(_user_id uuid, _type wallet_tx_type, _amount numeric, _description text DEFAULT ''::text, _reference text DEFAULT ''::text, _order_id uuid DEFAULT NULL::uuid, _topup_request_id uuid DEFAULT NULL::uuid, _created_by uuid DEFAULT NULL::uuid)
 RETURNS wallet_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _before numeric(12,2);
  _after numeric(12,2);
  _tx public.wallet_transactions;
BEGIN
  IF _amount = 0 THEN RAISE EXCEPTION 'El monto no puede ser cero'; END IF;

  INSERT INTO public.wallets (user_id) VALUES (_user_id) ON CONFLICT DO NOTHING;

  SELECT balance_nio INTO _before FROM public.wallets WHERE user_id = _user_id FOR UPDATE;
  _after := _before + _amount;
  IF _after < 0 THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  IF _type = 'refund' THEN
    UPDATE public.wallets SET
      balance_nio = _after,
      total_spent_nio = GREATEST(total_spent_nio - _amount, 0)
    WHERE user_id = _user_id;
  ELSE
    UPDATE public.wallets SET
      balance_nio = _after,
      total_topped_up_nio = total_topped_up_nio + GREATEST(_amount, 0),
      total_spent_nio = total_spent_nio + GREATEST(-_amount, 0)
    WHERE user_id = _user_id;
  END IF;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount_nio, balance_before, balance_after, description, reference, order_id, topup_request_id, created_by)
  VALUES
    (_user_id, _type, _amount, _before, _after, COALESCE(_description,''), COALESCE(_reference,''), _order_id, _topup_request_id, _created_by)
  RETURNING * INTO _tx;

  RETURN _tx;
END; $function$;

UPDATE public.wallets w SET
  total_topped_up_nio = COALESCE((SELECT SUM(amount_nio) FROM public.wallet_transactions t WHERE t.user_id = w.user_id AND t.type IN ('topup','bonus') AND t.amount_nio > 0), 0),
  total_spent_nio = GREATEST(COALESCE((SELECT SUM(-amount_nio) FROM public.wallet_transactions t WHERE t.user_id = w.user_id AND t.amount_nio < 0), 0) - COALESCE((SELECT SUM(amount_nio) FROM public.wallet_transactions t WHERE t.user_id = w.user_id AND t.type = 'refund'), 0), 0);