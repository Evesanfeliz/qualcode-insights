
DROP POLICY IF EXISTS "Users can create projects" ON public.projects;
CREATE POLICY "Users can create projects"
ON public.projects FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);
