import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createJsonCompletion, parseJsonContent } from "../_shared/openai.ts";

type AcceptedInitialCode = {
  item_id: string;
  code_id: string | null;
  label: string;
  description?: string | null;
  evidence_quotes?: string[];
};

type FocusedGroupSuggestion = {
  name: string;
  description?: string;
  rationale?: string;
  member_item_ids?: string[];
  supporting_quotes?: string[];
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { accepted_codes } = await req.json();

    if (!Array.isArray(accepted_codes) || accepted_codes.length === 0) {
      return new Response(JSON.stringify({ error: "Accepted Stage 1 codes are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedCodes = accepted_codes as AcceptedInitialCode[];

    const systemPrompt = `You are a qualitative research assistant helping with Stage 2 focused coding.

This stage groups already-accepted initial codes into broader descriptive clusters.
Do not invent final themes.
Do not use research questions, theory, or domain framing.
Preserve the original Stage 1 code labels exactly as given.
Return only valid JSON. No prose. No markdown.`;

    const userPrompt = `Below is a set of accepted initial codes from prior transcript-level coding.

ACCEPTED INITIAL CODES:
${JSON.stringify(normalizedCodes, null, 2)}

Task:
Group these accepted initial codes into 3 to 6 broader descriptive focused groups.

Rules:
- Use the original code labels exactly as provided.
- Do not rename the underlying initial codes.
- Every group must include at least 2 member item ids.
- Prefer groups that are descriptive and analytically useful, but not final themes.
- Each group should include 1 to 3 supporting quotes copied exactly from the provided evidence.

Return JSON in this exact shape:
{
  "groups": [
    {
      "name": "focused group name",
      "description": "one sentence describing the broader bucket",
      "rationale": "one sentence explaining why these initial codes fit together",
      "member_item_ids": ["item-id-1", "item-id-2"],
      "supporting_quotes": ["exact quote 1", "exact quote 2"]
    }
  ]
}`;

    const completion = await createJsonCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { max_tokens: 2200, temperature: 0.2 },
    );

    if (!completion.ok) return completion.response;

    const parsed = parseJsonContent<{ groups?: FocusedGroupSuggestion[] }>(completion.content);
    const groups = Array.isArray(parsed?.groups) ? parsed.groups : [];

    return new Response(JSON.stringify({ groups }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-stage2-focused-grouping error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
