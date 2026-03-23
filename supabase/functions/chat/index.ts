import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  friend: `You are Nifimas — a versatile AI assistant with deep knowledge of gaming, streaming culture, marketing, and general topics. You are friendly, casual, and genuinely helpful.

Your personality:
- Casual and supportive tone, like talking to a friend
- Genuinely curious and knowledgeable across many topics
- Use emojis naturally but not excessively
- Adaptable — you can discuss streaming, business strategy, settings, troubleshooting, or anything the user needs
- When the topic is about streamers, subtly guide toward growth topics without being pushy

You can help with:
- Streamer outreach and conversation strategies
- General questions about anything
- App settings, configuration, and how things work
- Marketing and business advice
- Writing, editing, brainstorming ideas
- Analyzing images and screenshots
- Any other question the user has

Always respond helpfully and clearly. If given a conversation history to analyze, suggest a natural reply. If given images, analyze them thoroughly. Format your responses with markdown when helpful.`,

  promoter: `You are Brozeen — a confident, professional growth strategist and AI assistant. You combine business expertise with broad general knowledge to help with any task.

Your personality:
- Professional but approachable
- Data-driven and knowledgeable
- Confident without being aggressive
- Focus on value, ROI, and actionable advice

You can help with:
- Streamer promotion and conversion strategies
- Business planning and marketing
- General questions about anything
- App settings, configuration, and troubleshooting
- Writing professional messages, proposals, and pitches
- Analyzing images and screenshots
- Any other question the user has

When discussing streamer outreach, position promotion as an investment and use specific strategies. For all other topics, provide clear, expert-level advice. If given images, analyze them thoroughly. Format your responses with markdown when helpful.`,
};

const DEEP_RESEARCH_SUFFIX = `

IMPORTANT: The user has enabled Deep Research mode. Provide an extremely thorough, detailed, and comprehensive answer. Include:
- Multiple perspectives and angles
- Specific data points, examples, and evidence where possible
- Step-by-step breakdowns
- Pros and cons analysis when relevant
- Actionable recommendations
Take your time and be exhaustive in your analysis.`;

// ── AI Provider helpers ──

class AIProviderError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "AIProviderError";
    this.status = status;
  }
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MAX_CONTEXT_MESSAGES_STANDARD = 12;
const MAX_CONTEXT_MESSAGES_DEEP_RESEARCH = 20;
const MAX_MESSAGE_CHARS = 1800;
const MAX_OUTPUT_TOKENS_STANDARD = 512;
const MAX_OUTPUT_TOKENS_DEEP_RESEARCH = 1024;
const RATE_LIMIT_RETRY_AFTER_SECONDS = 60;

type ChatMessagePart = { type: "text"; text?: string } | { type: "image_url"; image_url?: { url: string } };
type ChatMessage = { role: "user" | "assistant"; content: string | ChatMessagePart[] };

function trimText(input: string, max = MAX_MESSAGE_CHARS): string {
  return input.length <= max ? input : `${input.slice(0, max)}…`;
}

function normalizeMessages(rawMessages: unknown, deepResearch: boolean): ChatMessage[] {
  if (!Array.isArray(rawMessages)) return [];

  const normalized = rawMessages
    .map((m) => {
      if (!m || typeof m !== "object") return null;
      const role = (m as { role?: unknown }).role;
      const content = (m as { content?: unknown }).content;
      if (role !== "user" && role !== "assistant") return null;

      if (typeof content === "string") {
        return { role, content: trimText(content) } as ChatMessage;
      }

      if (Array.isArray(content)) {
        const safeParts = content
          .map((part) => {
            if (!part || typeof part !== "object") return null;
            const typed = part as { type?: unknown; text?: unknown; image_url?: { url?: unknown } };

            if (typed.type === "text") {
              return { type: "text", text: trimText(typeof typed.text === "string" ? typed.text : "") } as ChatMessagePart;
            }

            if (typed.type === "image_url" && typeof typed.image_url?.url === "string") {
              return { type: "image_url", image_url: { url: typed.image_url.url } } as ChatMessagePart;
            }

            return null;
          })
          .filter(Boolean) as ChatMessagePart[];

        return { role, content: safeParts } as ChatMessage;
      }

      return null;
    })
    .filter(Boolean) as ChatMessage[];

  const maxContext = deepResearch ? MAX_CONTEXT_MESSAGES_DEEP_RESEARCH : MAX_CONTEXT_MESSAGES_STANDARD;
  return normalized.slice(-maxContext);
}

// ── OpenAI direct call (streaming, OpenAI-compatible SSE) ──

async function callOpenAI(body: Record<string, unknown>, openaiKey: string): Promise<Response> {
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ...body, model: "gpt-4o-mini", stream: true }),
  });
  return resp; // Already OpenAI-compatible SSE
}

// ── Gemini native call (streaming, converted to OpenAI SSE) ──

const GEMINI_MODEL_MAP: Record<string, string> = {
  "google/gemini-2.5-pro": "gemini-2.0-flash",
  "google/gemini-3-flash-preview": "gemini-2.0-flash-lite",
  "google/gemini-2.5-flash": "gemini-2.0-flash",
};

// Each model has its own per-minute quota — more models = more chances
const GEMINI_FALLBACK_MODELS = [
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-flash-8b",
  "gemini-2.0-flash-exp",
];

function convertToGeminiFormat(body: Record<string, unknown>) {
  const messages = body.messages as Array<{ role: string; content: unknown }>;
  const systemInstruction = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");
  const deepResearch = Boolean(body.deepResearch);

  const contents = chatMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts:
      typeof m.content === "string"
        ? [{ text: m.content }]
        : (m.content as Array<{ type: string; text?: string; image_url?: { url: string } }>).map((p) => {
            if (p.type === "text") return { text: p.text || "" };
            if (p.type === "image_url" && p.image_url?.url) {
              const url = p.image_url.url;
              if (url.startsWith("data:")) {
                const [meta, data] = url.split(",");
                const mimeType = meta.split(":")[1]?.split(";")[0] || "image/jpeg";
                return { inline_data: { mime_type: mimeType, data } };
              }
              return { text: `[Image: ${url}]` };
            }
            return { text: "" };
          }),
  }));

  const geminiBody: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: deepResearch ? MAX_OUTPUT_TOKENS_DEEP_RESEARCH : MAX_OUTPUT_TOKENS_STANDARD,
    },
  };
  if (systemInstruction && typeof systemInstruction.content === "string") {
    geminiBody.system_instruction = { parts: [{ text: systemInstruction.content }] };
  }
  return geminiBody;
}

function geminiSSEtoOpenAISSE(response: Response): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  (async () => {
    try {
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (text) {
              await writer.write(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text }, index: 0 }] })}\n\n`));
            }
          } catch {
            /* skip */
          }
        }
      }
      await writer.write(encoder.encode("data: [DONE]\n\n"));
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable);
}

async function callGemini(body: Record<string, unknown>, geminiKey: string): Promise<Response | null> {
  const lovableModel = (body.model as string) || "google/gemini-3-flash-preview";
  const primary = GEMINI_MODEL_MAP[lovableModel] || "gemini-2.0-flash-lite";
  const modelsToTry = Array.from(new Set([primary, ...GEMINI_FALLBACK_MODELS]));
  const geminiBody = convertToGeminiFormat(body);

  // More retries with longer exponential backoff for free tier
  for (let attempt = 0; attempt <= 4; attempt++) {
    for (const model of modelsToTry) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${geminiKey}`;
      try {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
        });

        if (resp.status === 429) {
          await resp.text();
          console.log(`Gemini ${model} rate limited (attempt ${attempt + 1})`);
          continue;
        }

        if (resp.status === 400 || resp.status === 404 || resp.status === 503) {
          const err = await resp.text();
          console.log(`Gemini ${model} unavailable (${resp.status}): ${err.slice(0, 160)}`);
          continue;
        }

        if (resp.ok && resp.body) {
          return geminiSSEtoOpenAISSE(resp);
        }

        return resp;
      } catch (e) {
        console.log(`Gemini ${model} fetch error: ${e}`);
        continue;
      }
    }

    if (attempt < 4) {
      const waitMs = Math.min(1000 * Math.pow(2, attempt), 8000); // 1s, 2s, 4s, 8s
      console.log(`All Gemini models limited, retrying in ${waitMs}ms...`);
      await delay(waitMs);
    }
  }

  return null;
}

// ── Main orchestrator ──

async function callAI(body: Record<string, unknown>, keys: { gemini?: string; openai?: string }): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const errors: string[] = [];

  // 1. Try Lovable AI first (only if no user keys to avoid wasting credits)
  if (LOVABLE_API_KEY && !keys.openai && !keys.gemini) {
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (resp.status !== 402 && resp.status !== 429) return resp;
      await resp.text();
      errors.push(`Lovable AI: ${resp.status}`);
      console.log(`Lovable AI returned ${resp.status}, trying user keys...`);
    } catch (e) {
      errors.push("Lovable AI: network error");
      console.error("Lovable AI failed:", e);
    }
  }

  // 2. Try OpenAI (user's key) — most reliable paid option
  if (keys.openai) {
    try {
      const resp = await callOpenAI(body, keys.openai);
      if (resp.ok) return resp;
      const t = await resp.text();
      errors.push(`OpenAI: ${resp.status}`);
      console.log(`OpenAI failed: ${resp.status} ${t.slice(0, 200)}`);
      if (resp.status === 401) {
        throw new AIProviderError(401, "OpenAI API key is invalid. Please update it in Settings.");
      }
    } catch (e) {
      if (e instanceof AIProviderError) throw e;
      errors.push("OpenAI: error");
      console.error("OpenAI error:", e);
    }
  }

  // 3. Try Gemini — try user key first, then server key (separate quotas)
  const userGeminiKey = keys.gemini;
  const serverGeminiKey = Deno.env.get("GEMINI_API_KEY");
  const geminiKeysToTry = Array.from(new Set([userGeminiKey, serverGeminiKey].filter(Boolean))) as string[];

  for (const gk of geminiKeysToTry) {
    const label = gk === userGeminiKey ? "user" : "server";
    const resp = await callGemini(body, gk);
    if (resp) {
      if (resp.ok || (resp.body && resp.status === 200)) return resp;
      errors.push(`Gemini(${label}): ${resp.status}`);
    } else {
      errors.push(`Gemini(${label}): all models rate limited`);
    }
  }

  // 4. Last resort: try Lovable AI even with user keys
  if (LOVABLE_API_KEY && (keys.openai || keys.gemini)) {
    try {
      const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (resp.status !== 402 && resp.status !== 429) return resp;
      await resp.text();
      errors.push(`Lovable AI fallback: ${resp.status}`);
    } catch {
      /* already tried */
    }
  }

  const detail = errors.join("; ");
  console.error("All AI providers failed:", detail);
  throw new AIProviderError(
    429,
    `All AI providers are temporarily unavailable due to rate limits. Please wait about ${RATE_LIMIT_RETRY_AFTER_SECONDS} seconds and try again, or use a fresh Gemini key in Settings.`
  );
}

// ── Edge function handler ──

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages: rawMessages, persona, deepResearch } = await req.json();
    const isDeepResearch = Boolean(deepResearch);
    const safeMessages = normalizeMessages(rawMessages, isDeepResearch);

    if (safeMessages.length === 0) {
      return new Response(JSON.stringify({ error: "Please enter a message first." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user's API keys
    let userKeys: { gemini?: string; openai?: string } = {};
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const supabase = createClient(supabaseUrl, supabaseKey);
        const token = authHeader.replace("Bearer ", "");
        const {
          data: { user },
        } = await supabase.auth.getUser(token);
        if (user) {
          const { data: settings } = await supabase
            .from("user_settings")
            .select("gemini_api_key, openai_api_key")
            .eq("user_id", user.id)
            .single();
          if (settings?.gemini_api_key) userKeys.gemini = settings.gemini_api_key;
          if (settings?.openai_api_key) userKeys.openai = settings.openai_api_key;
        }
      } catch (e) {
        console.log("Could not fetch user API keys:", e);
      }
    }

    let systemPrompt = SYSTEM_PROMPTS[persona] || SYSTEM_PROMPTS.friend;
    if (isDeepResearch) systemPrompt += DEEP_RESEARCH_SUFFIX;

    const model = isDeepResearch ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

    const response = await callAI(
      {
        model,
        deepResearch: isDeepResearch,
        messages: [{ role: "system", content: systemPrompt }, ...safeMessages],
        stream: true,
      },
      userKeys
    );

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      const status = response.status;
      const msg =
        status === 429
          ? `Rate limit exceeded. Please wait about ${RATE_LIMIT_RETRY_AFTER_SECONDS} seconds and try again.`
          : status === 402
            ? "AI credits exhausted. Please add credits or use your API keys in Settings."
            : "AI service temporarily unavailable. Please try again.";
      return new Response(JSON.stringify({ error: msg }), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          ...(status === 429 ? { "Retry-After": String(RATE_LIMIT_RETRY_AFTER_SECONDS) } : {}),
        },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    if (e instanceof AIProviderError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          ...(e.status === 429 ? { "Retry-After": String(RATE_LIMIT_RETRY_AFTER_SECONDS) } : {}),
        },
      });
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
