CREATE TYPE public.reseller_tier AS ENUM ('pro', 'wholesale');
CREATE TYPE public.reseller_app_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.reseller_members (
  user_id uuid PRIMARY KEY,
  tier public.reseller_tier NOT NULL,
  approved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.reseller_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tier public.reseller_tier NOT NULL,
  full_name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  business_name text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  monthly_volume text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  status public.reseller_app_status NOT NULL DEFAULT 'pending',
  review_reason text NOT NULL DEFAULT '',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX reseller_applications_user_idx ON public.reseller_applications (user_id, created_at DESC);
CREATE INDEX reseller_applications_status_idx ON public.reseller_applications (status, created_at DESC);

GRANT SELECT ON public.reseller_members TO authenticated;
GRANT ALL ON public.reseller_members TO service_role;
GRANT SELECT, INSERT ON public.reseller_applications TO authenticated;
GRANT ALL ON public.reseller_applications TO service_role;

ALTER TABLE public.reseller_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reseller_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own membership" ON public.reseller_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "read own applications" ON public.reseller_applications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "create own applications" ON public.reseller_applications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE TRIGGER reseller_members_updated_at BEFORE UPDATE ON public.reseller_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER reseller_applications_updated_at BEFORE UPDATE ON public.reseller_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_reseller_tier(_user_id uuid)
RETURNS public.reseller_tier
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tier FROM public.reseller_members WHERE user_id = _user_id
$$;