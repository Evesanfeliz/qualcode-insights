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

    const wordCount = transcript_content.trim().split(/\s+/).filter(Boolean).length;
    const coverageGuidance =
      wordCount <= 1500
        ? "For a transcript of this size, a strong first pass will often end up around 8 to 14 codes."
        : wordCount <= 3500
          ? "For a transcript of this size, a strong first pass will often end up around 12 to 20 codes."
          : "For a transcript of this size, a strong first pass will often end up around 16 to 28 codes.";

    const systemPrompt = `You are a qualitative research assistant helping with Stage 1 initial coding.

This stage must stay close to the transcript itself.
Do not use research questions, theory, domain frameworks, or later-stage interpretation.
Do not invent themes.
Do not summarize the whole interview.
Return only valid JSON. No prose. No markdown.`;

    const userPrompt = `You are reviewing one interview transcript at a time.

PARTICIPANT: ${participant_pseudonym || "Unknown participant"}

TRANSCRIPT:
${transcript_content}

Task:
Generate as many useful initial codes as are needed to do justice to this transcript.

Rules:
- Do not use one fixed universal number for all transcripts.
- Let the content of the transcript determine how many codes are needed, but keep this first pass practical and reviewable.
- Prefer quality, coverage, and groundedness over sheer quantity.
- Keep the output compact so the first pass stays practical to review.
- Stay descriptive and close to the participant's wording.
- Prefer concise code labels of 2 to 5 words.
- Use plain, natural researcher language. The label should sound like something a human qualitative researcher would write quickly in a codebook.
- Avoid overly elaborate, polished, abstract, or AI-sounding phrasing.
- Prefer concrete labels like "uses AI to save time" over stylized labels like "administrative time-saving orientation".
- If a label risks being ambiguous on its own, make it slightly clearer and more concrete.
- If a participant uses a vivid, unique, or culturally meaningful phrase to describe their reality, you may use that exact phrase as the code label as an in vivo code.
- Explicitly look for surprising facts, hesitations, contradictions, or negative cases that do not fit the expected narrative or standard pattern.
- Every code should usually include 1 short verbatim quote copied exactly from the transcript. Use a second quote only when it adds something important.
- The quotes must be specific enough that a researcher can verify the suggestion.
- Keep "description" very short and plain. One brief sentence is enough.
- Only include "rationale" when it adds real value. Otherwise omit it.
- Cover the major distinct ideas in the transcript, but do not create separate codes for tiny wording variations.
- Avoid broad final themes or theoretical conclusions.
- Avoid duplicates or near-duplicates.

Transcript-size guidance:
- ${coverageGuidance}
- Treat that as a practical guide, not a rigid quota.

Return JSON in this exact shape:
{
  "suggestions": [
    {
      "label": "short code label",
      "description": "one short sentence describing what this code captures",
      "evidence": [
        {
          "quote": "exact verbatim excerpt from the transcript"
        }
      ]
    }
  ]
}`;

    const completion = await createJsonCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { max_tokens: 2200, temperature: 0.2 },
    );

    if (!completion.ok) return completion.response;

    const parsed = parseJsonContent<{ suggestions?: Stage1Suggestion[] }>(completion.content);
    const suggestions = Array.isArray(parsed?.suggestions) ? parsed.suggestions : [];

    return new Response(JSON.stringify({ suggestions }), {
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
