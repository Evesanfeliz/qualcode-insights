import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createJsonCompletion, parseJsonContent } from "../_shared/openai.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { research_question, domain_framework, approach, second_cycle_codes, theoretical_memos, codebook_categories } = await req.json();

    const systemPrompt = `You are an expert qualitative researcher specializing in management and business studies. Your task is to identify theoretical propositions that are genuinely grounded in the researcher's coded data and analytical memos. A proposition is not a summary — it is a claim about how the world works, derived from the patterns in the data. Propositions should be specific, debatable, and theoretically significant.
Respond only in valid JSON. No prose, no markdown.`;

    const userPrompt = `RESEARCH QUESTION: ${research_question || "Not specified"}
DOMAIN FRAMEWORK: ${domain_framework || "Not specified"}
ANALYTICAL APPROACH: ${approach || "Not specified"}

ALL SECOND-CYCLE CODES (label + definition + frequency):
${second_cycle_codes || "None"}

ALL THEORETICAL MEMOS (title + full content):
${theoretical_memos || "None"}

CODEBOOK CATEGORIES (grouped codes):
${codebook_categories || "None"}

Generate 2-3 theoretical propositions. For each:
- statement: the full proposition in one clear academic sentence
- supporting_codes: array of code labels that support this proposition
- theoretical_significance: one sentence on why this matters
- confidence: 'strong' | 'tentative' | 'speculative'
- tensions: one sentence on what aspect of the data this proposition does not explain well

Respond with JSON: {"propositions": [{"statement", "supporting_codes", "theoretical_significance", "confidence", "tensions"}]}`;

    const completion = await createJsonCompletion([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    if (!completion.ok) return completion.response;

    let parsed;
    try {
      parsed = parseJsonContent(completion.content);
    } catch {
      console.error("Failed to parse:", completion.content);
      return new Response(JSON.stringify({ error: "Failed to parse AI response", propositions: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(parsed), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("emerge-theory error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
