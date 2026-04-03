import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createJsonCompletion, parseJsonContent } from "../_shared/openai.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { title, authors, core_theoretical_concept, pdf_text, domain_framework } = await req.json();

    const systemPrompt = `You are an expert in management and business research theory.
Extract the core theoretical concepts from this academic paper.
Respond only in valid JSON.`;

    const userPrompt = `PAPER TITLE: ${title}
AUTHORS: ${authors || "Not specified"}
RESEARCHER'S NOTED CONCEPT: ${core_theoretical_concept || "Not specified"}
DOMAIN FRAMEWORK: ${domain_framework || "Not specified"}
PAPER TEXT (first 8000 characters): ${(pdf_text || "").slice(0, 8000)}

Respond with JSON:
{
  "main_argument": "string (one sentence)",
  "key_concepts": [{"name": "string", "definition": "string"}],
  "theoretical_contribution": "string (one sentence)",
  "relevance_to_domain": "string (one sentence connecting to the researcher's domain framework if provided)"
}`;

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
      return new Response(JSON.stringify({ error: "Failed to parse AI response" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-literature error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
