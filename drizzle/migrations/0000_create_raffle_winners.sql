CREATE TABLE public.raffle_winners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL DEFAULT '',
  full_name text NOT NULL DEFAULT '',
  amount_nio numeric(12,2) NOT NULL DEFAULT 100,
  week_start date NOT NULL,
  week_end date NOT NULL,
  participants integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX raffle_winners_week_uidx ON public.raffle_winners (week_start);

GRANT SELECT ON public.raffle_winners TO anon;
GRANT SELECT ON public.raffle_winners TO authenticated;
GRANT ALL ON public.raffle_winners TO service_role;

ALTER TABLE public.raffle_winners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read winners" ON public.raffle_winners
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "admins manage winners" ON public.raffle_winners
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));