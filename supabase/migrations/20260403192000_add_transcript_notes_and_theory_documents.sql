CREATE TABLE public.transcript_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  transcript_id UUID REFERENCES public.transcripts(id) ON DELETE CASCADE NOT NULL,
  start_index INTEGER NOT NULL,
  end_index INTEGER NOT NULL,
  selected_text TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.transcript_annotations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view transcript annotations"
ON public.transcript_annotations FOR SELECT
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can insert transcript annotations"
ON public.transcript_annotations FOR INSERT
TO authenticated
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can update transcript annotations"
ON public.transcript_annotations FOR UPDATE
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

ALTER TABLE public.theories
ADD COLUMN IF NOT EXISTS document_name TEXT,
ADD COLUMN IF NOT EXISTS document_url TEXT,
ADD COLUMN IF NOT EXISTS document_text TEXT;
