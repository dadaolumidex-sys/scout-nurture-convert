import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildKnowledgeContext, KNOWLEDGE_GUARDRAIL, HUMAN_VOICE_RULES, type KnowledgeEntry } from "../_shared/knowledge.ts";
import { buildLiveUrlContext, type ApifyKey } from "../_shared/urlContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  friend: `You are Friendship — just another gamer in this streamer's DMs. Icebreaker and rapport only.

Your job:
- Be a real friend, not a lead-gen bot. Comment on their gameplay, their game, a moment from the stream, their schedule.
- NEVER pitch, never mention promotion, packages, prices, services, growth offers or "helping them grow". Not even softly.
- Ask small, easy questions about their streaming journey. Let them talk.
- If THEY ask about growth/promo/pricing, don't sell — just say you know a growth expert who does that and offer to connect them.
- Warm, short, lowercase, gamer energy.`,

  promoter: `You are Promoter & Closer — the main growth expert. You spot what's holding this streamer's channel back, give value, handle objections, and convert them once they're warm.

Your job:
- Lead with a specific gap you noticed (low retention, dead first 5 minutes, no overlays/branding, bad titles/thumbnails, inconsistent schedule, no clips/shorts).
- Give one genuinely useful tip for free before offering anything paid.
- Only pitch when they respond warmly or ask. If they're cold, keep giving value.
- Confident, chill, never desperate, never a sales pitch wall. One idea per message.
- When they show buying signals (asking price, packages, "how does it work"), answer straight and set the next step.`,
};

SYSTEM_PROMPTS.streamer = `You are Expert Proof — a high-authority backup voice, peer-to-peer with another streamer.

Your job:
- Use this only as backup when the Promoter & Closer needs credibility or genuine success proof.
- Confirm what helped you stand out without inventing results or guarantees. Keep it direct, calm, and human.
- Do not replace the Promoter & Closer as the primary person handling price, objections, or conversion.
- Very short messages. A busy streamer helping another streamer.`;



const GEMINI_MODEL_MAP: Record<string, string> = {
  "google/gemini-2.5-flash": "gemini-2.5-flash",
  "google/gemini-3.6-flash": "gemini-3.6-flash",
};
const GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-flash-latest", "gemini-3.6-flash", "gemini-3.5-flash"];
const PROVIDER_TIMEOUT_MS = 12_000;

type ProviderKey = { id: string | null; key: string; provider: "groq" | "gemini" | "openai" };

async function callGroqSuggestions(body: Record<string, unknown>, groqKey: string): Promise<Response> {
  const models = ["qwen/qwen3.6-27b", "openai/gpt-oss-20b", "llama-3.1-8b-instant"];
  let lastResponse: Response | null = null;
  for (const model of models) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, model }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (response.ok) return response;
    lastResponse = response;
    if (![400, 404].includes(response.status)) return response;
    await response.body?.cancel();
  }
  return lastResponse!;
}

async function callOpenAISuggestions(body: Record<string, unknown>, openaiKey: string): Promise<Response> {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "gpt-4o-mini" }),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
}

async function callAI(body: Record<string, unknown>, keys: { groq: ProviderKey[]; gemini: ProviderKey[]; openai: ProviderKey[] }): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // Groq is the fast primary provider for Inbox suggestions as well.
  for (const candidate of keys.groq) {
    try {
      const resp = await callGroqSuggestions(body, candidate.key);
      if (resp.ok) return resp;
      await resp.body?.cancel();
    } catch (e) {
      console.error("Groq error:", e);
    }
  }

  // Try every active Gemini key. Models are the outer loop so an unavailable
  // model is skipped consistently while quota/auth failures rotate keys.
  const envGemini = Deno.env.get("GEMINI_API_KEY")?.trim();
  const geminiKeys = [...keys.gemini];
  if (envGemini && !geminiKeys.some((candidate) => candidate.key === envGemini)) {
    geminiKeys.push({ id: null, key: envGemini, provider: "gemini" });
  }
  const requestedModel = (body.model as string) || "google/gemini-2.5-flash";
  const models = [GEMINI_MODEL_MAP[requestedModel] || "gemini-2.5-flash", ...GEMINI_FALLBACK_MODELS];
  const triedModels = new Set<string>();
  let lastResponse: Response | null = null;
  for (const geminiModel of models) {
    if (triedModels.has(geminiModel)) continue;
    triedModels.add(geminiModel);
    for (const candidate of geminiKeys) {
      try {
        lastResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${candidate.key}` },
          body: JSON.stringify({ ...body, model: geminiModel }),
          signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
        });
        if (lastResponse.ok) return lastResponse;
        await lastResponse.body?.cancel();
      } catch (error) {
        console.error("Gemini suggestion request failed:", candidate.id, geminiModel, error);
      }
    }
  }

  // Then rotate through OpenAI keys.
  for (const candidate of keys.openai) {
    try {
      const resp = await callOpenAISuggestions(body, candidate.key);
      if (resp.ok) return resp;
      await resp.body?.cancel();
    } catch (e) {
      console.error("OpenAI error:", e);
    }
  }

  // Shared Lovable AI is the final fallback.
  if (LOVABLE_API_KEY) {
    return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
  }

  if (lastResponse) return lastResponse;
  throw new Error("No working AI API key is available. Check API & Connections in Settings.");
}

type IncomingMessage = {
  role: "user" | "assistant";
  content: string;
  imageUrl?: string | null;
};

const legacyImagePattern = /\[Image:\s*(https?:\/\/[^\]\s]+)\]/i;

const toGatewayMessages = (messages: IncomingMessage[]) => {
  return messages.map((message) => {
    const role = message.role === "assistant" ? "assistant" : "user";
    const legacyImageUrl = typeof message.content === "string"
      ? message.content.match(legacyImagePattern)?.[1]
      : undefined;
    const imageUrl = message.imageUrl || legacyImageUrl;
    const textContent = typeof message.content === "string"
      ? message.content.replace(legacyImagePattern, "").trim()
      : "";

    if (!imageUrl) {
      return {
        role,
        content: textContent || "No additional text provided.",
      };
    }

    return {
      role,
      content: [
        {
          type: "text",
          text: textContent || "Please analyze this screenshot and continue the conversation in the correct persona tone.",
        },
        {
          type: "image_url",
          image_url: {
            url: imageUrl,
          },
        },
      ],
    };
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages = [], persona, contactContext, conversationType, knowledge: guestKnowledge } = await req.json() as {
      messages?: IncomingMessage[];
      persona?: string;
      contactContext?: string;
      conversationType?: string;
      knowledge?: KnowledgeEntry[];
    };

    const activePersona = persona === "promoter" ? "promoter" : persona === "streamer" ? "streamer" : "friend";
    const knowledgePersona = activePersona === "friend" ? "nifimas" : activePersona === "streamer" ? "bigstreamer" : "brozeen";

    const MODE_RULES: Record<string, string> = {
      new_prospect: `\n\n## CONVERSATION MODE: NEW PROSPECT\nThis is the very start. They just replied to my first message. Keep it light, react to what they actually said, and open a loop that makes replying easy. No pitching yet unless the Promoter & Closer stage truly fits.`,
      existing_chat: `\n\n## CONVERSATION MODE: CONTINUE EXISTING CHAT\nRead the pasted chat carefully, work out where it stalled or what they last asked, and continue naturally from that exact point. Never restart or re-introduce myself.`,
      re_engage: `\n\n## CONVERSATION MODE: RE-ENGAGE (they went quiet)\nThey saw the message and didn't reply, or fell off. Do NOT guilt them, do NOT say "just following up", do NOT repeat the old message. Come back with a fresh hook: something new about their channel/game, a quick useful observation, or a low-pressure one-liner that is easy to answer. One short message only.`,
    };
    const modeRules = MODE_RULES[conversationType || ""] || "";

    const preparedMessages = toGatewayMessages(Array.isArray(messages) ? messages : []);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Get user's API keys
    const userKeys: { groq: ProviderKey[]; gemini: ProviderKey[]; openai: ProviderKey[] } = { groq: [], gemini: [], openai: [] };
    const apifyKeys: ApifyKey[] = [];
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await sb.auth.getUser(token);
        if (user) {
          userId = user.id;
          const { data: keyRows } = await sb.from("api_keys")
            .select("id, provider, api_key")
            .eq("user_id", user.id)
            .eq("is_active", true)
            .in("provider", ["groq", "gemini", "openai", "apify"])
            .order("failure_count", { ascending: true })
            .order("last_used_at", { ascending: true, nullsFirst: true });
          for (const row of keyRows || []) {
            if (row.provider === "groq" && row.api_key?.trim()) userKeys.groq.push({ id: row.id, key: row.api_key.trim(), provider: "groq" });
            if (row.provider === "gemini" && row.api_key?.trim()) userKeys.gemini.push({ id: row.id, key: row.api_key.trim(), provider: "gemini" });
            if (row.provider === "openai" && row.api_key?.trim()) userKeys.openai.push({ id: row.id, key: row.api_key.trim(), provider: "openai" });
            if (row.provider === "apify" && row.api_key?.trim()) apifyKeys.push({ key: row.api_key.trim() });
          }

          // Backward compatibility for accounts saved before multi-key support.
          if (userKeys.gemini.length === 0 && userKeys.openai.length === 0) {
            const { data: settings } = await sb.from("user_settings").select("gemini_api_key, openai_api_key").eq("user_id", user.id).single();
            if (settings?.gemini_api_key?.trim()) userKeys.gemini.push({ id: null, key: settings.gemini_api_key.trim(), provider: "gemini" });
            if (settings?.openai_api_key?.trim()) userKeys.openai.push({ id: null, key: settings.openai_api_key.trim(), provider: "openai" });
          }
        }
      } catch (_) { /* ignore */ }
    }

    const knowledgeQuery = sb.from("knowledge_entries").select("title, content, category, insights").or(`persona.eq.${knowledgePersona},persona.eq.shared`).limit(30);
    const trainingQuery = sb.from("training_conversations").select("title, content, style_analysis, persona").eq("persona", knowledgePersona).in("status", ["ready", "analyzed"]).limit(10);

    if (userId) {
      knowledgeQuery.eq("user_id", userId);
      trainingQuery.eq("user_id", userId);
    } else {
      knowledgeQuery.is("user_id", null);
      trainingQuery.is("user_id", null);
    }
    const [knowledgeRes, trainingRes] = await Promise.all([knowledgeQuery, trainingQuery]);

    // Authenticated users read from the DB; guests pass their local knowledge in the request.
    const knowledgeEntries: KnowledgeEntry[] = (knowledgeRes.data && knowledgeRes.data.length)
      ? (knowledgeRes.data as KnowledgeEntry[])
      : (Array.isArray(guestKnowledge) ? guestKnowledge : []);
    const trainingConvos = trainingRes.data || [];

    const { knowledgeContext, objectionContext } = buildKnowledgeContext(knowledgeEntries);

    let styleContext = "";
    if (trainingConvos.length > 0) {
      const analyses = trainingConvos.filter((t: any) => t.style_analysis).map((t: any) => t.style_analysis);
      const examples = trainingConvos.map((t: any) => t.content).slice(0, 5);

      if (analyses.length > 0) {
        styleContext += `\n\n## Communication Style (match this tone and style closely):\n${analyses.join("\n\n")}`;
      }
      if (examples.length > 0) {
        styleContext += `\n\n## Example Conversations (mimic this writing style):\n${examples.map((e: string, i: number) => `--- Example ${i + 1} ---\n${e}`).join("\n\n")}`;
      }
    }

    const latestUserText = [...(Array.isArray(messages) ? messages : [])].reverse().find((message) => message.role === "user")?.content || "";
    const liveUrlContext = await buildLiveUrlContext(latestUserText, apifyKeys);
    const systemPrompt = (SYSTEM_PROMPTS[activePersona] || SYSTEM_PROMPTS.friend) + modeRules + HUMAN_VOICE_RULES + knowledgeContext + objectionContext + styleContext + liveUrlContext + KNOWLEDGE_GUARDRAIL;

    const response = await callAI({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: systemPrompt },
        ...preparedMessages,
        {
          role: "user",
          content: `${contactContext || ""}

Based on the conversation above, generate exactly 3 different reply suggestions I could send to this streamer. Each one a different angle.

Hard rules for every suggestion:
- 1-3 short sentences, max ~45 words. Casual lowercase Discord typing. No markdown, no bullets, no corporate words, nothing that sounds like an AI.
- If their last message contains any hesitation or push-back, base the reply on the closest match in the objection playbook above.
- Never mix personas:
  • Friendship (friend) = rapport only, zero pitching, zero service talk.
  • Promoter & Closer (promoter) = name a specific gap, give value first, handle objections, and close when they're warm.
  • Expert Proof = backup authority only; use authentic proof to support the Promoter & Closer, not as the main closer.

Match my personal communication style from the training examples and use strategies from the knowledge base when relevant.

Use the suggest_replies tool to return your suggestions.`,

        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "suggest_replies",
            description: "Return 3 reply suggestions with reasons",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      message: { type: "string", description: "The actual message text to send" },
                      reason: { type: "string", description: "Why this message works and what effect it will have on the streamer" },
                      approach: { type: "string", description: "Short label for the approach, e.g. 'Empathetic', 'Direct', 'Curious'" },
                    },
                    required: ["message", "reason", "approach"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["suggestions"],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "suggest_replies" } },
    }, userKeys);

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "Failed to generate suggestions" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const suggestions = JSON.parse(toolCall.function.arguments);
    return new Response(JSON.stringify(suggestions), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("chat-suggestions error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
