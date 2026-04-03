
-- Table: theory_propositions
CREATE TABLE public.theory_propositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  statement TEXT NOT NULL,
  supporting_codes TEXT[],
  theoretical_significance TEXT,
  tensions TEXT,
  confidence TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  rival_evidence JSONB,
  researcher_responses JSONB,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_theory_proposition()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.confidence IS NOT NULL AND NEW.confidence NOT IN ('strong', 'tentative', 'speculative') THEN
    RAISE EXCEPTION 'Invalid confidence: %', NEW.confidence;
  END IF;
  IF NEW.status NOT IN ('proposed', 'accepted', 'rejected', 'refined') THEN
    RAISE EXCEPTION 'Invalid status: %', NEW.status;
  END IF;
  IF NEW.created_by IS NOT NULL AND NEW.created_by NOT IN ('claude', 'researcher_a', 'researcher_b') THEN
    RAISE EXCEPTION 'Invalid created_by: %', NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_theory_proposition
  BEFORE INSERT OR UPDATE ON public.theory_propositions
  FOR EACH ROW EXECUTE FUNCTION public.validate_theory_proposition();

ALTER TABLE public.theory_propositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view theory propositions"
  ON public.theory_propositions FOR SELECT TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can insert theory propositions"
  ON public.theory_propositions FOR INSERT TO authenticated
  WITH CHECK (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update theory propositions"
  ON public.theory_propositions FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can delete theory propositions"
  ON public.theory_propositions FOR DELETE TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

-- Table: literature_bridges
CREATE TABLE public.literature_bridges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  researcher_element TEXT NOT NULL,
  literature_concept TEXT NOT NULL,
  paper_id UUID REFERENCES public.literature_papers(id),
  relationship_type TEXT,
  explanation TEXT,
  implication TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_literature_bridge()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.relationship_type IS NOT NULL AND NEW.relationship_type NOT IN ('extends', 'challenges', 'fills_gap', 'replicates') THEN
    RAISE EXCEPTION 'Invalid relationship_type: %', NEW.relationship_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_literature_bridge
  BEFORE INSERT OR UPDATE ON public.literature_bridges
  FOR EACH ROW EXECUTE FUNCTION public.validate_literature_bridge();

ALTER TABLE public.literature_bridges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view literature bridges"
  ON public.literature_bridges FOR SELECT TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can insert literature bridges"
  ON public.literature_bridges FOR INSERT TO authenticated
  WITH CHECK (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update literature bridges"
  ON public.literature_bridges FOR UPDATE TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can delete literature bridges"
  ON public.literature_bridges FOR DELETE TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));
