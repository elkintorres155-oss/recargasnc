CREATE TABLE IF NOT EXISTS public.store_settings (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.store_settings TO anon;
GRANT SELECT ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "store_settings_public_read" ON public.store_settings;
CREATE POLICY "store_settings_public_read" ON public.store_settings FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.store_settings (id, data) VALUES ('default', '{}'::jsonb) ON CONFLICT (id) DO NOTHING;