-- ============================================================
-- Fix: Allow project members to delete codes (missing RLS policy)
-- ============================================================
CREATE POLICY "Project members can delete codes"
ON public.codes FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = codes.project_id AND pm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = codes.project_id AND p.user_id = auth.uid()
  )
);

-- ============================================================
-- Fix: Allow project members to delete transcripts
-- (previously only project owners could delete)
-- ============================================================
DROP POLICY IF EXISTS "Project owners can delete transcripts" ON public.transcripts;

CREATE POLICY "Project members can delete transcripts"
ON public.transcripts FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = transcripts.project_id AND pm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = transcripts.project_id AND p.user_id = auth.uid()
  )
);

-- ============================================================
-- Feature: Add display_name to project_members
-- Allows researchers to have custom names (e.g. "Evelyn", "Katarina")
-- ============================================================
ALTER TABLE public.project_members
  ADD COLUMN IF NOT EXISTS display_name TEXT;
