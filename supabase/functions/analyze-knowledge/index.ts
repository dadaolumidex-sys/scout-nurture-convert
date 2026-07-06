import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_MODEL_MAP: Record<string, string> = {
  "google/gemini-3-flash-preview": "gemini-2.5-flash",
};
const GEMINI_FALLBACK_MODELS = ["gemini-2.5-flash", "gemini-flash-latest", "gemini-2.5-pro"];

async function callAI(body: Record<string, unknown>): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

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
      if (response.status !== 402 && response.status !== 429) return response;
      console.log(`Lovable AI returned ${response.status}, falling back to Gemini API`);
    } catch (e) {
      console.error("Lovable AI failed, falling back to Gemini:", e);
    }
  }

  if (!GEMINI_API_KEY) {
    throw new Error("No AI API key available.");
  }

  const lovableModel = (body.model as string) || "google/gemini-3-flash-preview";
  const models = [GEMINI_MODEL_MAP[lovableModel] || "gemini-2.5-flash", ...GEMINI_FALLBACK_MODELS];
  const tried = new Set<string>();
  let lastResponse: Response | null = null;
  for (const geminiModel of models) {
    if (tried.has(geminiModel)) continue;
    tried.add(geminiModel);
    lastResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GEMINI_API_KEY}`,
      },
      body: JSON.stringify({ ...body, model: geminiModel }),
    });
    if (lastResponse.ok) return lastResponse;
  }
  return lastResponse!;
}

// Strip HTML down to readable text for URL sources.
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Best-effort content extraction from a URL (articles, blog posts, social pages,
// and YouTube meta/description). Returns "" if nothing usable was found.
async function fetchUrlContent(url: string): Promise<string> {
  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StreamScoutBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });
    if (!resp.ok) return "";
    const html = await resp.text();

    // Pull out title + meta description first (works great for YouTube/social).
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "";
    const desc =
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)?.[1] ||
      "";

    const bodyText = htmlToText(html).slice(0, 12000);
    const parts = [title && `Title: ${title}`, desc && `Description: ${desc}`, bodyText]
      .filter(Boolean)
      .join("\n\n");
    return parts.slice(0, 12000);
  } catch (e) {
    console.error("fetchUrlContent failed:", e);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { content, type, persona, url } = await req.json();

    // If a URL was provided, fetch its content first.
    let sourceText: string = typeof content === "string" ? content : "";
    if (typeof url === "string" && url.trim()) {
      const fetched = await fetchUrlContent(url.trim());
      if (fetched) {
        sourceText = `${sourceText ? sourceText + "\n\n" : ""}Source URL: ${url}\n\n${fetched}`;
      } else if (!sourceText) {
        return new Response(
          JSON.stringify({
            error:
              "Couldn't read that link automatically (some sites like YouTube block bots). Paste the transcript or key text instead.",
          }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (!sourceText.trim()) {
      return new Response(JSON.stringify({ error: "No content to analyze." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt = "";

    if (type === "training") {
      systemPrompt = `You are analyzing a conversation to extract the communication style and personality fingerprint of a streamer outreach specialist.

Persona context: ${persona === "brozeen" ? "Brozeen (professional promoter who converts streamers into clients)" : "Nifimas (friendly, casual friend who builds trust and rapport)"}

Analyze the conversation and provide:
1. A "Style:" summary (1-2 sentences describing the communication approach)
2. Key patterns you notice (tone, techniques, phrases used)

Format your response as:
Style: [your analysis]

Keep it concise but insightful.`;
    } else if (type === "objection") {
      systemPrompt = `You are extracting an OBJECTION-HANDLING PLAYBOOK from sales / persuasion / psychology content (this may be a transcript, article, script, or notes).

Your job: find every objection, hesitation, or point of resistance a prospective buyer might raise, and the best way to respond to it based on the material.

Return a JSON array. Each item MUST have:
- "category": always "Objection Handling"
- "insight": a single string formatted EXACTLY as: "Objection: <the objection in the buyer's words> → Response: <the concise, persuasive way to handle it>"

Rules:
- Extract 3-15 of the most useful, reusable objection/response pairs.
- Keep each response tactical and specific (mention the psychology/technique when relevant, e.g. reframing, social proof, scarcity, feel-felt-found).
- If the content is general sales psychology (no explicit objections), infer the common objections it helps overcome and write pairs for them.
- Only return the JSON array, nothing else.`;
    } else {
      systemPrompt = `You are extracting actionable insights from sales/marketing content for a streamer promotion business.

Extract 3-8 key insights from the content. Each insight should have:
- A category tag (e.g., "Objection Handling", "Trust Building", "Content Creation", "Sales Strategy", "Closing Techniques", "Mindset", "Social Media Strategy", "Personal Growth")
- A concise insight (1-2 sentences max)

Format as JSON array:
[{"category": "tag", "insight": "the insight text"}]

Only return the JSON array, nothing else.`;
    }

    const response = await callAI({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: sourceText.slice(0, 12000) },
      ],
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
      console.error("AI error:", response.status, t);
      throw new Error("AI service error");
    }

    const data = await response.json();
    const result = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ result, extractedContent: sourceText.slice(0, 12000) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-knowledge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
