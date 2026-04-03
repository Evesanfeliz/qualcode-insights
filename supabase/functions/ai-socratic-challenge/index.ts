import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createJsonCompletion, parseJsonContent } from "../_shared/openai.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { research_question, domain_framework, memo_title, memo_content, other_memos, relevant_segments, thread } = await req.json();

    const systemPrompt = `You are a rigorous qualitative research supervisor.
Your job is not to praise the researcher's memo but to identify the single most important intellectual gap, contradiction, or unexamined assumption in it.
You always ground your challenge in the researcher's own data — you reference specific coded segments or other memos when available.
Be direct and intellectually demanding. One challenge only. No praise.
Respond only in valid JSON. No prose, no markdown.`;

    let userPrompt: string;

    if (thread) {
      // Follow-up round
      userPrompt = `RESEARCH QUESTION: ${research_question || "Not specified"}
DOMAIN FRAMEWORK: ${domain_framework || "Not specified"}

DIALOGUE SO FAR:
${thread}

Push further. Find a deeper gap, contradiction, or unexamined assumption. Reference the researcher's own data. One challenge only.

Respond with JSON:
{
  "challenge": "string (the specific intellectual challenge, 2-4 sentences)",
  "challenge_type": "contradiction | gap | assumption | counter_evidence",
  "data_reference": "string (the specific segment or memo that grounds the challenge)"
}`;
    } else {
      userPrompt = `RESEARCH QUESTION: ${research_question || "Not specified"}
DOMAIN FRAMEWORK: ${domain_framework || "Not specified"}
THIS MEMO TITLE: ${memo_title}
THIS MEMO CONTENT: ${memo_content}
ALL OTHER MEMOS IN THIS PROJECT (titles + first 200 chars each):
${other_memos || "None"}
RELEVANT CODED SEGMENTS (segments from codes mentioned in this memo):
${relevant_segments || "None available"}

Respond with JSON:
{
  "challenge": "string (the specific intellectual challenge, 2-4 sentences, referencing the researcher's own data)",
  "challenge_type": "contradiction | gap | assumption | counter_evidence",
  "data_reference": "string (the specific segment or memo that grounds the challenge)"
}`;
    }

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
    console.error("socratic-challenge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
