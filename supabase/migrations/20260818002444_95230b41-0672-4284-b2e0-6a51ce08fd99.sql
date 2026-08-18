-- ENUMS
CREATE TYPE public.wallet_tx_type AS ENUM ('topup','purchase','refund','bonus','adjustment');
CREATE TYPE public.topup_status AS ENUM ('pending','approved','rejected','cancelled');

-- WALLETS
CREATE TABLE public.wallets (
  user_id uuid PRIMARY KEY,
  balance_nio numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance_nio >= 0),
  total_topped_up_nio numeric(12,2) NOT NULL DEFAULT 0,
  total_spent_nio numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallets TO authenticated;
GRANT ALL ON public.wallets TO service_role;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own wallet" ON public.wallets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- TRANSACTIONS
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type public.wallet_tx_type NOT NULL,
  amount_nio numeric(12,2) NOT NULL,
  balance_before numeric(12,2) NOT NULL,
  balance_after numeric(12,2) NOT NULL,
  description text NOT NULL DEFAULT '',
  reference text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'completed',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  topup_request_id uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_tx_user ON public.wallet_transactions(user_id, created_at DESC);
GRANT SELECT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own transactions" ON public.wallet_transactions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- TOPUP REQUESTS
CREATE TABLE public.topup_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  method_code text NOT NULL DEFAULT '',
  method_name text NOT NULL DEFAULT '',
  amount_nio numeric(12,2) NOT NULL CHECK (amount_nio > 0),
  reference text NOT NULL DEFAULT '',
  external_tx_id text,
  receipt_path text NOT NULL DEFAULT '',
  status public.topup_status NOT NULL DEFAULT 'pending',
  review_reason text NOT NULL DEFAULT '',
  reviewed_by uuid,
  reviewed_at timestamptz,
  auto_source text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_topup_external_tx ON public.topup_requests(external_tx_id) WHERE external_tx_id IS NOT NULL;
CREATE UNIQUE INDEX idx_topup_reference ON public.topup_requests(lower(reference)) WHERE reference <> '' AND status = 'approved';
CREATE INDEX idx_topup_user ON public.topup_requests(user_id, created_at DESC);
CREATE INDEX idx_topup_status ON public.topup_requests(status, created_at DESC);
GRANT SELECT, INSERT ON public.topup_requests TO authenticated;
GRANT ALL ON public.topup_requests TO service_role;
ALTER TABLE public.topup_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own topups" ON public.topup_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "create own topups" ON public.topup_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');
CREATE TRIGGER trg_topup_updated BEFORE UPDATE ON public.topup_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ORDERS: marca de pago con saldo
ALTER TABLE public.orders ADD COLUMN paid_with_balance boolean NOT NULL DEFAULT false;

-- Crear wallet automáticamente para nuevos usuarios
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  INSERT INTO public.wallets (user_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $function$;

-- Wallets para usuarios existentes
INSERT INTO public.wallets (user_id) SELECT id FROM auth.users ON CONFLICT DO NOTHING;

-- Movimiento atómico de saldo (solo servidor / service_role)
CREATE OR REPLACE FUNCTION public.apply_wallet_transaction(
  _user_id uuid,
  _type public.wallet_tx_type,
  _amount numeric,
  _description text DEFAULT '',
  _reference text DEFAULT '',
  _order_id uuid DEFAULT NULL,
  _topup_request_id uuid DEFAULT NULL,
  _created_by uuid DEFAULT NULL
) RETURNS public.wallet_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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

  UPDATE public.wallets SET
    balance_nio = _after,
    total_topped_up_nio = total_topped_up_nio + GREATEST(_amount, 0),
    total_spent_nio = total_spent_nio + GREATEST(-_amount, 0)
  WHERE user_id = _user_id;

  INSERT INTO public.wallet_transactions
    (user_id, type, amount_nio, balance_before, balance_after, description, reference, order_id, topup_request_id, created_by)
  VALUES
    (_user_id, _type, _amount, _before, _after, COALESCE(_description,''), COALESCE(_reference,''), _order_id, _topup_request_id, _created_by)
  RETURNING * INTO _tx;

  RETURN _tx;
END; $$;

REVOKE ALL ON FUNCTION public.apply_wallet_transaction(uuid, public.wallet_tx_type, numeric, text, text, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_wallet_transaction(uuid, public.wallet_tx_type, numeric, text, text, uuid, uuid, uuid) TO service_role;