import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildKnowledgeContext, KNOWLEDGE_GUARDRAIL, HUMAN_VOICE_RULES, type KnowledgeEntry } from "../_shared/knowledge.ts";
import { buildLiveUrlContext, type ApifyKey } from "../_shared/urlContext.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  friend: `Voice preference: warm, relaxed, and human — like a friendly peer in a DM.

Use a gaming or streaming reference only when the actual conversation makes it relevant. Do not turn an ordinary conversation into lead generation, and do not mention services, prices, or growth unless the app user's direction or the client raises it.`,

  promoter: `Voice preference: clear, confident, helpful, and human.

When the conversation is genuinely about the user's service, growth, a price, or an objection, give a useful and honest response before proposing a next step. Otherwise, follow the actual conversation and the app user's direction without forcing a sales pitch.`,
};

SYSTEM_PROMPTS.streamer = `Voice preference: direct, calm, credible, and peer-to-peer.

Use authority or proof only when it is real and relevant to the client's message. Never invent results, credentials, or promises, and never override the app user's current instruction.`;



// Inbox is an operator tool. The person using the app is never the streamer
// being replied to, even though pasted client messages use the "user" role.
const INBOX_OPERATOR_RULES = `

## INBOX OPERATOR RULES — FOLLOW THESE FIRST
- You help the app user draft a message they will copy and send to the CLIENT/STREAMER. You are NOT chatting with the app user and you are NOT the client.
- Role map: messages marked "user" are the CLIENT'S messages; messages marked "assistant" are the user's previous selected replies. Never answer a "user" message as though it was addressed to you.
- The newest private reply direction is the app user's instruction. Follow it first unless it conflicts with safety or the actual client conversation. Treat it as private; never mention it in the suggested message.
- Use the exact latest real client message as the thing to answer. A pasted message may be a complete Discord/DM transcript containing both people: carefully identify who said the final line and reply to that person from the app user's side.
- Reply like a thoughtful general AI assistant, not a rigid sales bot. Use sales psychology, saved training, and objection handling only when they fit the actual conversation and the user's goal.
- Never invent a client goal, price, proof, service, stream detail, or objection. If the client is simply talking normally, respond naturally instead of forcing a pitch.
- Return only ready-to-copy replies that the app user can send to the client. Do not greet the app user, ask them for details, or role-play as the client.
`;

const GEMINI_MODEL_MAP: Record<string, string> = {
  "google/gemini-2.5-flash": "gemini-2.5-flash",
  "google/gemini-3.7-flash": "gemini-3.7-flash",
  "google/gemini-3.6-flash": "gemini-3.6-flash",
  "google/gemini-3.5-flash": "gemini-3.5-flash",
  "google/gemini-3.1-pro-preview": "gemini-3.1-pro-preview",
};
const GEMINI_FALLBACK_MODELS = ["gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash"];
// Inbox replies need the same breathing room as normal chat. A 12-second
// deadline regularly cut off Gemini before it could read a pasted transcript.
const PROVIDER_TIMEOUT_MS = 35_000;

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

  // Try every active Gemini key first. Inbox reply suggestions are a quality
  // task, so 3.6 Flash is deliberately preferred over the fast Groq fallback.
  // Models are the outer loop so an unavailable
  // model is skipped consistently while quota/auth failures rotate keys.
  const envGemini = Deno.env.get("GEMINI_API_KEY")?.trim();
  const geminiKeys = [...keys.gemini];
  if (envGemini && !geminiKeys.some((candidate) => candidate.key === envGemini)) {
    geminiKeys.push({ id: null, key: envGemini, provider: "gemini" });
  }
  const requestedModel = (body.model as string) || "google/gemini-3.7-flash";
  const models = [GEMINI_MODEL_MAP[requestedModel] || "gemini-3.7-flash", ...GEMINI_FALLBACK_MODELS];
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

  // Groq remains a last-resort fast backup, never the source of the normal
  // inbox voice or reply quality.
  for (const candidate of keys.groq) {
    try {
      const resp = await callGroqSuggestions(body, candidate.key);
      if (resp.ok) return resp;
      await resp.body?.cancel();
    } catch (e) {
      console.error("Groq error:", e);
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
      new_prospect: `\n\n## CONVERSATION MODE: NEW PROSPECT\nThis is the start of the relationship. Reply to what they actually said; keep it easy and genuine. Do not pitch unless the app user's direction clearly asks for it or the client invited it.`,
      existing_chat: `\n\n## CONVERSATION MODE: CONTINUE EXISTING CHAT\nRead the pasted chat carefully, work out where it stopped and what the client last said or asked, then continue naturally from that exact point. Never restart or re-introduce yourself.`,
      re_engage: `\n\n## CONVERSATION MODE: RE-ENGAGE\nThey went quiet. Make one fresh, low-pressure message that is easy to answer. Do not guilt them or repeat an old pitch.`,
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
    // Uploaded playbooks and training examples can be very large. Keep the
    // useful reference material while avoiding a request too large for the AI
    // provider when someone has trained the workspace heavily.
    const compactStyleContext = styleContext.slice(0, 3_000);
    const systemPrompt = (SYSTEM_PROMPTS[activePersona] || SYSTEM_PROMPTS.friend)
      + INBOX_OPERATOR_RULES
      + modeRules
      + HUMAN_VOICE_RULES
      + knowledgeContext.slice(0, 5_000)
      + objectionContext.slice(0, 3_500)
      + compactStyleContext
      + liveUrlContext
      + KNOWLEDGE_GUARDRAIL;

    const response = await callAI({
      model: "google/gemini-3.7-flash",
      messages: [
        { role: "system", content: systemPrompt },
        ...preparedMessages,
        {
          role: "user",
          content: `${contactContext || ""}

Based on the conversation above, generate exactly ONE best ready-to-copy reply I can send to this person.

Hard rules:
- Usually keep the reply to 1-3 short sentences, but use up to 80 words if the client asks a real question that needs a fuller answer.
- Casual, natural Discord/DM writing. No markdown, no bullets, no corporate words, and nothing that sounds scripted or like an AI.
- Answer the client's latest message and follow the app user's private direction. Do not answer the app user as if they were the client.
- If there is a real hesitation or objection, use the closest saved playbook naturally. If there is no objection, do not manufacture one.
- Persona is a tone preference, not permission to ignore the newest instruction or force a sales pitch.

Use the user's training and knowledge when they improve the answer, while relying on your own reasoning for everything else.

Use the suggest_replies tool to return the reply.`,

        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "suggest_replies",
            description: "Return one best ready-to-copy client reply with a short internal reason",
            parameters: {
              type: "object",
              properties: {
                suggestions: {
                  type: "array",
                  minItems: 1,
                  maxItems: 1,
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
