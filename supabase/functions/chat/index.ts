import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildKnowledgeContext, KNOWLEDGE_GUARDRAIL, type KnowledgeEntry } from "../_shared/knowledge.ts";
import { buildLiveUrlContext, type ApifyKey } from "../_shared/urlContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const FORMAT_RULES = `

FORMATTING RULES (always follow):
- Structure every answer with clear markdown: short intro, then \`##\` headings for sections when helpful.
- Use bullet points or numbered lists for steps, options, or multiple items — never cram everything into one long paragraph.
- Use **bold** for key terms, and code blocks for code or commands.
- Keep paragraphs short (2-3 sentences). Leave blank lines between sections so the answer is easy to scan.
- End with a brief takeaway or next step when relevant.`;

const SYSTEM_PROMPTS: Record<string, string> = {
  friend: `You are Friendship — a smart, friendly, all-purpose AI assistant. You can help with ANY topic: general knowledge, writing, coding, math, business, marketing, study help, life advice, gaming, streaming, and more.

Your personality: Casual and supportive, like talking to a knowledgeable friend. Use emojis naturally but not excessively.

Always:
- Answer any question thoroughly and accurately, whatever the subject.
- If a user uploads or pastes a conversation/chat screenshot, analyze it and suggest the perfect next reply.
- If you are unsure or a fact may be outdated, say so honestly instead of guessing.${FORMAT_RULES}`,

  promoter: `You are Promoter & Closer — a confident, professional, all-purpose AI assistant and growth strategist. You can help with ANY topic: business, marketing, writing, research, planning, coding, analysis, growth, and general questions.

Your personality: Professional but approachable. Data-driven, structured, and confident.

Always:
- Give clear, actionable, well-organized answers on any subject.
- When given a conversation or screenshot, analyze it and suggest the exact next message to send.
- If you are unsure or a fact may be outdated, say so honestly instead of guessing.${FORMAT_RULES}`,
};

const DEEP_RESEARCH_SUFFIX = `

IMPORTANT: Deep Research mode is ON. Carefully review the available conversation, saved knowledge, screenshots, and any supplied link before answering. Provide a thorough, structured answer with multiple perspectives, examples, step-by-step breakdowns, and actionable recommendations. Separate confirmed facts from recommendations, and never pretend you verified information that was not supplied or could not be read.`;

const MAX_CONTEXT_MESSAGES = 20;
const NORMAL_MEMORY_LIMIT = 24;
const NORMAL_PROVIDER_TIMEOUT_MS = 18_000;
const DEEP_RESEARCH_TIMEOUT_MS = 60_000;
const CHAT_FUNCTION_VERSION = "gemini-3-rotation-v3";

type ChatMessagePart = { type: "text"; text?: string } | { type: "image_url"; image_url?: { url: string } };
type ChatMessage = { role: "user" | "assistant" | "system"; content: string | ChatMessagePart[] };
type ProviderKey = { id: string | null; key: string; provider: "gemini" | "openai" };

const GEMINI_MODEL_MAP: Record<string, string> = {
  "google/gemini-2.5-flash": "gemini-2.5-flash",
  "google/gemini-3.6-flash": "gemini-3.6-flash",
  "google/gemini-3.5-flash": "gemini-3.5-flash",
};

function normalizeMessages(rawMessages: unknown, maxContextMessages = MAX_CONTEXT_MESSAGES): ChatMessage[] {
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
  const recent = normalized.slice(-maxContextMessages);

  // Re-sending every historical base64 screenshot makes each later request
  // progressively larger and can cause image chats to appear stuck or time out.
  // Keep visual data only on the newest user message that contains an image;
  // older screenshots remain represented by their accompanying text.
  let newestImageMessage = -1;
  for (let i = recent.length - 1; i >= 0; i--) {
    const message = recent[i];
    if (message.role === "user" && Array.isArray(message.content) && message.content.some((part) => part.type === "image_url")) {
      newestImageMessage = i;
      break;
    }
  }

  return recent.map((message, index) => {
    if (!Array.isArray(message.content) || index === newestImageMessage) return message;
    const textParts = message.content.filter((part) => part.type === "text");
    return {
      ...message,
      content: textParts.length ? textParts : [{ type: "text", text: "[Earlier screenshot omitted]" }],
    };
  });
}

async function callLovable(body: Record<string, unknown>, key: string, deep: boolean) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(deep ? DEEP_RESEARCH_TIMEOUT_MS : NORMAL_PROVIDER_TIMEOUT_MS),
  });
}

async function callOpenAI(body: Record<string, unknown>, key: string, deep: boolean) {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: deep ? "gpt-4o" : "gpt-4o-mini" }),
    signal: AbortSignal.timeout(deep ? DEEP_RESEARCH_TIMEOUT_MS : NORMAL_PROVIDER_TIMEOUT_MS),
  });
}

async function tryGeminiWithFallbacks(body: Record<string, unknown>, key: string, primaryModel: string, deep: boolean) {
  const primary = GEMINI_MODEL_MAP[primaryModel] || "gemini-2.5-flash";
  // Keep the hosted fallback fast. Trying a long list after a failed key made
  // a normal reply wait far too long before another saved key was tried.
  const models = [primary, "gemini-flash-latest"];
  const tried = new Set<string>();
  let lastErr = "";
  for (const m of models) {
    if (tried.has(m)) continue;
    tried.add(m);
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model: m }),
        signal: AbortSignal.timeout(deep ? DEEP_RESEARCH_TIMEOUT_MS : NORMAL_PROVIDER_TIMEOUT_MS),
      });
      if (r.ok) return { ok: true as const, response: r };
      lastErr = `${m}:${r.status}`;
      await r.body?.cancel();
      console.log("Gemini model failed:", lastErr);
      if ([401, 403, 429].includes(r.status)) break;
    } catch (e) { console.error("Gemini err:", m, e); lastErr = `${m}:err`; }
  }
  return { ok: false as const, error: lastErr };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages: rawMessages, persona, deepResearch, memory, knowledge: guestKnowledge } = await req.json();
    const isDeepResearch = Boolean(deepResearch);
    const safeMessages = normalizeMessages(rawMessages, isDeepResearch ? 50 : MAX_CONTEXT_MESSAGES);
    const memoryFacts: string[] = Array.isArray(memory)
      ? memory.filter((m: unknown) => typeof m === "string" && (m as string).trim()).slice(0, isDeepResearch ? 60 : NORMAL_MEMORY_LIMIT)
      : [];

    if (safeMessages.length === 0) {
      return new Response(JSON.stringify({ error: "Please enter a message first." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt = SYSTEM_PROMPTS[persona] || SYSTEM_PROMPTS.friend;
    if (isDeepResearch) systemPrompt += DEEP_RESEARCH_SUFFIX;
    if (memoryFacts.length > 0) {
      systemPrompt += `\n\nLONG-TERM MEMORY about this user (from previous chats — use it naturally to give personalized, context-aware answers; don't mention that you have memory unless asked):\n- ${memoryFacts.join("\n- ")}`;
    }

    // Get user's API keys (fallback chain) and their saved knowledge / objection playbook.
    const userKeys: { gemini: ProviderKey[]; openai: ProviderKey[] } = { gemini: [], openai: [] };
    const apifyKeys: ApifyKey[] = [];
    let adminClient: ReturnType<typeof createClient> | null = null;
    let dbKnowledge: KnowledgeEntry[] = [];
    const personaKey = persona === "promoter" ? "brozeen" : "nifimas";
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const sb = createClient(supabaseUrl, supabaseKey);
      adminClient = sb;
      const authHeader = req.headers.get("authorization");
      if (authHeader) {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await sb.auth.getUser(token);
        if (user) {
          const { data: keyRows } = await sb.from("api_keys")
            .select("id, provider, api_key")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .in("provider", ["gemini", "openai", "apify"])
            .order("failure_count", { ascending: true })
            .order("last_used_at", { ascending: true, nullsFirst: true });
          for (const row of keyRows || []) {
            if (row.provider === "gemini" && row.api_key?.trim()) userKeys.gemini.push({ id: row.id, key: row.api_key.trim(), provider: "gemini" });
            if (row.provider === "openai" && row.api_key?.trim()) userKeys.openai.push({ id: row.id, key: row.api_key.trim(), provider: "openai" });
            if (row.provider === "apify" && row.api_key?.trim()) apifyKeys.push({ key: row.api_key.trim() });
          }
          const { data: kn } = await sb.from("knowledge_entries")
            .select("title, content, category, insights")
            .eq("user_id", user.id)
            .or(`persona.eq.${personaKey},persona.eq.shared`)
            .limit(isDeepResearch ? 20 : 12);
          if (Array.isArray(kn)) dbKnowledge = kn as KnowledgeEntry[];
        }
      }
    } catch (_) { /* ignore */ }

    // Auth users read from the DB; guests send their local knowledge in the request.
    const knowledgeEntries: KnowledgeEntry[] = dbKnowledge.length
      ? dbKnowledge
      : (Array.isArray(guestKnowledge) ? guestKnowledge : []);
    const { knowledgeContext, objectionContext } = buildKnowledgeContext(knowledgeEntries);
    if (knowledgeContext || objectionContext) {
      systemPrompt += knowledgeContext + objectionContext + KNOWLEDGE_GUARDRAIL;
    }

    const latestUserText = [...safeMessages].reverse().find((message) => message.role === "user");
    const linkText = typeof latestUserText?.content === "string"
      ? latestUserText.content
      : (latestUserText?.content || []).filter((part) => part.type === "text").map((part) => part.text || "").join(" ");
    systemPrompt += await buildLiveUrlContext(linkText, apifyKeys);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const ENV_GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    const model = "google/gemini-2.5-flash";

    const body = {
      model,
      messages: [{ role: "system", content: systemPrompt }, ...safeMessages],
      stream: true,
      // Deep research must have enough room to finish multi-step analysis.
      // Normal chat remains capped to keep ordinary reply suggestions quick.
      max_tokens: isDeepResearch ? 6000 : 1600,
    };

    let response: Response | null = null;
    let lastErr = "";

    const recordKeyResult = async (candidate: ProviderKey, ok: boolean, error = "") => {
      if (!adminClient || !candidate.id) return;
      try {
        if (ok) {
          await adminClient.from("api_keys").update({
            failure_count: 0, last_error: null, last_used_at: new Date().toISOString(), updated_at: new Date().toISOString(),
          }).eq("id", candidate.id);
          return;
        }
        const { data } = await adminClient.from("api_keys").select("failure_count").eq("id", candidate.id).single();
        const failures = Number(data?.failure_count || 0) + 1;
        await adminClient.from("api_keys").update({
          failure_count: failures,
          last_error: error.slice(0, 300),
          updated_at: new Date().toISOString(),
        }).eq("id", candidate.id);
      } catch (updateError) {
        console.error("Could not update API key health:", updateError);
      }
    };

    // 1. Rotate through every active Gemini key. The healthiest/least recently
    // used key is first because the database query above orders it that way.
    const geminiCandidates: ProviderKey[] = [...userKeys.gemini];
    if (ENV_GEMINI_KEY && !geminiCandidates.some((candidate) => candidate.key === ENV_GEMINI_KEY)) {
      geminiCandidates.push({ id: null, key: ENV_GEMINI_KEY, provider: "gemini" });
    }
    for (const candidate of geminiCandidates) {
      const result = await tryGeminiWithFallbacks(body, candidate.key, model, isDeepResearch);
      if (result.ok) {
        response = result.response;
        await recordKeyResult(candidate, true);
        break;
      }
      lastErr = `Gemini ${result.error}`;
      await recordKeyResult(candidate, false, lastErr);
    }

    // 2. Rotate through every active OpenAI key.
    for (const candidate of response ? [] : userKeys.openai) {
      try {
        const r = await callOpenAI(body, candidate.key, isDeepResearch);
        if (r.ok) {
          response = r;
          await recordKeyResult(candidate, true);
          break;
        }
        lastErr = `OpenAI ${r.status}`;
        await r.body?.cancel();
        await recordKeyResult(candidate, false, lastErr);
      } catch (e) {
        lastErr = "OpenAI timeout";
        console.error("OpenAI err:", e);
        await recordKeyResult(candidate, false, lastErr);
      }
    }

    // 3. Shared Lovable gateway is the last fallback, so a slow shared
    // allowance never delays users who supplied their own provider key.
    if (!response && LOVABLE_API_KEY) {
      try {
        const r = await callLovable(body, LOVABLE_API_KEY, isDeepResearch);
        if (r.ok) response = r;
        else { lastErr = `Lovable ${r.status}`; await r.body?.cancel(); console.log("Lovable failed:", r.status); }
      } catch (e) { console.error("Lovable err:", e); lastErr = "Lovable timeout"; }
    }

    if (!response) {
      const hasUserKey = userKeys.openai.length > 0 || userKeys.gemini.length > 0;
      const isCredit = lastErr.includes("402") || lastErr.includes("429");
      const isRejected = lastErr.includes("401") || lastErr.includes("403");
      // code lets the UI show an actionable banner (add-key CTA)
      let code = "unknown";
      let msg = "";
      if (isCredit && !hasUserKey) {
        code = "add_key";
        msg = "The shared AI allowance is used up for now. Add your own FREE Gemini key in Settings → API Keys (get one in 30 seconds at aistudio.google.com/apikey) and you'll never hit this limit again.";
      } else if (isCredit && hasUserKey) {
        code = "rate_limited";
        msg = "Your AI key is busy or out of quota right now. Wait a moment, or add another key in Settings → API Keys for automatic backup.";
      } else if (isRejected) {
        code = "bad_key";
        msg = "Your saved AI key was rejected. Update it in Settings → API Keys.";
      } else if (!hasUserKey) {
        code = "add_key";
        msg = "AI is temporarily unavailable. Add your own free Gemini key in Settings → API Keys to keep chatting without interruptions.";
      } else {
        code = "unknown";
        msg = `AI providers failed (${lastErr || "unknown"}). Check your keys in Settings → API Keys.`;
      }
      return new Response(JSON.stringify({ error: msg, code }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-StreamScout-Chat-Version": CHAT_FUNCTION_VERSION },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
