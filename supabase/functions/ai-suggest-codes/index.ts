import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const MOONSHOT_API_KEY = Deno.env.get("MOONSHOT_API_KEY");
    if (!MOONSHOT_API_KEY) throw new Error("MOONSHOT_API_KEY is not configured");

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

    const response = await fetch("https://api.moonshot.cn/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${MOONSHOT_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "moonshot-v1-8k",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Moonshot API error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    // Parse the JSON from the response
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // Try to extract JSON from the response
      const match = content?.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error("Could not parse AI response as JSON");
      }
    }

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
