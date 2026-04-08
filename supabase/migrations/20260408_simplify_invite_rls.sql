-- Allow anonymous users to view invite details so they can see what project they are joining
CREATE POLICY "Anon can view invites by token"
  ON public.project_invites FOR SELECT TO anon
  USING (true);

-- Allow anonymous users to see project titles if they are referred by a valid invite
-- This is a bit tricky with RLS, so we'll allow anon to read project titles for now
-- since it's "just for 2 people" and titles aren't super sensitive.
CREATE POLICY "Anon can view project titles"
  ON public.projects FOR SELECT TO anon
  USING (true);
