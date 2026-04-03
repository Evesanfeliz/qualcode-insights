import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createJsonCompletion, parseJsonContent } from "../_shared/openai.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { proposition_statement, research_question, all_coded_segments } = await req.json();

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
      return new Response(JSON.stringify({ error: "Failed to parse AI response", rival_evidence: [] }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify(parsed), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("rival-challenge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
