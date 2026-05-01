import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createJsonCompletion, parseJsonContent } from "../_shared/openai.ts";

type Stage1Suggestion = {
  label: string;
  description?: string;
  rationale?: string;
  evidence?: Array<{
    quote: string;
    why_it_matters?: string;
  }>;
};

type ChunkDefinition = {
  index: number;
  startWord: number;
  endWord: number;
  content: string;
  wordCount: number;
};

const CHUNK_TARGET_WORDS = 1000;
const CHUNK_OVERLAP_WORDS = 140;
const MAX_CHUNKS = 4;

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const normalizeLabelKey = (value: string) =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim();

const countWords = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;

const splitIntoChunks = (content: string): ChunkDefinition[] => {
  const words = content.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  if (words.length <= CHUNK_TARGET_WORDS) {
    return [{
      index: 0,
      startWord: 0,
      endWord: words.length,
      content: words.join(" "),
      wordCount: words.length,
    }];
  }

  const chunks: ChunkDefinition[] = [];
  let startWord = 0;
  let chunkIndex = 0;

  while (startWord < words.length && chunks.length < MAX_CHUNKS) {
    const endWord = Math.min(startWord + CHUNK_TARGET_WORDS, words.length);
    const chunkWords = words.slice(startWord, endWord);

    chunks.push({
      index: chunkIndex,
      startWord,
      endWord,
      content: chunkWords.join(" "),
      wordCount: chunkWords.length,
    });

    if (endWord >= words.length) break;

    startWord = Math.max(0, endWord - CHUNK_OVERLAP_WORDS);
    chunkIndex += 1;
  }

  if (chunks.length === MAX_CHUNKS) {
    const lastChunk = chunks[chunks.length - 1];
    if (lastChunk.endWord < words.length) {
      const remainingWords = words.slice(lastChunk.startWord);
      chunks[chunks.length - 1] = {
        ...lastChunk,
        endWord: words.length,
        content: remainingWords.join(" "),
        wordCount: remainingWords.length,
      };
    }
  }

  return chunks;
};

const getCoverageGuidance = (wordCount: number) => {
  if (wordCount <= 1200) return "For a section of this size, a strong first pass will often end up around 6 to 10 codes.";
  if (wordCount <= 2200) return "For a section of this size, a strong first pass will often end up around 8 to 12 codes.";
  return "For a section of this size, a strong first pass will often end up around 10 to 14 codes.";
};

const buildSectionPrompt = (participantPseudonym: string | null | undefined, chunk: ChunkDefinition) => `You are reviewing one interview transcript section at a time.

PARTICIPANT: ${participantPseudonym || "Unknown participant"}
SECTION: ${chunk.index + 1}
SECTION RANGE: words ${chunk.startWord + 1}-${chunk.endWord}

TRANSCRIPT SECTION:
${chunk.content}

Task:
Generate useful initial codes grounded directly in this transcript section.

Rules:
- Let the content of this section determine how many codes are needed, but keep this first pass practical and reviewable.
- Prefer quality, coverage, and groundedness over sheer quantity.
- Stay descriptive and close to the participant's wording.
- Prefer concise code labels of 2 to 5 words.
- Use plain, natural researcher language. The label should sound like something a human qualitative researcher would write quickly in a codebook.
- Avoid overly elaborate, polished, abstract, or AI-sounding phrasing.
- Prefer concrete labels like "uses AI to save time" over stylized labels like "administrative time-saving orientation".
- If a label risks being ambiguous on its own, make it slightly clearer and more concrete.
- If a participant uses a vivid, unique, or culturally meaningful phrase to describe their reality, you may use that exact phrase as the code label as an in vivo code.
- Explicitly look for surprising facts, hesitations, contradictions, or negative cases that do not fit the expected narrative or standard pattern.
- Every code should usually include 1 short verbatim quote copied exactly from this section.
- Keep "description" very short and plain. One brief sentence is enough.
- Only include "rationale" when it adds real value. Otherwise omit it.
- Avoid broad final themes or theoretical conclusions.
- Avoid duplicates or near-duplicates inside this section.

Section-size guidance:
- ${getCoverageGuidance(chunk.wordCount)}
- Treat that as a practical guide, not a rigid quota.

Return JSON in this exact shape:
{
  "suggestions": [
    {
      "label": "short code label",
      "description": "one short sentence describing what this code captures",
      "evidence": [
        {
          "quote": "exact verbatim excerpt from the transcript section"
        }
      ]
    }
  ]
}`;

const parseSuggestions = (content: string) => {
  const parsed = parseJsonContent<{ suggestions?: Stage1Suggestion[] }>(content);
  return Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];
};

const invalidJsonResponse = (message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const callChunkModel = async (participantPseudonym: string | null | undefined, chunk: ChunkDefinition) => {
  const systemPrompt = `You are a qualitative research assistant helping with Stage 1 initial coding.

This stage must stay close to the transcript itself.
Do not use research questions, theory, domain frameworks, or later-stage interpretation.
Do not invent themes.
Do not summarize the whole interview.
Return only valid JSON. No prose. No markdown.`;

  const firstPass = await createJsonCompletion(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: buildSectionPrompt(participantPseudonym, chunk) },
    ],
    { max_tokens: 1100, temperature: 0.2 },
  );

  if (!firstPass.ok) return firstPass;

  try {
    return { ok: true as const, suggestions: parseSuggestions(firstPass.content) };
  } catch {
    const repairPass = await createJsonCompletion(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `${buildSectionPrompt(participantPseudonym, chunk)}

Important:
- Keep the output especially compact.
- Return only clean valid JSON.
- If needed, prefer fewer but stronger codes over malformed output.`,
        },
      ],
      { max_tokens: 850, temperature: 0.1 },
    );

    if (!repairPass.ok) return repairPass;

    try {
      return { ok: true as const, suggestions: parseSuggestions(repairPass.content) };
    } catch (repairError) {
      console.error("ai-stage1-initial-coding chunk parse error:", repairError);
      return {
        ok: false as const,
        response: invalidJsonResponse("AI returned malformed JSON for this transcript section."),
      };
    }
  }
};

const mergeSuggestions = (suggestions: Stage1Suggestion[]) => {
  const merged = new Map<string, Stage1Suggestion>();

  for (const suggestion of suggestions) {
    const label = normalizeWhitespace(suggestion.label || "");
    if (!label) continue;

    const key = normalizeLabelKey(label);
    if (!key) continue;

    const current = merged.get(key);
    const cleanedEvidence = (suggestion.evidence ?? [])
      .map((entry) => ({
        quote: normalizeWhitespace(entry.quote || ""),
        why_it_matters: entry.why_it_matters ? normalizeWhitespace(entry.why_it_matters) : undefined,
      }))
      .filter((entry) => entry.quote);

    if (!current) {
      merged.set(key, {
        label,
        description: suggestion.description ? normalizeWhitespace(suggestion.description) : undefined,
        rationale: suggestion.rationale ? normalizeWhitespace(suggestion.rationale) : undefined,
        evidence: cleanedEvidence.slice(0, 2),
      });
      continue;
    }

    const existingQuotes = new Set((current.evidence ?? []).map((entry) => normalizeWhitespace(entry.quote)));
    const newEvidence = cleanedEvidence.filter((entry) => !existingQuotes.has(entry.quote));

    merged.set(key, {
      label: current.label.length >= label.length ? current.label : label,
      description:
        current.description && current.description.length >= (suggestion.description?.length ?? 0)
          ? current.description
          : suggestion.description
            ? normalizeWhitespace(suggestion.description)
            : current.description,
      rationale:
        current.rationale && current.rationale.length >= (suggestion.rationale?.length ?? 0)
          ? current.rationale
          : suggestion.rationale
            ? normalizeWhitespace(suggestion.rationale)
            : current.rationale,
      evidence: [...(current.evidence ?? []), ...newEvidence].slice(0, 2),
    });
  }

  return Array.from(merged.values());
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { participant_pseudonym, transcript_content } = await req.json();

    if (!transcript_content || typeof transcript_content !== "string") {
      return new Response(JSON.stringify({ error: "Transcript content is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const chunks = splitIntoChunks(transcript_content);
    if (chunks.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aggregated: Stage1Suggestion[] = [];
    const chunkFailures: Array<{ chunk: number; error: string }> = [];

    for (const chunk of chunks) {
      const result = await callChunkModel(participant_pseudonym, chunk);
      if (!result.ok) {
        const errorText = await result.response.text();
        chunkFailures.push({ chunk: chunk.index + 1, error: errorText || "Unknown AI error" });
        continue;
      }

      aggregated.push(...result.suggestions);
    }

    const mergedSuggestions = mergeSuggestions(aggregated);

    if (mergedSuggestions.length === 0) {
      return new Response(JSON.stringify({
        error: chunkFailures.length > 0
          ? `Initial coding failed across all chunks. ${chunkFailures.map((failure) => `Chunk ${failure.chunk}: ${failure.error}`).join(" | ")}`
          : "AI did not return any usable initial coding suggestions.",
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      suggestions: mergedSuggestions,
      metadata: {
        chunked: chunks.length > 1,
        chunk_count: chunks.length,
        chunk_failures: chunkFailures.length,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-stage1-initial-coding error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
