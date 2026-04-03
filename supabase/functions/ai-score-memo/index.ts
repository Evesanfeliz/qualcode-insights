import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createJsonCompletion, parseJsonContent } from "../_shared/openai.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { memo_title, memo_content } = await req.json();

    const systemPrompt = `You are an expert in qualitative research methodology. You evaluate analytical memos on a three-level scale:
D (Descriptive): summarizes what participants said
I (Interpretive): explains what it means
T (Theoretical): makes a claim about the world
Respond only in valid JSON. No prose, no markdown.`;

    const userPrompt = `MEMO TITLE: ${memo_title}
MEMO CONTENT: ${memo_content}

Evaluate this memo and respond with JSON:
{
  "score": "D" | "I" | "T",
  "reason": "string (one sentence explaining the score)",
  "push_question": "string (one specific question that would push this memo to the next level — grounded in the memo's own content)"
}`;

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
    console.error("ai-score-memo error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
