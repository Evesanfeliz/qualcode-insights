
-- Create theories table
CREATE TABLE public.theories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#0E9E8A',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.theories ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Project members can view theories"
  ON public.theories FOR SELECT TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()) OR public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can insert theories"
  ON public.theories FOR INSERT TO authenticated
  WITH CHECK (public.is_project_owner(project_id, auth.uid()) OR public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can update theories"
  ON public.theories FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()) OR public.is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can delete theories"
  ON public.theories FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()) OR public.is_project_member(project_id, auth.uid()));

-- Add theory_id to codes table
ALTER TABLE public.codes ADD COLUMN theory_id UUID REFERENCES public.theories(id) ON DELETE SET NULL;
