import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

class AIProviderError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AIProviderError";
    this.status = status;
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function callAI(body: Record<string, unknown>, userGeminiKey?: string): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GEMINI_API_KEY = userGeminiKey || Deno.env.get("GEMINI_API_KEY");
  let lovableFallbackStatus: number | null = null;

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

      lovableFallbackStatus = response.status;
      await response.text(); // drain body before fallback
      console.log(`Lovable AI returned ${response.status}, falling back to Gemini API`);
    } catch (e) {
      console.error("Lovable AI failed, falling back to Gemini:", e);
    }
  }

  // Fallback to Google Gemini API (native endpoint)
  if (!GEMINI_API_KEY) {
    if (lovableFallbackStatus === 402) {
      throw new AIProviderError(402, "AI credits are exhausted. Add workspace AI credits or save a fresh Gemini API key in Settings.");
    }
    if (lovableFallbackStatus === 429) {
      throw new AIProviderError(429, "AI service is rate limited. Please wait a minute and try again.");
    }
    throw new AIProviderError(500, "No AI API key available. Please configure GEMINI_API_KEY or add Lovable AI credits.");
  }

  const lovableModel = (body.model as string) || "google/gemini-3-flash-preview";
  const geminiModel = GEMINI_MODEL_MAP[lovableModel] || "gemini-2.0-flash-lite";

  // Convert OpenAI-format messages to Gemini native format
  const messages = body.messages as Array<{ role: string; content: unknown }>;
  const systemInstruction = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  const geminiContents = chatMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: typeof m.content === "string"
      ? [{ text: m.content }]
      : (m.content as Array<{ type: string; text?: string; image_url?: { url: string } }>).map((p) => {
          if (p.type === "text") return { text: p.text || "" };
          if (p.type === "image_url" && p.image_url?.url) {
            const url = p.image_url.url;
            if (url.startsWith("data:")) {
              const [meta, data] = url.split(",");
              const mimeType = meta.split(":")[1]?.split(";")[0] || "image/jpeg";
              return { inline_data: { mime_type: mimeType, data } };
            }
            return { text: `[Image: ${url}]` };
          }
          return { text: "" };
        }),
  }));

  const geminiBody: Record<string, unknown> = {
    contents: geminiContents,
    generationConfig: { temperature: 0.7 },
  };
  if (systemInstruction && typeof systemInstruction.content === "string") {
    geminiBody.system_instruction = { parts: [{ text: systemInstruction.content }] };
  }

  const modelsToTry = Array.from(new Set([
    geminiModel,
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-1.5-flash",
  ]));

  let sawGeminiRateLimit = false;

  for (const model of modelsToTry) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });

    if (response.status === 429) {
      sawGeminiRateLimit = true;
      console.log(`Gemini model ${model} rate limited, trying next...`);
      await response.text();
      await delay(250);
      continue;
    }

    // Convert Gemini SSE stream to OpenAI-compatible SSE stream
    if (response.ok && response.body) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();

      (async () => {
        try {
          const reader = response.body!.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let idx: number;
            while ((idx = buffer.indexOf("\n")) !== -1) {
              let line = buffer.slice(0, idx);
              buffer = buffer.slice(idx + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (text) {
                  const openaiChunk = {
                    choices: [{ delta: { content: text }, index: 0 }],
                  };
                  await writer.write(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
                }
              } catch {
                // Skip malformed chunk
              }
            }
          }

          await writer.write(encoder.encode("data: [DONE]\n\n"));
        } finally {
          await writer.close();
        }
      })();

      return new Response(readable);
    }

    const failureBody = await response.text();
    console.error(`Gemini model ${model} failed:`, response.status, failureBody);
    return new Response(failureBody || JSON.stringify({ error: "Gemini request failed" }), {
      status: response.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (sawGeminiRateLimit) {
    if (lovableFallbackStatus === 402) {
      throw new AIProviderError(429, "Both AI providers are unavailable right now: workspace AI credits are exhausted and Gemini is rate limited. Add credits or use a fresh Gemini key from a new Google project.");
    }
    throw new AIProviderError(429, "All AI models are temporarily rate limited. Please wait a minute and try again.");
  }

  throw new AIProviderError(500, "AI service temporarily unavailable. Please try again in a moment.");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, persona, deepResearch } = await req.json();

    // Try to get user's own Gemini API key from their settings
    let userGeminiKey: string | undefined;
    const authHeader = req.headers.get("authorization");
    if (authHeader) {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
        const supabase = createClient(supabaseUrl, supabaseKey);

        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await supabase.auth.getUser(token);

        if (user) {
          const { data: settings } = await supabase
            .from("user_settings")
            .select("gemini_api_key")
            .eq("user_id", user.id)
            .single();
          if (settings?.gemini_api_key) {
            userGeminiKey = settings.gemini_api_key;
          }
        }
      } catch (e) {
        console.log("Could not fetch user API key, using defaults:", e);
      }
    }

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
    }, userGeminiKey);

    if (!response.ok) {
      const t = await response.text();
      console.error("AI error:", response.status, t);

      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please wait a minute and try again." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add usage credits or use your personal Gemini key in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "AI service temporarily unavailable. Please try again in a moment." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("chat error:", e);

    if (e instanceof AIProviderError) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: e.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});