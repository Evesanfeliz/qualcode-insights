-- ─────────────────────────────────────────────────────────────────────────────
-- profiles: mirrors auth.users email so we can look users up by email
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users manage own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Users update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Trigger: auto-insert profile whenever a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Back-fill existing users (if any) into profiles
INSERT INTO public.profiles (id, email)
SELECT id, email FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- project_invites: token-based invite links (expire after 7 days)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.project_invites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  token      UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  used_by    UUID REFERENCES auth.users(id),
  used_at    TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT now() + INTERVAL '7 days',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.project_invites ENABLE ROW LEVEL SECURITY;

-- Owners can create / view / delete their own invites
CREATE POLICY "Project owners can manage invites"
  ON public.project_invites FOR ALL TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Any authenticated user can look up an invite by token (to accept it)
CREATE POLICY "Authenticated users can read invites"
  ON public.project_invites FOR SELECT TO authenticated
  USING (true);

-- Members can mark an invite as used
CREATE POLICY "Authenticated users can update invite used_by"
  ON public.project_invites FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
