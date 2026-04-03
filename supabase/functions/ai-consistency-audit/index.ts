import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createJsonCompletion, parseJsonContent } from "../_shared/openai.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { research_question, domain_framework, code_applications } = await req.json();

    const systemPrompt = `You are an expert in qualitative research methodology.
You detect semantic drift in qualitative coding — cases where the same code label is applied to passages that mean substantively different things across transcripts or across researchers.
Respond only in valid JSON. No prose, no markdown, no explanation.`;

    const userPrompt = `PROJECT RESEARCH QUESTION: ${research_question || "Not specified"}
DOMAIN FRAMEWORK: ${domain_framework || "Not specified"}

Below are all code applications grouped by code label.
For each code, you will see the segment text, which transcript it came from, and which researcher applied it.

${code_applications}

Identify codes where the same label appears to be applied to passages that mean substantively different things. For each drifting code provide:
- code_label: the code name
- drift_type: 'cross_researcher' | 'cross_transcript' | 'both'
- example_a: one segment that represents one interpretation
- example_b: one segment that represents a different interpretation
- explanation: one sentence describing the interpretive difference
- suggestion: 'merge' | 'split' | 'redefine'
- suggested_resolution: one sentence proposing how to fix it

Respond with JSON: {"drifting_codes": [{"code_label", "drift_type", "example_a", "example_b", "explanation", "suggestion", "suggested_resolution"}]}
If no drift is detected, respond with: {"drifting_codes": []}`;

    const completion = await createJsonCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    if (!completion.ok) return completion.response;

    let parsed;
    try {
      parsed = parseJsonContent(completion.content);
    } catch {
      console.error("Failed to parse AI response:", completion.content);
      return new Response(JSON.stringify({ error: "Failed to parse AI response", drifting_codes: [] }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("consistency-audit error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
