
-- Table: disagreement_threads
CREATE TABLE public.disagreement_threads (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code_id UUID NOT NULL REFERENCES public.codes(id) ON DELETE CASCADE,
  trigger_type TEXT NOT NULL,
  drift_type TEXT,
  example_a TEXT,
  example_b TEXT,
  explanation TEXT,
  suggestion TEXT,
  suggested_resolution TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

-- Validation trigger for disagreement_threads
CREATE OR REPLACE FUNCTION public.validate_disagreement_thread()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.trigger_type NOT IN ('manual', 'ai_drift') THEN
    RAISE EXCEPTION 'Invalid trigger_type: %', NEW.trigger_type;
  END IF;
  IF NEW.status NOT IN ('open', 'resolved_merged', 'resolved_split', 'resolved_redefined') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_disagreement_thread
  BEFORE INSERT OR UPDATE ON public.disagreement_threads
  FOR EACH ROW EXECUTE FUNCTION public.validate_disagreement_thread();

-- RLS for disagreement_threads
ALTER TABLE public.disagreement_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view disagreement threads"
  ON public.disagreement_threads FOR SELECT TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can insert disagreement threads"
  ON public.disagreement_threads FOR INSERT TO authenticated
  WITH CHECK (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update disagreement threads"
  ON public.disagreement_threads FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

-- Table: literature_papers
CREATE TABLE public.literature_papers (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  authors TEXT,
  year INTEGER,
  core_theoretical_concept TEXT,
  file_url TEXT,
  pdf_text_content TEXT,
  main_argument TEXT,
  theoretical_contribution TEXT,
  relevance_to_domain TEXT,
  key_concepts JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for literature_papers
ALTER TABLE public.literature_papers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view literature papers"
  ON public.literature_papers FOR SELECT TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can insert literature papers"
  ON public.literature_papers FOR INSERT TO authenticated
  WITH CHECK (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update literature papers"
  ON public.literature_papers FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can delete literature papers"
  ON public.literature_papers FOR DELETE TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

-- Add literature_review_text column to projects
ALTER TABLE public.projects ADD COLUMN literature_review_text TEXT;
