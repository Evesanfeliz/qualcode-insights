import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createJsonCompletion, parseJsonContent } from "../_shared/openai.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const {
      research_question,
      domain_framework,
      approach,
      existing_codes,
      selected_text,
      surrounding_context,
    } = await req.json();

    const systemPrompt = `You are an expert in qualitative research methodology, specifically grounded analysis and the two-cycle coding model (Saldana, 2015). Your role is to support — not replace — the researcher's interpretive judgement. Respond only in valid JSON. No prose, no markdown.`;

    const userPrompt = `RESEARCH QUESTION: ${research_question || "Not specified"}
DOMAIN FRAMEWORK: ${domain_framework || "Not specified"}
ANALYTICAL APPROACH: ${approach || "Not specified"}
EXISTING CODES IN PROJECT: ${existing_codes || "None yet"}
SEGMENT TO CODE: ${selected_text}
SURROUNDING CONTEXT (3 lines before and after): ${surrounding_context || "Not available"}

Suggest 3 codes for this segment. For each, provide:
- label: a short phrase (2-5 words)
- justification: one sentence explaining why this code fits
- domain_connection: one sentence connecting this code to the researcher's domain framework
- confidence: 'high', 'medium', or 'low'

Respond with JSON: {"suggestions": [{"label", "justification", "domain_connection", "confidence"}]}`;

    const completion = await createJsonCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], { max_tokens: 1000, temperature: 0.3 });
    if (!completion.ok) return completion.response;

    const parsed = parseJsonContent(completion.content);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-suggest-codes error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
