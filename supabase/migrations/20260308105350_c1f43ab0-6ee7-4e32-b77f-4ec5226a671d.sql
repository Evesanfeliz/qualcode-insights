
-- Create a security definer function to get accessible project IDs without triggering RLS
CREATE OR REPLACE FUNCTION public.user_accessible_project_ids()
RETURNS TABLE(project_id UUID)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM projects WHERE user_id = auth.uid()
  UNION
  SELECT project_id FROM project_members WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION public.user_accessible_project_ids FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_accessible_project_ids TO authenticated;

-- Fix projects SELECT policy
DROP POLICY IF EXISTS "Users can view own projects" ON public.projects;
CREATE POLICY "Users can view accessible projects"
ON public.projects FOR SELECT
USING (id IN (SELECT project_id FROM public.user_accessible_project_ids()));

-- Fix project_members policies to avoid recursion
DROP POLICY IF EXISTS "Members can view project members" ON public.project_members;
CREATE POLICY "Members can view project members"
ON public.project_members FOR SELECT
USING (
  project_id IN (SELECT project_id FROM public.user_accessible_project_ids())
);

DROP POLICY IF EXISTS "Project owners can insert members" ON public.project_members;
CREATE POLICY "Project owners can insert members"
ON public.project_members FOR INSERT
WITH CHECK (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_members.project_id AND p.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Project owners can delete members" ON public.project_members;
CREATE POLICY "Project owners can delete members"
ON public.project_members FOR DELETE
USING (
  EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_members.project_id AND p.user_id = auth.uid())
);
