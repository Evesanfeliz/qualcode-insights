import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { research_question, domain_framework, approach, second_cycle_codes, theoretical_memos, codebook_categories } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "Payment required." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error("Failed to parse:", content);
      return new Response(JSON.stringify({ error: "Failed to parse AI response", propositions: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(parsed), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("emerge-theory error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
