CREATE TABLE IF NOT EXISTS public.topup_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL,
  amount_nio numeric(12,2) NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS topup_codes_user_idx ON public.topup_codes(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS topup_codes_code_idx ON public.topup_codes(lower(code));

GRANT SELECT ON public.topup_codes TO authenticated;
GRANT ALL ON public.topup_codes TO service_role;

ALTER TABLE public.topup_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own topup codes" ON public.topup_codes;
CREATE POLICY "own topup codes" ON public.topup_codes
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.topup_requests
  ADD COLUMN IF NOT EXISTS note_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_note_code text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS auto_approved boolean NOT NULL DEFAULT false;