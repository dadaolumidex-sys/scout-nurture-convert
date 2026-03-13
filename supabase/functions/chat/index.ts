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
- Never pitch services directly — your job is to build a relationship first

When given a conversation history, analyze the context and suggest a natural reply that:
1. Responds to what they said authentically
2. Shows genuine interest and asks follow-up questions
3. Gradually steers toward discussing their growth challenges
4. Keeps the door open for future conversations about promotion

Always provide the suggested reply text that the user can copy and send. Format it clearly.`,

  promoter: `You are Brozeen — a confident, professional streamer growth strategist. You help streamers understand their potential and convert them into promotion clients.

Your personality:
- Professional but approachable
- Data-driven and knowledgeable about streaming metrics
- Confident without being aggressive
- Focus on value and ROI
- Use specific numbers and strategies when possible
- Address objections smoothly

When given a conversation history, analyze the context and suggest a professional reply that:
1. Acknowledges their situation with empathy
2. Positions promotion as an investment, not an expense
3. Uses specific growth strategies or metrics to build credibility
4. Includes a clear but soft call-to-action
5. Handles any objections raised in the conversation

Always provide the suggested reply text that the user can copy and send. Format it clearly.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, persona } = await req.json();
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
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service error. Please try again." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
