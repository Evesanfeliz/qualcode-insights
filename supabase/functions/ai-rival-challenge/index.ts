import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { proposition_statement, research_question, all_coded_segments } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a rigorous academic reviewer. Your job is to find evidence AGAINST the theoretical proposition you are given. Search the coded data for segments that contradict, complicate, or cannot be explained by the proposition. Be specific and rigorous.
Respond only in valid JSON.`;

    const userPrompt = `PROPOSITION: ${proposition_statement}
RESEARCH QUESTION: ${research_question || "Not specified"}

ALL CODED SEGMENTS ACROSS ALL TRANSCRIPTS:
${all_coded_segments || "None"}

Find segments that challenge this proposition. For each:
- segment_text: the exact text
- transcript_pseudonym: where it comes from
- code_label: how it was coded
- challenge_type: 'direct_contradiction' | 'unexplained_case' | 'missing_variable'
- explanation: one sentence on why this segment challenges the proposition

Respond with JSON: {"rival_evidence": [{"segment_text", "transcript_pseudonym", "code_label", "challenge_type", "explanation"}]}
If no rival evidence is found, respond with: {"rival_evidence": []}`;

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
      return new Response(JSON.stringify({ error: "Failed to parse AI response", rival_evidence: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(parsed), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("rival-challenge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
