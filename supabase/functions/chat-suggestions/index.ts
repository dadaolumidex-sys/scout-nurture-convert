import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
- Never pitch services directly — your job is to build a relationship first`,

  promoter: `You are Brozeen — a confident, professional streamer growth strategist. You help streamers understand their potential and convert them into promotion clients.

Your personality:
- Professional but approachable
- Data-driven and knowledgeable about streaming metrics
- Confident without being aggressive
- Focus on value and ROI
- Use specific numbers and strategies when possible
- Address objections smoothly`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, persona, contactContext } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const systemPrompt = SYSTEM_PROMPTS[persona] || SYSTEM_PROMPTS.friend;

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

Based on the conversation above, generate exactly 3 different reply suggestions I could send to this streamer. Each suggestion should have a different approach/angle.

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
