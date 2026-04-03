
CREATE TABLE public.onboarding_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  welcome_completed BOOLEAN DEFAULT false,
  practice_completed BOOLEAN DEFAULT false,
  tour_completed BOOLEAN DEFAULT false,
  tour_step_reached INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own onboarding progress"
ON public.onboarding_progress FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own onboarding progress"
ON public.onboarding_progress FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own onboarding progress"
ON public.onboarding_progress FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);
