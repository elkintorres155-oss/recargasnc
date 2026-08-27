CREATE TYPE public.stock_status AS ENUM ('available','reserved','sold','suspended','expired');
CREATE TYPE public.stock_action AS ENUM ('created','updated','status_changed','delivered','deleted');

CREATE TABLE public.stock_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  email text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  profile text NOT NULL DEFAULT '',
  pin text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  expires_at date,
  status public.stock_status NOT NULL DEFAULT 'available',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  assigned_user_id uuid,
  assigned_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_accounts_service_status ON public.stock_accounts (service, status);
CREATE INDEX idx_stock_accounts_order ON public.stock_accounts (order_id);
CREATE INDEX idx_stock_accounts_user ON public.stock_accounts (assigned_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_accounts TO authenticated;
GRANT ALL ON public.stock_accounts TO service_role;
ALTER TABLE public.stock_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage stock" ON public.stock_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES public.stock_accounts(id) ON DELETE SET NULL,
  account_email text NOT NULL DEFAULT '',
  service text NOT NULL DEFAULT '',
  product_name text NOT NULL DEFAULT '',
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  order_code text NOT NULL DEFAULT '',
  user_id uuid,
  action public.stock_action NOT NULL,
  status_before public.stock_status,
  status_after public.stock_status,
  admin_id uuid,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_account ON public.stock_movements (account_id);
CREATE INDEX idx_stock_movements_created ON public.stock_movements (created_at DESC);

GRANT SELECT ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins read stock movements" ON public.stock_movements
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_stock_accounts_updated
  BEFORE UPDATE ON public.stock_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.claim_stock_account(
  _service text,
  _order_id uuid,
  _user_id uuid,
  _product_name text DEFAULT ''
)
RETURNS public.stock_accounts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _acc public.stock_accounts;
  _code text;
BEGIN
  SELECT * INTO _acc
  FROM public.stock_accounts
  WHERE lower(service) = lower(_service)
    AND status = 'available'
    AND (expires_at IS NULL OR expires_at >= current_date)
  ORDER BY created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF _acc.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.stock_accounts
  SET status = 'sold',
      order_id = _order_id,
      assigned_user_id = _user_id,
      assigned_at = now()
  WHERE id = _acc.id
  RETURNING * INTO _acc;

  SELECT order_code INTO _code FROM public.orders WHERE id = _order_id;

  INSERT INTO public.stock_movements
    (account_id, account_email, service, product_name, order_id, order_code, user_id, action, status_before, status_after, note)
  VALUES
    (_acc.id, _acc.email, _acc.service, COALESCE(_product_name,''), _order_id, COALESCE(_code,''), _user_id, 'delivered', 'available', 'sold', 'Entrega automática');

  RETURN _acc;
END; $$;

REVOKE ALL ON FUNCTION public.claim_stock_account(text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stock_account(text, uuid, uuid, text) TO service_role;