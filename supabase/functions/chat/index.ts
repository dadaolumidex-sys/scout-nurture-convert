import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, persona, deepResearch } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt = SYSTEM_PROMPTS[persona] || SYSTEM_PROMPTS.friend;
    if (deepResearch) {
      systemPrompt += DEEP_RESEARCH_SUFFIX;
    }

    // Use a more powerful model for deep research
    const model = deepResearch ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
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
