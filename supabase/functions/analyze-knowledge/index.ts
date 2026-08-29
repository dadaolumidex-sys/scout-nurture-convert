import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_MODEL_MAP: Record<string, string> = {
  "google/gemini-2.5-flash": "gemini-2.5-flash",
  "google/gemini-3.6-flash": "gemini-3.6-flash",
};
const GEMINI_FALLBACK_MODELS = ["gemini-3.5-flash", "gemini-3.6-flash", "gemini-3.7-flash", "gemini-flash-latest", "gemini-2.5-flash"];
const YOUTUBE_TRANSCRIPT_ACTOR = "api-ninja~youtube-transcript-scraper";

type ApifyCandidate = { id: string | null; key: string };

function isYouTubeUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

async function loadApifyCandidates(req: Request): Promise<ApifyCandidate[]> {
  const candidates: ApifyCandidate[] = [];
  try {
    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (authHeader && supabaseUrl && serviceKey) {
      const admin = createClient(supabaseUrl, serviceKey);
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const { data: { user } } = await admin.auth.getUser(token);
      if (user) {
        const { data: rows, error } = await admin
          .from("api_keys")
          .select("id, api_key")
          .eq("user_id", user.id)
          .eq("provider", "apify")
          .eq("is_active", true)
          .order("failure_count", { ascending: true })
          .order("last_used_at", { ascending: true, nullsFirst: true });
        if (error) console.error("Could not load saved Apify keys:", error.message);
        for (const row of rows || []) {
          if (row.api_key?.trim()) candidates.push({ id: row.id, key: row.api_key.trim() });
        }
      }
    }
  } catch (error) {
    console.error("Could not authenticate saved Apify keys:", error);
  }

  const envKey = Deno.env.get("APIFY_API_KEY")?.trim();
  if (envKey && !candidates.some((candidate) => candidate.key === envKey)) {
    candidates.push({ id: null, key: envKey });
  }
  return candidates;
}

function transcriptFromItem(item: Record<string, unknown>): string {
  const directFields = ["transcriptText", "transcript", "text", "content", "captions"];
  for (const field of directFields) {
    const value = item[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const lines = value.map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object") {
          const row = part as Record<string, unknown>;
          return String(row.text || row.content || row.caption || "").trim();
        }
        return "";
      }).filter(Boolean);
      if (lines.length) return lines.join(" ");
    }
  }
  return "";
}

async function fetchYouTubeTranscript(req: Request, videoUrl: string): Promise<string> {
  const candidates = await loadApifyCandidates(req);
  if (candidates.length === 0) {
    throw new Error("Add an active Apify key in Settings → API & Connections to extract YouTube transcripts.");
  }

  const failures: string[] = [];
  for (const candidate of candidates) {
    try {
      const endpoint = `https://api.apify.com/v2/acts/${YOUTUBE_TRANSCRIPT_ACTOR}/run-sync-get-dataset-items?token=${encodeURIComponent(candidate.key)}&timeout=35`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: [videoUrl], language: "en" }),
      });
      if (!response.ok) {
        failures.push(`${response.status}`);
        console.error("YouTube transcript actor failed", candidate.id, response.status, (await response.text()).slice(0, 300));
        continue;
      }

      const items = await response.json();
      const item = Array.isArray(items) ? items[0] : items;
      if (item && typeof item === "object") {
        const transcript = transcriptFromItem(item as Record<string, unknown>);
        if (transcript) {
          const title = String((item as Record<string, unknown>).title || "YouTube video");
          return `Title: ${title}\n\nTranscript:\n${transcript}`.slice(0, 24000);
        }
      }
      failures.push("empty transcript");
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(`YouTube transcript extraction failed (${failures.join(", ")}). Check that the video has captions and try again.`);
}

async function loadUserGeminiKeys(req: Request): Promise<string[]> {
  const authHeader = req.headers.get("authorization");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!authHeader || !supabaseUrl || !serviceKey) return [];

  try {
    const admin = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return [];
    const { data } = await admin
      .from("api_keys")
      .select("api_key")
      .eq("user_id", user.id)
      .eq("provider", "gemini")
      .eq("is_active", true)
      .order("failure_count", { ascending: true })
      .order("last_used_at", { ascending: true, nullsFirst: true });
    return (data || []).map((row) => String(row.api_key || "").trim()).filter(Boolean);
  } catch (error) {
    console.error("Could not load user Gemini keys:", error);
    return [];
  }
}

async function callGemini(body: Record<string, unknown>, key: string): Promise<Response> {
  const lovableModel = (body.model as string) || "google/gemini-3.5-flash";
  const models = [GEMINI_MODEL_MAP[lovableModel] || "gemini-3.5-flash", ...GEMINI_FALLBACK_MODELS];
  let lastResponse: Response | null = null;
  for (const geminiModel of new Set(models)) {
    lastResponse = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({ ...body, model: geminiModel }),
    });
    if (lastResponse.ok) return lastResponse;
  }
  return lastResponse!;
}

async function callAI(body: Record<string, unknown>, userGeminiKeys: string[]): Promise<Response> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  let lastResponse: Response | null = null;

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
      if (response.ok) return response;
      lastResponse = response;
      console.log(`Lovable AI returned ${response.status}, falling back to saved Gemini keys`);
    } catch (e) {
      console.error("Lovable AI failed, falling back to Gemini:", e);
    }
  }

  const keys = [...userGeminiKeys];
  if (GEMINI_API_KEY && !keys.includes(GEMINI_API_KEY)) keys.push(GEMINI_API_KEY);
  for (const key of keys) {
    try {
      const response = await callGemini(body, key);
      if (response.ok) return response;
      lastResponse = response;
    } catch (error) {
      console.error("Gemini fallback failed:", error);
    }
  }
  if (lastResponse) return lastResponse;
  throw new Error("No AI key is available for extraction.");
}

/**
 * Gemini's native endpoint accepts PDFs, Word files, and images as inline
 * data. The OpenAI-compatible route used for normal chat does not reliably
 * support those file blocks, so uploaded knowledge files use this path first.
 */
async function extractUploadedFileWithGemini(
  systemPrompt: string,
  sourceText: string,
  fileData: string,
  fileMime: string | undefined,
  keys: string[],
  expectJson: boolean,
): Promise<string> {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(fileData);
  if (!match) throw new Error("The uploaded file could not be read. Please choose it again and retry.");

  const mimeType = fileMime || match[1] || "application/octet-stream";
  const fileBytes = match[2];
  const models = Array.from(new Set(["gemini-3.6-flash", ...GEMINI_FALLBACK_MODELS]));
  let lastReason = "";

  for (const key of keys) {
    for (const model of models) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({
            contents: [{
              role: "user",
              parts: [
                { text: `${systemPrompt}\n\n${sourceText.trim().slice(0, 100000) || "Analyze the attached file and extract the requested information from its contents."}` },
                { inline_data: { mime_type: mimeType, data: fileBytes } },
              ],
            }],
            generationConfig: {
              maxOutputTokens: 4096,
              ...(expectJson ? { responseMimeType: "application/json" } : {}),
            },
          }),
        });
        if (!response.ok) {
          const detail = (await response.text()).replace(/\s+/g, " ").slice(0, 240);
          lastReason = response.status === 429
            ? "Your Gemini key has reached its request limit. Try another active key or wait a moment."
            : response.status === 401 || response.status === 403
              ? "Your Gemini key was rejected. Check that it is active and valid in Settings → API & Connections."
              : response.status === 400
                ? `Gemini could not read this file. Try a smaller PDF, Word, image, or text file.${detail ? ` (${detail})` : ""}`
                : `Gemini returned ${response.status}.${detail ? ` ${detail}` : ""}`;
          continue;
        }
        const data = await response.json();
        const result = (data.candidates?.[0]?.content?.parts || [])
          .map((part: { text?: string }) => part.text || "")
          .join("")
          .trim();
        if (result) return result;
        lastReason = "Gemini returned no readable analysis for this file.";
      } catch (error) {
        lastReason = error instanceof Error ? error.message : "The Gemini file reader failed.";
      }
    }
  }
  throw new Error(lastReason || "Gemini could not analyze this uploaded file. Check the active Gemini keys and try again.");
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
    const { content, type, persona, url, fileData, fileName, fileMime } = await req.json();

    // A file (PDF / image / doc) was uploaded as a base64 data URL — the AI reads it directly.
    const hasFile = typeof fileData === "string" && fileData.startsWith("data:");

    // If a URL was provided, fetch its content first.
    let sourceText: string = typeof content === "string" ? content : "";
    if (typeof url === "string" && url.trim()) {
      const normalizedUrl = url.trim();
      let fetched = "";
      if (isYouTubeUrl(normalizedUrl)) {
        try {
          fetched = await fetchYouTubeTranscript(req, normalizedUrl);
        } catch (error) {
          return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "YouTube extraction failed." }), {
            status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } else {
        fetched = await fetchUrlContent(normalizedUrl);
      }
      if (fetched) {
        sourceText = `${sourceText ? sourceText + "\n\n" : ""}Source URL: ${normalizedUrl}\n\n${fetched}`;
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

    if (!sourceText.trim() && !hasFile) {
      return new Response(JSON.stringify({ error: "No content to analyze." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let systemPrompt = "";

    if (type === "training") {
      systemPrompt = `You are analyzing a conversation to extract the communication style and personality fingerprint of a streamer outreach specialist. Read the entire supplied source before responding.

Persona context: ${persona === "brozeen" ? "Promoter & Closer (professional growth expert who handles objections and converts clients)" : "Friendship (friendly, casual rapport builder)"}

Analyze the conversation and provide:
1. A "Style:" summary (1-2 sentences describing the communication approach)
2. Key patterns you notice (tone, techniques, phrases used)

Format your response as:
Style: [your analysis]

Keep it concise but insightful.`;
    } else if (type === "objection") {
      systemPrompt = `You are extracting an OBJECTION-HANDLING PLAYBOOK from sales / persuasion / psychology content (this may be a transcript, article, script, or notes). Read the entire source deeply before responding.

Your job: find every objection, hesitation, or point of resistance a prospective buyer might raise, and the best way to respond to it based on the material.

Return a JSON array. Each item MUST have:
- "category": always "Objection Handling"
- "insight": a single string formatted EXACTLY as: "Objection: <the objection in the buyer's words> → Response: <the concise, persuasive way to handle it>"

Rules:
- Extract up to 20 distinct, high-value and reusable objection/response pairs; aim for 20 when the material supports it.
- Do not stop after the first examples, do not repeat the same objection in different words, and do not invent objections that are not supported by the material.
- Keep each response tactical and specific (mention the psychology/technique when relevant, e.g. reframing, social proof, scarcity, feel-felt-found).
- If the content is general sales psychology (no explicit objections), infer the common objections it helps overcome and write pairs for them.
- Only return the JSON array, nothing else.`;
    } else {
      systemPrompt = `You are extracting actionable insights from sales/marketing content for a streamer promotion business. Read the entire source deeply before responding.

Extract up to 20 distinct, high-value key insights from the content; aim for 20 when the material supports it. Cover all useful sections, not just the beginning. Each insight should have:
- A category tag (e.g., "Objection Handling", "Trust Building", "Content Creation", "Sales Strategy", "Closing Techniques", "Mindset", "Social Media Strategy", "Personal Growth")
- A concise insight (1-2 sentences max)

Format as JSON array:
[{"category": "tag", "insight": "the insight text"}]

Only return the JSON array, nothing else.`;
    }

    // Build the user message. If a file was uploaded, send it as a multimodal block
    // so the AI reads the PDF/image directly; otherwise send the extracted text.
    let userContent: unknown;
    if (hasFile) {
      const mime = (fileMime as string) || "application/octet-stream";
      const instruction = sourceText.trim()
        ? sourceText.slice(0, 100000)
        : "Analyze the attached file and extract the requested information from its contents.";
      const blocks: unknown[] = [{ type: "text", text: instruction }];
      if (mime.startsWith("image/")) {
        blocks.push({ type: "image_url", image_url: { url: fileData } });
      } else {
        blocks.push({ type: "file", file: { filename: (fileName as string) || "upload", file_data: fileData } });
      }
      userContent = blocks;
    } else {
      userContent = sourceText.slice(0, 100000);
    }

    const userGeminiKeys = await loadUserGeminiKeys(req);
    let result = "";
    if (hasFile && userGeminiKeys.length > 0) {
      result = await extractUploadedFileWithGemini(systemPrompt, sourceText, fileData, fileMime, userGeminiKeys, type !== "training");
    } else {
      const response = await callAI({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
      }, userGeminiKeys);

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
        const detail = (await response.text()).slice(0, 500);
        console.error("AI error:", response.status, detail);
        throw new Error(`AI service error (${response.status}). ${detail || "Check your active Gemini keys and try again."}`);
      }

      const data = await response.json();
      result = data.choices?.[0]?.message?.content || "";
    }

    const extractedContent = sourceText.trim()
      ? sourceText.slice(0, 100000)
      : (hasFile ? `Uploaded file: ${(fileName as string) || "file"}` : "");

    return new Response(JSON.stringify({ result, extractedContent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-knowledge error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
