-- ============================================================
-- AI analysis foundation
-- ============================================================

ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS parent_theme_id UUID REFERENCES public.themes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_themes_parent_theme_id
ON public.themes(parent_theme_id);

CREATE TABLE IF NOT EXISTS public.project_ai_entitlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL UNIQUE,
  interview_credits_purchased INTEGER NOT NULL DEFAULT 0 CHECK (interview_credits_purchased >= 0),
  interview_credits_used INTEGER NOT NULL DEFAULT 0 CHECK (interview_credits_used >= 0),
  free_trial_interviews_used INTEGER NOT NULL DEFAULT 0 CHECK (free_trial_interviews_used >= 0),
  max_minutes_per_paid_interview INTEGER NOT NULL DEFAULT 80 CHECK (max_minutes_per_paid_interview > 0),
  max_minutes_free_trial INTEGER NOT NULL DEFAULT 60 CHECK (max_minutes_free_trial > 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  payment_metadata JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_ai_interview_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  transcript_id UUID REFERENCES public.transcripts(id) ON DELETE CASCADE NOT NULL,
  usage_type TEXT NOT NULL CHECK (usage_type IN ('free_trial', 'paid')),
  credit_cost INTEGER NOT NULL DEFAULT 1 CHECK (credit_cost > 0),
  interview_minutes INTEGER,
  max_minutes_allowed INTEGER,
  status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'completed', 'cancelled')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, transcript_id)
);

CREATE TABLE IF NOT EXISTS public.ai_analysis_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  transcript_id UUID REFERENCES public.transcripts(id) ON DELETE CASCADE,
  stage TEXT NOT NULL CHECK (stage IN ('initial', 'focused', 'themes')),
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'review', 'accepted', 'rejected', 'archived', 'error')),
  provider TEXT,
  model TEXT,
  prompt_snapshot JSONB,
  config_snapshot JSONB,
  metadata JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.ai_analysis_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES public.ai_analysis_runs(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  transcript_id UUID REFERENCES public.transcripts(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK (item_type IN ('initial_code', 'focused_group', 'theme', 'subtheme')),
  label TEXT NOT NULL,
  description TEXT,
  rationale TEXT,
  review_status TEXT NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'accepted', 'edited', 'rejected', 'skipped')),
  order_index INTEGER NOT NULL DEFAULT 0,
  accepted_target_type TEXT CHECK (accepted_target_type IN ('code', 'category', 'theme')),
  accepted_target_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_analysis_item_evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID REFERENCES public.ai_analysis_items(id) ON DELETE CASCADE NOT NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  transcript_id UUID REFERENCES public.transcripts(id) ON DELETE CASCADE NOT NULL,
  transcript_excerpt TEXT NOT NULL,
  start_index INTEGER,
  end_index INTEGER,
  participant_pseudonym TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_ai_interview_usage_project_id
ON public.project_ai_interview_usage(project_id);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_runs_project_id
ON public.ai_analysis_runs(project_id);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_items_run_id
ON public.ai_analysis_items(run_id);

CREATE INDEX IF NOT EXISTS idx_ai_analysis_item_evidence_item_id
ON public.ai_analysis_item_evidence(item_id);

ALTER TABLE public.project_ai_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_ai_interview_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis_item_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view ai entitlements"
ON public.project_ai_entitlements FOR SELECT
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project owners can manage ai entitlements"
ON public.project_ai_entitlements FOR ALL
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
)
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
);

CREATE POLICY "Project members can manage ai interview usage"
ON public.project_ai_interview_usage FOR ALL
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
)
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can manage ai analysis runs"
ON public.ai_analysis_runs FOR ALL
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
)
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can manage ai analysis items"
ON public.ai_analysis_items FOR ALL
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
)
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can manage ai analysis evidence"
ON public.ai_analysis_item_evidence FOR ALL
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
)
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);
