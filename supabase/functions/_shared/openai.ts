export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function createJsonCompletion(messages: ChatMessage[], options?: {
  max_tokens?: number;
  temperature?: number;
}) {
  const MOONSHOT_API_KEY = Deno.env.get("MOONSHOT_API_KEY");
  if (!MOONSHOT_API_KEY) throw new Error("MOONSHOT_API_KEY is not configured");

  const MOONSHOT_BASE_URL = (Deno.env.get("MOONSHOT_BASE_URL") || "https://api.moonshot.ai/v1").replace(/\/$/, "");
  const model = Deno.env.get("MOONSHOT_MODEL") || "kimi-k2.5";
  const isMoonshot = MOONSHOT_BASE_URL.includes("moonshot.ai");
  const isKimi25 = model.startsWith("kimi-k2.5");
  const moonshotTemperature = Deno.env.get("MOONSHOT_TEMPERATURE");
  const temperature = isMoonshot
    ? Number.isFinite(Number(moonshotTemperature))
      ? Number(moonshotTemperature)
      : 0.6
    : options?.temperature;

  const response = await fetch(`${MOONSHOT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MOONSHOT_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      response_format: { type: "json_object" },
      ...(isMoonshot && isKimi25 ? { thinking: { type: "disabled" } } : {}),
      ...(options?.max_tokens ? { max_tokens: options.max_tokens } : {}),
      ...(typeof temperature === "number" ? { temperature } : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("OpenAI API error:", response.status, errorText);

    if (response.status === 429) {
      return {
        ok: false as const,
        response: new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }),
      };
    }

    if (response.status === 402) {
      return {
        ok: false as const,
        response: new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }),
      };
    }

    return {
      ok: false as const,
      response: new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }),
    };
  }

  const data = await response.json();
  const rawContent = data.choices?.[0]?.message?.content;
  const content = Array.isArray(rawContent)
    ? rawContent
        .map((part: any) => typeof part?.text === "string" ? part.text : "")
        .join("")
    : (rawContent || "");

  return {
    ok: true as const,
    content,
  };
}

export function parseJsonContent<T>(content: string): T {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const normalized = fencedMatch ? fencedMatch[1].trim() : content.trim();

  try {
    return JSON.parse(normalized) as T;
  } catch {
    const objectMatch = normalized.match(/\{[\s\S]*\}/);
    if (objectMatch) return JSON.parse(objectMatch[0]) as T;

    const arrayMatch = normalized.match(/\[[\s\S]*\]/);
    if (arrayMatch) return JSON.parse(arrayMatch[0]) as T;

    throw new Error("Could not parse AI response as JSON");
  }
}
