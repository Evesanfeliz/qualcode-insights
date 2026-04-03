
-- Create transcripts table
CREATE TABLE public.transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  participant_pseudonym TEXT NOT NULL,
  file_url TEXT,
  content TEXT NOT NULL DEFAULT '',
  word_count INTEGER,
  interview_date DATE,
  assigned_to UUID,
  status TEXT DEFAULT 'uploaded' CHECK (status IN ('uploaded','in_progress','coded')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view transcripts"
ON public.transcripts FOR SELECT
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

CREATE POLICY "Project members can insert transcripts"
ON public.transcripts FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = transcripts.project_id AND pm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = transcripts.project_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Project members can update transcripts"
ON public.transcripts FOR UPDATE
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

CREATE POLICY "Project owners can delete transcripts"
ON public.transcripts FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = transcripts.project_id AND p.user_id = auth.uid()
  )
);

-- Create codes table
CREATE TABLE public.codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  label TEXT NOT NULL,
  color TEXT DEFAULT '#0A7C6E',
  cycle TEXT DEFAULT 'first' CHECK (cycle IN ('first','second')),
  parent_code_id UUID REFERENCES public.codes(id),
  ai_suggested BOOLEAN DEFAULT false,
  researcher_confirmed BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view codes"
ON public.codes FOR SELECT
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

CREATE POLICY "Project members can insert codes"
ON public.codes FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.project_members pm
    WHERE pm.project_id = codes.project_id AND pm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = codes.project_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Project members can update codes"
ON public.codes FOR UPDATE
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

-- Create code_applications table
CREATE TABLE public.code_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_id UUID REFERENCES public.codes(id) ON DELETE CASCADE NOT NULL,
  transcript_id UUID REFERENCES public.transcripts(id) ON DELETE CASCADE NOT NULL,
  applied_by UUID NOT NULL,
  segment_text TEXT NOT NULL,
  start_index INTEGER NOT NULL,
  end_index INTEGER NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.code_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project members can view code_applications"
ON public.code_applications FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.transcripts t
    JOIN public.project_members pm ON pm.project_id = t.project_id
    WHERE t.id = code_applications.transcript_id AND pm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.transcripts t
    JOIN public.projects p ON p.id = t.project_id
    WHERE t.id = code_applications.transcript_id AND p.user_id = auth.uid()
  )
);

CREATE POLICY "Project members can insert code_applications"
ON public.code_applications FOR INSERT
WITH CHECK (
  auth.uid() = applied_by
  AND (
    EXISTS (
      SELECT 1 FROM public.transcripts t
      JOIN public.project_members pm ON pm.project_id = t.project_id
      WHERE t.id = code_applications.transcript_id AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.transcripts t
      JOIN public.projects p ON p.id = t.project_id
      WHERE t.id = code_applications.transcript_id AND p.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can delete own code_applications"
ON public.code_applications FOR DELETE
USING (auth.uid() = applied_by);

-- Create storage bucket for transcripts
INSERT INTO storage.buckets (id, name, public)
VALUES ('transcripts', 'transcripts', false);

CREATE POLICY "Project members can upload transcripts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'transcripts'
  AND auth.role() = 'authenticated'
);

CREATE POLICY "Project members can read transcripts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'transcripts'
  AND auth.role() = 'authenticated'
);
