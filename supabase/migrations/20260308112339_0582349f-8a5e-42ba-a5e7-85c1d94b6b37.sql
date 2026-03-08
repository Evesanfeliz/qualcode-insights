
-- Add definition columns to codes table for codebook functionality
ALTER TABLE public.codes ADD COLUMN IF NOT EXISTS definition TEXT;
ALTER TABLE public.codes ADD COLUMN IF NOT EXISTS inclusion_criteria TEXT;
ALTER TABLE public.codes ADD COLUMN IF NOT EXISTS exclusion_criteria TEXT;
ALTER TABLE public.codes ADD COLUMN IF NOT EXISTS example_quote TEXT;
ALTER TABLE public.codes ADD COLUMN IF NOT EXISTS created_by UUID;

-- Create memos table
CREATE TABLE public.memos (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  author_id UUID NOT NULL,
  title TEXT NOT NULL,
  content JSONB,
  memo_type TEXT DEFAULT 'general',
  depth_score TEXT,
  linked_code_id UUID REFERENCES public.codes(id) ON DELETE SET NULL,
  linked_transcript_id UUID REFERENCES public.transcripts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create memo_replies table
CREATE TABLE public.memo_replies (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  memo_id UUID REFERENCES public.memos(id) ON DELETE CASCADE NOT NULL,
  author_id UUID NOT NULL,
  author_type TEXT DEFAULT 'researcher',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create activity_log table
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add validation triggers instead of CHECK constraints
CREATE OR REPLACE FUNCTION public.validate_memo_type()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.memo_type IS NOT NULL AND NEW.memo_type NOT IN ('code','category','theme','transcript','general') THEN
    RAISE EXCEPTION 'Invalid memo_type: %', NEW.memo_type;
  END IF;
  IF NEW.depth_score IS NOT NULL AND NEW.depth_score NOT IN ('D','I','T') THEN
    RAISE EXCEPTION 'Invalid depth_score: %', NEW.depth_score;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_memo_before_insert_update
  BEFORE INSERT OR UPDATE ON public.memos
  FOR EACH ROW EXECUTE FUNCTION public.validate_memo_type();

CREATE OR REPLACE FUNCTION public.validate_memo_reply_type()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.author_type IS NOT NULL AND NEW.author_type NOT IN ('researcher','claude') THEN
    RAISE EXCEPTION 'Invalid author_type: %', NEW.author_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_memo_reply_before_insert_update
  BEFORE INSERT OR UPDATE ON public.memo_replies
  FOR EACH ROW EXECUTE FUNCTION public.validate_memo_reply_type();

-- Enable RLS
ALTER TABLE public.memos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memo_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- RLS for memos (project members and owners)
CREATE POLICY "Project members can view memos" ON public.memos
  FOR SELECT TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can insert memos" ON public.memos
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()))
  );

CREATE POLICY "Authors can update own memos" ON public.memos
  FOR UPDATE TO authenticated
  USING (auth.uid() = author_id);

CREATE POLICY "Authors can delete own memos" ON public.memos
  FOR DELETE TO authenticated
  USING (auth.uid() = author_id);

-- RLS for memo_replies
CREATE POLICY "Project members can view memo replies" ON public.memo_replies
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.memos m
    WHERE m.id = memo_replies.memo_id
    AND (is_project_owner(m.project_id, auth.uid()) OR is_project_member(m.project_id, auth.uid()))
  ));

CREATE POLICY "Project members can insert memo replies" ON public.memo_replies
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.memos m
      WHERE m.id = memo_replies.memo_id
      AND (is_project_owner(m.project_id, auth.uid()) OR is_project_member(m.project_id, auth.uid()))
    )
  );

CREATE POLICY "Authors can delete own memo replies" ON public.memo_replies
  FOR DELETE TO authenticated
  USING (auth.uid() = author_id);

-- RLS for activity_log
CREATE POLICY "Project members can view activity" ON public.activity_log
  FOR SELECT TO authenticated
  USING (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()));

CREATE POLICY "Project members can insert activity" ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (is_project_owner(project_id, auth.uid()) OR is_project_member(project_id, auth.uid()))
  );

-- Enable realtime on tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.codes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.memos;
ALTER PUBLICATION supabase_realtime ADD TABLE public.memo_replies;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;

-- Auto-update updated_at on memos
CREATE TRIGGER update_memos_updated_at
  BEFORE UPDATE ON public.memos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
