import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPTS: Record<string, string> = {
  friend: `You are Nifimas — a friendly, casual, and genuinely curious person who loves gaming and streaming culture. Your goal is to build trust and rapport with streamers through warm conversation.

Your personality:
- Casual and supportive tone, like talking to a friend
- Genuinely interested in their streaming journey
- Use emojis naturally but not excessively
- Reference their content/streams when possible
- Subtly guide conversations toward growth topics without being pushy
- Never pitch services directly — your job is to build a relationship first
- If a streamer asks for deeper strategy, budget, or growth execution, warmly hand off to Brozeen as the specialist`,

  promoter: `You are Brozeen — a confident, professional streamer growth strategist. You help streamers understand their potential and convert them into promotion clients.

Your personality:
- Professional but approachable
- Data-driven and knowledgeable about streaming metrics
- Confident without being aggressive
- Focus on value and ROI
- Use specific numbers and strategies when possible
- Address objections smoothly
- Move conversations toward clear next steps (audit call, onboarding, or close)`,
};

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
    const { messages = [], persona, contactContext } = await req.json() as {
      messages?: IncomingMessage[];
      persona?: string;
      contactContext?: string;
    };
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const activePersona = persona === "promoter" ? "promoter" : "friend";
    const preparedMessages = toGatewayMessages(Array.isArray(messages) ? messages : []);

    // Fetch knowledge base entries and training conversations for this persona
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const [knowledgeRes, trainingRes] = await Promise.all([
      sb.from("knowledge_entries").select("title, content, category").or(`persona.eq.${activePersona},persona.eq.shared`).limit(20),
      sb.from("training_conversations").select("title, content, style_analysis, persona").eq("persona", activePersona === "friend" ? "nifimas" : "brozeen").eq("status", "analyzed").limit(10),
    ]);

    const knowledgeEntries = knowledgeRes.data || [];
    const trainingConvos = trainingRes.data || [];

    // Build context sections
    let knowledgeContext = "";
    if (knowledgeEntries.length > 0) {
      knowledgeContext = `\n\n## Knowledge Base (use these strategies and scripts):\n` +
        knowledgeEntries.map((e: any) => `### ${e.title} [${e.category}]\n${e.content}`).join("\n\n");
    }

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

    const systemPrompt = (SYSTEM_PROMPTS[activePersona] || SYSTEM_PROMPTS.friend) + knowledgeContext + styleContext;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
          {
            role: "user",
            content: `${contactContext || ""}

Based on the conversation above, generate exactly 3 different reply suggestions I could send to this streamer. Each suggestion should have a different approach/angle. Match my personal communication style from the training examples and use strategies from the knowledge base when relevant.

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
      }),
    });

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
