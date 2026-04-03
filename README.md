# QualCode AI

QualCode AI is a qualitative research coding platform for transcript analysis, memo writing, theory building, and literature synthesis.

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Supabase
- Supabase Edge Functions

## Local development

```sh
cd "/Users/dady/Desktop/Coding Platform/qualcode-insights"
npm install
npm run dev
```

## Environment

Frontend environment variables in `.env`:

```env
VITE_SUPABASE_PROJECT_ID="your-project-ref"
VITE_SUPABASE_URL="https://your-project-ref.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="your-anon-key"
```

Supabase Edge Function secrets:

- `MOONSHOT_API_KEY`
- `MOONSHOT_BASE_URL`
- `MOONSHOT_MODEL`
- `MOONSHOT_TEMPERATURE`

## Backend

Database migrations live in [supabase/migrations](/Users/dady/Desktop/Coding Platform/qualcode-insights/supabase/migrations).

AI features are implemented as Supabase Edge Functions in [supabase/functions](/Users/dady/Desktop/Coding Platform/qualcode-insights/supabase/functions).

## Notes

- The app expects a `transcripts` storage bucket in Supabase.
- AI features use Moonshot via OpenAI-compatible chat completions.
- Word, Markdown, text, and PDF uploads are supported in the document ingestion flow.
