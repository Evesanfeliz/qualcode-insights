-- Add documents column to theories as JSONB
ALTER TABLE public.theories ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '[]'::jsonb;

-- Migrate existing single-document data to the documents array
UPDATE public.theories
SET documents = jsonb_build_array(
  jsonb_build_object(
    'name', document_name,
    'url', document_url,
    'text', document_text
  )
)
WHERE document_name IS NOT NULL AND (documents IS NULL OR jsonb_array_length(documents) = 0);

-- Make documents column NOT NULL after migration
ALTER TABLE public.theories ALTER COLUMN documents SET NOT NULL;
