import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createJsonCompletion, parseJsonContent } from "../_shared/openai.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { research_question, domain_framework, literature_review_text, papers, second_cycle_codes } = await req.json();

    const systemPrompt = `You are an expert in management theory and qualitative research. Your task is to identify meaningful theoretical connections between a researcher's empirical codes and the theoretical concepts from their literature review. A connection must be substantive — not superficial word matching. Each connection should reveal something theoretically significant about how the researcher's data relates to existing theory.
Respond only in valid JSON.`;

    const userPrompt = `RESEARCH QUESTION: ${research_question || "Not specified"}
DOMAIN FRAMEWORK: ${domain_framework || "Not specified"}
LITERATURE REVIEW SYNTHESIS: ${literature_review_text || "Not provided"}

LITERATURE PAPERS AND THEIR KEY CONCEPTS:
${papers || "None"}

RESEARCHER'S SECOND-CYCLE CODES AND CATEGORIES:
${second_cycle_codes || "None"}

For each meaningful connection you find between a researcher code/category and a literature concept, provide:
- researcher_element: the code or category name
- literature_concept: the concept name
- paper_title: which paper it comes from
- relationship_type: 'extends' | 'challenges' | 'fills_gap' | 'replicates'
- explanation: 2-3 sentences explaining the theoretical significance
- implication: one sentence on what this means for the thesis contribution

Respond with JSON: {"bridges": [{"researcher_element", "literature_concept", "paper_title", "relationship_type", "explanation", "implication"}]}`;

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
      return new Response(JSON.stringify({ error: "Failed to parse AI response", bridges: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(parsed), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("literature-bridge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
