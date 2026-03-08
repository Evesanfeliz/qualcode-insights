import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { research_question, domain_framework, memo_title, memo_content, other_memos, relevant_segments, thread } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

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

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error("Failed to parse:", content);
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
