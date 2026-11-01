import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { isDurableMemoryFact } from "../_shared/chatContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_FALLBACK_MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-2.5-flash"];

const EXTRACT_PROMPT = `You maintain a long-term memory about a specific user based on their chat with an AI assistant.

From the conversation below, extract ONLY durable, useful facts about the USER worth remembering for future chats — such as the user's name, long-term goals, projects they are building, stable preferences, business/niche, tools they use, and lasting personal context.

Rules:
- Return a JSON array of short first-person-neutral fact strings, e.g. ["User is building a social media growth app", "Prefers concise answers"].
- Each fact must be self-contained and understandable without the conversation.
- Do NOT include one-off questions, small talk, or things that won't matter later.
- Do NOT save details about a prospect, client, streamer, Discord exchange, a single outreach conversation, a planned message, or a one-time follow-up. Those belong in the Inbox client history, not the user's cross-chat memory.
- Do NOT save temporary status, dates, or time-based details such as today, tomorrow, this afternoon, an event, a single stream, or a current mood.
- Save a user's plan only when it is an ongoing project or durable goal, not a one-time action.
- Do NOT repeat facts already in KNOWN MEMORY.
- If nothing new is worth saving, return [].
- Return ONLY the raw JSON array, no markdown, no explanation.`;

async function callLovable(body: Record<string, unknown>, key: string) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
}

async function callGemini(body: Record<string, unknown>, key: string) {
  for (const m of GEMINI_FALLBACK_MODELS) {
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model: m, reasoning_effort: "low" }),
        signal: AbortSignal.timeout(12_000),
      });
      if (r.ok) return r;
      if ([401, 403, 429].includes(r.status)) { await r.body?.cancel(); break; }
      await r.body?.cancel();
    } catch (_) { /* try next */ }
  }
  return null;
}

async function callGroq(body: Record<string, unknown>, key: string): Promise<Response | null> {
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model: "openai/gpt-oss-20b", reasoning_effort: "low", max_tokens: 500 }),
      signal: AbortSignal.timeout(12_000),
    });
    if (response.ok) return response;
    await response.body?.cancel();
  } catch (error) { console.error("memory Groq unavailable:", error); }
  return null;
}

function normalizeFact(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!,;]+$/g, "");
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

    // The server owns signed-in memory persistence. Browser tabs can be
    // suspended immediately after a reply, so client-only inserts are fragile.
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const sb = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;
    let userId: string | null = null;
    let storedMemory: string[] = [];
    let personalGeminiKeys: string[] = [];
    let personalGroqKeys: string[] = [];
    const authHeader = req.headers.get("authorization");
    if (sb && authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await sb.auth.getUser(token);
      if (user) {
        userId = user.id;
        const [{ data: memoryRows }, { data: keyRows }] = await Promise.all([
          sb.from("user_memory").select("content").eq("user_id", user.id).limit(200),
          sb.from("api_keys").select("provider, api_key")
            .eq("user_id", user.id).eq("is_active", true)
            .in("provider", ["gemini", "groq"])
            .order("failure_count", { ascending: true }).limit(4),
        ]);
        storedMemory = (memoryRows || []).map((row) => row.content).filter(Boolean);
        personalGeminiKeys = (keyRows || []).filter((row) => row.provider === "gemini").map((row) => row.api_key).filter(Boolean);
        personalGroqKeys = (keyRows || []).filter((row) => row.provider === "groq").map((row) => row.api_key).filter(Boolean);
      }
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

    const known = (storedMemory.length ? storedMemory : Array.isArray(knownMemory) ? knownMemory : [])
      .slice(0, 100).join("\n- ");
    const userContent = `KNOWN MEMORY:\n- ${known || "(none)"}\n\nCONVERSATION:\n${transcript}`;

    const body = {
      model: "google/gemini-3.8-flash",
      messages: [
        { role: "system", content: EXTRACT_PROMPT },
        { role: "user", content: userContent },
      ],
      stream: false,
      max_tokens: 500,
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

    let resp: Response | null = null;
    for (const key of personalGeminiKeys.slice(0, 2)) {
      resp = await callGemini(body, key);
      if (resp) break;
    }
    if (!resp && GEMINI_KEY && !personalGeminiKeys.includes(GEMINI_KEY)) resp = await callGemini(body, GEMINI_KEY);
    for (const key of resp ? [] : personalGroqKeys.slice(0, 2)) {
      resp = await callGroq(body, key);
      if (resp) break;
    }
    if (!resp && LOVABLE_API_KEY) {
      try {
        const r = await callLovable(body, LOVABLE_API_KEY);
        if (r.ok) resp = r;
        else await r.body?.cancel();
      } catch (error) { console.error("memory Lovable unavailable:", error); }
    }

    if (!resp) {
      return new Response(JSON.stringify({ facts: [], persisted: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    const raw = data?.choices?.[0]?.message?.content || "";
    const facts = parseFacts(raw).filter(isDurableMemoryFact);

    if (userId && sb) {
      const seen = new Set(storedMemory.map(normalizeFact));
      const fresh = facts.filter((fact) => {
        const normalized = normalizeFact(fact);
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
      if (fresh.length) {
        const { error } = await sb.from("user_memory").insert(
          fresh.map((content) => ({ user_id: userId, content, source: "auto" })),
        );
        if (error) {
          console.error("Could not persist extracted memory:", error);
          return new Response(JSON.stringify({ facts: fresh, persisted: false }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
      return new Response(JSON.stringify({ facts: fresh, persisted: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ facts, persisted: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-memory error:", e);
    return new Response(JSON.stringify({ facts: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
