import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildKnowledgeContext, KNOWLEDGE_GUARDRAIL, HUMAN_VOICE_RULES, type KnowledgeEntry } from "../_shared/knowledge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  friend: `You are Nifimas — just another gamer in this streamer's DMs. Icebreaker and rapport only.

Your job:
- Be a real friend, not a lead-gen bot. Comment on their gameplay, their game, a moment from the stream, their schedule.
- NEVER pitch, never mention promotion, packages, prices, services, growth offers or "helping them grow". Not even softly.
- Ask small, easy questions about their streaming journey. Let them talk.
- If THEY ask about growth/promo/pricing, don't sell — just say you know someone who does that (Brozeen) and offer to connect them.
- Warm, short, lowercase, gamer energy.`,

  promoter: `You are Brozeen — organic value provider. You spot what's holding this streamer's channel back and offer help once they're warm.

Your job:
- Lead with a specific gap you noticed (low retention, dead first 5 minutes, no overlays/branding, bad titles/thumbnails, inconsistent schedule, no clips/shorts).
- Give one genuinely useful tip for free before offering anything paid.
- Only pitch when they respond warmly or ask. If they're cold, keep giving value.
- Confident, chill, never desperate, never a sales pitch wall. One idea per message.
- When they show buying signals (asking price, packages, "how does it work"), answer straight and set the next step.`,
};

SYSTEM_PROMPTS.streamer = `You are the BIG STREAMER — high-authority closer, peer-to-peer with another streamer.

Your job:
- You already have reach. You're not asking, you're offering. Direct, calm, zero begging, zero hype.
- Used for real proposals: what they get, what it costs, when it starts.
- Answer pricing questions straight. Never discount out of fear; hold value.
- Very short messages. A busy streamer texting another streamer.`;



const GEMINI_MODEL_MAP: Record<string, string> = {
  "google/gemini-3-flash-preview": "gemini-2.5-flash",
};
const GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-pro"];

async function callOpenAISuggestions(body: Record<string, unknown>, openaiKey: string): Promise<Response> {
  return await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "gpt-4o-mini" }),
  });
}

async function callAI(body: Record<string, unknown>, keys: { gemini?: string; openai?: string }): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

  // 1. Try Lovable AI
  if (LOVABLE_API_KEY && !keys.openai && !keys.gemini) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status !== 402 && response.status !== 429) return response;
      console.log(`Lovable AI returned ${response.status}, falling back...`);
    } catch (e) {
      console.error("Lovable AI failed:", e);
    }
  }

  // 2. Try OpenAI
  if (keys.openai) {
    try {
      const resp = await callOpenAISuggestions(body, keys.openai);
      if (resp.ok) return resp;
      await resp.text();
    } catch (e) {
      console.error("OpenAI error:", e);
    }
  }

  // 3. Try Gemini
  const geminiKey = keys.gemini || Deno.env.get("GEMINI_API_KEY");
  if (geminiKey) {
    const lovableModel = (body.model as string) || "google/gemini-3-flash-preview";
    const models = [GEMINI_MODEL_MAP[lovableModel] || "gemini-2.5-flash", ...GEMINI_FALLBACK_MODELS];
    const tried = new Set<string>();
    let lastResponse: Response | null = null;
    for (const geminiModel of models) {
      if (tried.has(geminiModel)) continue;
      tried.add(geminiModel);
      lastResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${geminiKey}` },
        body: JSON.stringify({ ...body, model: geminiModel }),
      });
      if (lastResponse.ok) return lastResponse;
    }
    if (lastResponse) return lastResponse;
  }

  // 4. Last resort Lovable
  if (LOVABLE_API_KEY) {
    return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  throw new Error("No AI API key available. Please add an API key in Settings.");
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
    const { messages = [], persona, contactContext, knowledge: guestKnowledge } = await req.json() as {
      messages?: IncomingMessage[];
      persona?: string;
      contactContext?: string;
      knowledge?: KnowledgeEntry[];
    };

    const activePersona = persona === "promoter" ? "promoter" : persona === "streamer" ? "streamer" : "friend";
    const knowledgePersona = activePersona === "friend" ? "nifimas" : "brozeen";

    const preparedMessages = toGatewayMessages(Array.isArray(messages) ? messages : []);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // Get user's API keys
    let userKeys: { gemini?: string; openai?: string } = {};
    let userId: string | null = null;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      try {
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await sb.auth.getUser(token);
        if (user) {
          userId = user.id;
          const { data: settings } = await sb.from("user_settings").select("gemini_api_key, openai_api_key").eq("user_id", user.id).single();
          if (settings?.gemini_api_key) userKeys.gemini = settings.gemini_api_key;
          if (settings?.openai_api_key) userKeys.openai = settings.openai_api_key;
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

    const systemPrompt = (SYSTEM_PROMPTS[activePersona] || SYSTEM_PROMPTS.friend) + knowledgeContext + objectionContext + styleContext + ((knowledgeContext || objectionContext) ? KNOWLEDGE_GUARDRAIL : "");

    const response = await callAI({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        ...preparedMessages,
        {
          role: "user",
          content: `${contactContext || ""}

Based on the conversation above, generate exactly 3 different reply suggestions I could send to this streamer. Each suggestion should have a different approach/angle.

Critical persona rules:
- Never mix personas.
- If persona is Nifimas (friend), stay warm/casual and only softly refer to Brozeen when streamer asks for deeper strategy or execution.
- If persona is Brozeen (promoter), stay expert/professional and drive toward conversion with a clear next step.

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
