CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#1F9D8B',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, name)
);

CREATE TABLE public.code_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  code_id UUID REFERENCES public.codes(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(code_id, category_id)
);

CREATE TABLE public.themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#4C6FFF',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, name)
);

CREATE TABLE public.category_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE NOT NULL,
  theme_id UUID REFERENCES public.themes(id) ON DELETE CASCADE NOT NULL,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_id, theme_id)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.code_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view categories"
ON public.categories FOR SELECT
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can insert categories"
ON public.categories FOR INSERT
TO authenticated
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can update categories"
ON public.categories FOR UPDATE
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can view code_categories"
ON public.code_categories FOR SELECT
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can insert code_categories"
ON public.code_categories FOR INSERT
TO authenticated
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can delete code_categories"
ON public.code_categories FOR DELETE
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can view themes"
ON public.themes FOR SELECT
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can insert themes"
ON public.themes FOR INSERT
TO authenticated
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can update themes"
ON public.themes FOR UPDATE
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can view category_themes"
ON public.category_themes FOR SELECT
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can insert category_themes"
ON public.category_themes FOR INSERT
TO authenticated
WITH CHECK (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);

CREATE POLICY "Project members can delete category_themes"
ON public.category_themes FOR DELETE
TO authenticated
USING (
  public.is_project_owner(project_id, auth.uid())
  OR public.is_project_member(project_id, auth.uid())
);
