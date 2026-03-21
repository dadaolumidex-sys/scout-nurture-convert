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

// Model mapping from Lovable AI model names to Gemini API model names
const GEMINI_MODEL_MAP: Record<string, string> = {
  "google/gemini-2.5-pro": "gemini-2.0-flash-lite",
  "google/gemini-3-flash-preview": "gemini-2.0-flash-lite",
  "google/gemini-2.5-flash": "gemini-2.0-flash-lite",
};

async function callAI(body: Record<string, unknown>, stream: boolean): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

  // Try Lovable AI first
  if (LOVABLE_API_KEY) {
    try {
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      // If not a credit/rate issue, use this response
      if (response.status !== 402 && response.status !== 429) {
        return response;
      }
      console.log(`Lovable AI returned ${response.status}, falling back to Gemini API`);
    } catch (e) {
      console.error("Lovable AI failed, falling back to Gemini:", e);
    }
  }

  // Fallback to Google Gemini API
  if (!GEMINI_API_KEY) {
    throw new Error("No AI API key available. Please configure GEMINI_API_KEY or add Lovable AI credits.");
  }

  const lovableModel = (body.model as string) || "google/gemini-3-flash-preview";
  const geminiModel = GEMINI_MODEL_MAP[lovableModel] || "gemini-2.0-flash-lite";

  const geminiBody = { ...body, model: geminiModel };

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
      },
      body: JSON.stringify(geminiBody),
    }
  );

  return response;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, persona, deepResearch } = await req.json();

    let systemPrompt = SYSTEM_PROMPTS[persona] || SYSTEM_PROMPTS.friend;
    if (deepResearch) {
      systemPrompt += DEEP_RESEARCH_SUFFIX;
    }

    const model = deepResearch ? "google/gemini-2.5-pro" : "google/gemini-3-flash-preview";

    const response = await callAI({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...messages,
      ],
      stream: true,
    }, true);

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI service temporarily unavailable. Please try again in a moment." }), {
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
