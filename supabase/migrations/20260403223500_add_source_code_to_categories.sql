ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS source_code_id UUID REFERENCES public.codes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_categories_source_code_id
ON public.categories(source_code_id);
