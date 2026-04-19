-- Allow collaborators to delete categories so code cleanup can remove
-- legacy code-backed categories when their source code is deleted.
CREATE POLICY "Project members can delete categories"
ON public.categories FOR DELETE
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);
