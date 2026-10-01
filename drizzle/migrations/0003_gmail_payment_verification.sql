ALTER TABLE public.topup_requests
  ADD COLUMN IF NOT EXISTS internal_reference text,
  ADD COLUMN IF NOT EXISTS bank_reference text,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'payment_submitted',
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'NIO',
  ADD COLUMN IF NOT EXISTS gmail_message_id text,
  ADD COLUMN IF NOT EXISTS gmail_from text,
  ADD COLUMN IF NOT EXISTS gmail_subject text,
  ADD COLUMN IF NOT EXISTS gmail_amount_nio numeric,
  ADD COLUMN IF NOT EXISTS gmail_date timestamptz,
  ADD COLUMN IF NOT EXISTS validation_result jsonb;

UPDATE public.topup_requests
SET internal_reference = 'RNC-' || to_char(created_at, 'YYYYMMDD') || '-' || upper(substr(replace(id::text,'-',''),1,6))
WHERE internal_reference IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS topup_internal_ref_uniq ON public.topup_requests(internal_reference);
CREATE UNIQUE INDEX IF NOT EXISTS topup_gmail_msg_approved_uniq ON public.topup_requests(gmail_message_id)
  WHERE gmail_message_id IS NOT NULL AND status = 'approved';
CREATE INDEX IF NOT EXISTS topup_bank_ref_idx ON public.topup_requests(lower(bank_reference));

CREATE TABLE public.payment_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topup_id uuid REFERENCES public.topup_requests(id) ON DELETE CASCADE,
  order_id uuid,
  step text NOT NULL,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.payment_audit TO authenticated;
GRANT ALL ON public.payment_audit TO service_role;
ALTER TABLE public.payment_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read audit" ON public.payment_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  category text NOT NULL DEFAULT 'Otros gastos',
  amount numeric NOT NULL CHECK (amount >= 0),
  currency text NOT NULL DEFAULT 'NIO',
  spent_on date NOT NULL DEFAULT current_date,
  note text NOT NULL DEFAULT '',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage expenses" ON public.expenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));