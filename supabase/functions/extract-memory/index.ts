import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];

const EXTRACT_PROMPT = `You maintain a long-term memory about a specific user based on their chat with an AI assistant.

From the conversation below, extract ONLY durable, useful facts worth remembering for future chats — such as the user's name, goals, projects they are building, preferences, business/niche, tools they use, ongoing tasks, and important personal context.

Rules:
- Return a JSON array of short first-person-neutral fact strings, e.g. ["User is building a social media growth app", "Prefers concise answers"].
- Each fact must be self-contained and understandable without the conversation.
- Do NOT include one-off questions, small talk, or things that won't matter later.
- Do NOT repeat facts already in KNOWN MEMORY.
- If nothing new is worth saving, return [].
- Return ONLY the raw JSON array, no markdown, no explanation.`;

async function callLovable(body: Record<string, unknown>, key: string) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callGemini(body: Record<string, unknown>, key: string) {
  for (const m of GEMINI_FALLBACK_MODELS) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model: m }),
      });
      if (r.ok) return r;
      await r.body?.cancel();
    } catch (_) { /* try next */ }
  }
  return null;
}

function parseFacts(raw: string): string[] {
  if (!raw) return [];
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => typeof x === "string")
      .map((x: string) => x.trim())
      .filter((x) => x.length > 0 && x.length < 300)
      .slice(0, 8);
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, knownMemory } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ facts: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only look at recent turns; strip images to keep it text-only and cheap.
    const transcript = messages
      .slice(-12)
      .map((m: { role: string; content: unknown }) => {
        let content = "";
        if (typeof m.content === "string") content = m.content;
        else if (Array.isArray(m.content)) {
          content = (m.content as Array<{ type: string; text?: string }>)
            .filter((p) => p?.type === "text")
            .map((p) => p.text || "")
            .join(" ");
        }
        return `${m.role === "assistant" ? "AI" : "User"}: ${content}`;
      })
      .join("\n")
      .slice(0, 8000);

    const known = Array.isArray(knownMemory) ? knownMemory.slice(0, 100).join("\n- ") : "";
    const userContent = `KNOWN MEMORY:\n- ${known || "(none)"}\n\nCONVERSATION:\n${transcript}`;

    const body = {
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: EXTRACT_PROMPT },
        { role: "user", content: userContent },
      ],
      stream: false,
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

    let resp: Response | null = null;
    if (LOVABLE_API_KEY) {
      const r = await callLovable(body, LOVABLE_API_KEY);
      if (r.ok) resp = r;
      else await r.body?.cancel();
    }
    if (!resp && GEMINI_KEY) resp = await callGemini(body, GEMINI_KEY);

    if (!resp) {
      return new Response(JSON.stringify({ facts: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const facts = parseFacts(raw);

    return new Response(JSON.stringify({ facts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-memory error:", e);
    return new Response(JSON.stringify({ facts: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
