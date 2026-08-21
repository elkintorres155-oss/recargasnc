ALTER TABLE public.topup_requests
  ADD COLUMN IF NOT EXISTS ai_reference text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_amount_nio numeric,
  ADD COLUMN IF NOT EXISTS ai_bank text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_date text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ai_confidence numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_verdict text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ai_notes text NOT NULL DEFAULT '';