-- Helper: project membership check (bypasses RLS safely)
CREATE OR REPLACE FUNCTION public.is_project_member(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.project_members pm
    WHERE pm.project_id = _project_id
      AND pm.user_id = _user_id
  );
$$;

-- Helper: project ownership check
CREATE OR REPLACE FUNCTION public.is_project_owner(_project_id UUID, _user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = _project_id
      AND p.user_id = _user_id
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_project_member(UUID, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_project_owner(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_owner(UUID, UUID) TO authenticated;

-- Projects SELECT policy: allow owner directly (critical for INSERT ... RETURNING)
DROP POLICY IF EXISTS "Users can view accessible projects" ON public.projects;
CREATE POLICY "Users can view accessible projects"
ON public.projects
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.is_project_member(id, auth.uid())
);

-- Project members policies without recursive table joins
DROP POLICY IF EXISTS "Members can view project members" ON public.project_members;
CREATE POLICY "Members can view project members"
ON public.project_members
FOR SELECT
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

DROP POLICY IF EXISTS "Project owners can insert members" ON public.project_members;
CREATE POLICY "Project owners can insert members"
ON public.project_members
FOR INSERT
TO authenticated
WITH CHECK (public.is_project_owner(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project owners can delete members" ON public.project_members;
CREATE POLICY "Project owners can delete members"
ON public.project_members
FOR DELETE
TO authenticated
USING (public.is_project_owner(project_id, auth.uid()));