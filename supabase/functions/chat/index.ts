import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  friend: `You are Nifimas — a versatile AI assistant with deep knowledge of gaming, streaming culture, marketing, and general topics.

Your personality: Casual and supportive, like talking to a friend. Use emojis naturally but not excessively.

You can help with:
- Streamer outreach and conversation strategies
- General questions about anything
- Marketing, business, and brainstorming
- Analyzing images, screenshots, and conversations
- When a user uploads or pastes a conversation/chat screenshot, immediately analyze it and provide the perfect next reply they should send.

IMPORTANT: When given a conversation to analyze, suggest the exact next message to send. Format with markdown.`,

  promoter: `You are Brozeen — a confident, professional growth strategist and AI assistant.

Your personality: Professional but approachable. Data-driven and confident.

You can help with:
- Streamer promotion and conversion strategies
- Business planning and marketing
- Writing professional messages, proposals, and pitches
- Analyzing images, screenshots, and conversations

IMPORTANT: When given a conversation to analyze, suggest the exact next message to send. Format with markdown.`,
};

const DEEP_RESEARCH_SUFFIX = `

IMPORTANT: Deep Research mode is ON. Provide an extremely thorough, detailed answer with multiple perspectives, examples, step-by-step breakdowns, and actionable recommendations.`;

const MAX_CONTEXT_MESSAGES = 60;

type ChatMessagePart = { type: "text"; text?: string } | { type: "image_url"; image_url?: { url: string } };
type ChatMessage = { role: "user" | "assistant" | "system"; content: string | ChatMessagePart[] };

const GEMINI_MODEL_MAP: Record<string, string> = {
  "google/gemini-3-flash-preview": "gemini-1.5-flash",
  "google/gemini-2.5-pro": "gemini-1.5-pro",
};

function normalizeMessages(rawMessages: unknown): ChatMessage[] {
  if (!Array.isArray(rawMessages)) return [];
  const normalized = rawMessages
    .map((m) => {
      if (!m || typeof m !== "object") return null;
      const role = (m as any).role;
      const content = (m as any).content;
      if (role !== "user" && role !== "assistant") return null;
      if (typeof content === "string") return { role, content } as ChatMessage;
      if (Array.isArray(content)) {
        const safeParts = content
          .map((part: any) => {
            if (part?.type === "text") return { type: "text", text: part.text || "" } as ChatMessagePart;
            if (part?.type === "image_url" && part.image_url?.url) return { type: "image_url", image_url: { url: part.image_url.url } } as ChatMessagePart;
            return null;
          })
          .filter(Boolean) as ChatMessagePart[];
        return { role, content: safeParts } as ChatMessage;
      }
      return null;
    })
    .filter(Boolean) as ChatMessage[];
  return normalized.slice(-MAX_CONTEXT_MESSAGES);
}

async function callLovable(body: Record<string, unknown>, key: string) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callOpenAI(body: Record<string, unknown>, key: string, deep: boolean) {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: deep ? "gpt-4o" : "gpt-4o-mini" }),
  });
}

async function callGemini(body: Record<string, unknown>, key: string, model: string) {
  const geminiModel = GEMINI_MODEL_MAP[model] || "gemini-2.0-flash";
  return await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: geminiModel }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages: rawMessages, persona, deepResearch } = await req.json();
    const isDeepResearch = Boolean(deepResearch);
    const safeMessages = normalizeMessages(rawMessages);

    if (safeMessages.length === 0) {
      return new Response(JSON.stringify({ error: "Please enter a message first." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt = SYSTEM_PROMPTS[persona] || SYSTEM_PROMPTS.friend;
    if (isDeepResearch) systemPrompt += DEEP_RESEARCH_SUFFIX;

    // Get user's API keys (fallback chain)
    let userKeys: { gemini?: string; openai?: string } = {};
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);
      const authHeader = req.headers.get("authorization");
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await sb.auth.getUser(token);
        if (user) {
          const { data: settings } = await sb.from("user_settings").select("gemini_api_key, openai_api_key").eq("user_id", user.id).single();
          if (settings?.gemini_api_key) userKeys.gemini = settings.gemini_api_key;
          if (settings?.openai_api_key) userKeys.openai = settings.openai_api_key;
        }
      }
    } catch (_) { /* ignore */ }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const ENV_GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    const model = isDeepResearch ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

    const body = {
      model,
      messages: [{ role: "system", content: systemPrompt }, ...safeMessages],
      stream: true,
    };

    let response: Response | null = null;
    let lastErr = "";

    // 1. Lovable AI
    if (LOVABLE_API_KEY) {
      try {
        const r = await callLovable(body, LOVABLE_API_KEY);
        if (r.ok) response = r;
        else { lastErr = `Lovable ${r.status}`; await r.body?.cancel(); console.log("Lovable failed:", r.status); }
      } catch (e) { console.error("Lovable err:", e); }
    }

    // 2. OpenAI fallback
    if (!response && userKeys.openai) {
      try {
        const r = await callOpenAI(body, userKeys.openai, isDeepResearch);
        if (r.ok) response = r;
        else { lastErr = `OpenAI ${r.status}`; await r.body?.cancel(); }
      } catch (e) { console.error("OpenAI err:", e); }
    }

    // 3. Gemini fallback
    const geminiKey = userKeys.gemini || ENV_GEMINI_KEY;
    if (!response && geminiKey) {
      try {
        const r = await callGemini(body, geminiKey, model);
        if (r.ok) response = r;
        else { lastErr = `Gemini ${r.status}`; await r.body?.cancel(); }
      } catch (e) { console.error("Gemini err:", e); }
    }

    if (!response) {
      const hasUserKey = Boolean(userKeys.openai || userKeys.gemini);
      const msg = !hasUserKey
        ? "Free AI quota is used up. Open Settings → API Keys and paste your own free Gemini API key (get one at aistudio.google.com/apikey) to keep chatting without limits."
        : lastErr.includes("429")
        ? "Your AI key is rate-limited. Wait a moment or add another key in Settings → API Keys."
        : lastErr.includes("401") || lastErr.includes("403")
        ? "Your saved AI key was rejected. Update it in Settings → API Keys."
        : `AI providers failed (${lastErr || "unknown"}). Add a working Gemini or OpenAI key in Settings.`;
      return new Response(JSON.stringify({ error: msg }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
