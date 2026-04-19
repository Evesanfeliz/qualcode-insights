import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, createJsonCompletion, parseJsonContent } from "../_shared/openai.ts";

type AcceptedFocusedGroup = {
  item_id: string;
  category_id: string | null;
  label: string;
  description?: string | null;
  member_labels?: string[];
  evidence_quotes?: string[];
};

type ThemeSuggestion = {
  name: string;
  description?: string;
  rationale?: string;
  member_item_ids?: string[];
  supporting_quotes?: string[];
  subthemes?: Array<{
    name: string;
    description?: string;
  }>;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { project_context, accepted_groups } = await req.json();

    if (!project_context?.research_question || !project_context?.domain_framework) {
      return new Response(JSON.stringify({ error: "Research question and domain framework are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!Array.isArray(accepted_groups) || accepted_groups.length === 0) {
      return new Response(JSON.stringify({ error: "Accepted focused groups are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedGroups = accepted_groups as AcceptedFocusedGroup[];

    const systemPrompt = `You are a qualitative research assistant helping with Stage 3 theme development.

This stage is allowed to use the research question and domain framework.
Your job is to synthesize already-accepted focused groups into higher-level themes and subthemes.
Themes must stay grounded in the accepted groups and their supporting evidence.
Return only valid JSON. No prose. No markdown.`;

    const userPrompt = `Below is the project context and a set of accepted focused groups.

PROJECT CONTEXT:
${JSON.stringify(project_context, null, 2)}

ACCEPTED FOCUSED GROUPS:
${JSON.stringify(normalizedGroups, null, 2)}

Task:
Generate 2 to 4 useful themes that respond to the research question.

Rules:
- Use the accepted focused groups as the building blocks.
- Every theme must include at least 2 member item ids.
- Every theme should include 1 to 3 supporting quotes copied exactly from the provided evidence.
- Each theme may include 0 to 3 subthemes.
- Keep the output grounded and defensible. Avoid generic or inflated academic language.

Return JSON in this exact shape:
{
  "themes": [
    {
      "name": "theme name",
      "description": "one sentence describing the theme",
      "rationale": "one sentence explaining why these groups belong together",
      "member_item_ids": ["focused-group-item-1", "focused-group-item-2"],
      "supporting_quotes": ["exact quote 1", "exact quote 2"],
      "subthemes": [
        {
          "name": "subtheme name",
          "description": "one sentence describing the subtheme"
        }
      ]
    }
  ]
}`;

    const completion = await createJsonCompletion(
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      { max_tokens: 2600, temperature: 0.2 },
    );

    if (!completion.ok) return completion.response;

    const parsed = parseJsonContent<{ themes?: ThemeSuggestion[] }>(completion.content);
    const themes = Array.isArray(parsed?.themes) ? parsed.themes : [];

    return new Response(JSON.stringify({ themes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-stage3-theme-development error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
