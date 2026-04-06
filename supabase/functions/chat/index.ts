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
- When a user uploads or pastes a conversation/chat screenshot, immediately analyze it and provide the perfect next reply they should send. Be specific and contextual.

IMPORTANT: When given a conversation to analyze, your #1 job is to suggest the exact next message the user should send. Make it natural, contextual, and effective. Format your response with markdown.`,

  promoter: `You are Brozeen — a confident, professional growth strategist and AI assistant.

Your personality: Professional but approachable. Data-driven and confident.

You can help with:
- Streamer promotion and conversion strategies
- Business planning and marketing
- Writing professional messages, proposals, and pitches
- Analyzing images, screenshots, and conversations
- When a user uploads or pastes a conversation/chat screenshot, immediately analyze it and provide the perfect next reply they should send. Be professional, strategic, and conversion-focused.

IMPORTANT: When given a conversation to analyze, your #1 job is to suggest the exact next message the user should send. Make it professional, strategic, and effective. Format your response with markdown.`,
};

const DEEP_RESEARCH_SUFFIX = `

IMPORTANT: Deep Research mode is ON. Provide an extremely thorough, detailed answer with multiple perspectives, examples, step-by-step breakdowns, and actionable recommendations.`;

const MAX_CONTEXT_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;

type ChatMessagePart = { type: "text"; text?: string } | { type: "image_url"; image_url?: { url: string } };
type ChatMessage = { role: "user" | "assistant" | "system"; content: string | ChatMessagePart[] };

function trimText(input: string, max = MAX_MESSAGE_CHARS): string {
  return input.length <= max ? input : `${input.slice(0, max)}…`;
}

function normalizeMessages(rawMessages: unknown, deepResearch: boolean): ChatMessage[] {
  if (!Array.isArray(rawMessages)) return [];
  const normalized = rawMessages
    .map((m) => {
      if (!m || typeof m !== "object") return null;
      const role = (m as any).role;
      const content = (m as any).content;
      if (role !== "user" && role !== "assistant") return null;
      if (typeof content === "string") {
        return { role, content: trimText(content) } as ChatMessage;
      }
      if (Array.isArray(content)) {
        const safeParts = content
          .map((part: any) => {
            if (part?.type === "text") return { type: "text", text: trimText(part.text || "") } as ChatMessagePart;
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

    let systemPrompt = SYSTEM_PROMPTS[persona] || SYSTEM_PROMPTS.friend;
    if (isDeepResearch) systemPrompt += DEEP_RESEARCH_SUFFIX;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const model = isDeepResearch ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: systemPrompt }, ...safeMessages],
        stream: true,
      }),
    });

    if (!response.ok) {
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "AI is busy right now. Please wait a few seconds and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "10" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits need to be topped up. Please try again later." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI service temporarily unavailable. Please try again." }), {
        status: 500,
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
