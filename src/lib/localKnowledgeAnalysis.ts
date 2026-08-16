import { getActiveKeysForRotation, recordFailure, recordSuccess } from "@/lib/apiKeys";

type AnalysisType = "knowledge" | "objection" | "training";

type LocalAnalysisInput = {
  content?: string;
  url?: string;
  fileData?: string;
  fileMime?: string;
  type?: AnalysisType;
  persona?: string;
};

type LocalAnalysisResult = { result: string; extractedContent: string };

const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];
const MAX_SOURCE_CHARS = 100_000;

function isYouTubeUrl(value: string) {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

function transcriptFromItem(item: Record<string, unknown>) {
  for (const field of ["transcriptText", "transcript", "text", "content", "captions"]) {
    const value = item[field];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const lines = value.map((part) => typeof part === "string"
        ? part
        : String((part as Record<string, unknown>)?.text || (part as Record<string, unknown>)?.content || "").trim(),
      ).filter(Boolean);
      if (lines.length) return lines.join(" ");
    }
  }
  return "";
}

async function fetchYouTubeTranscriptLocally(videoUrl: string) {
  const keys = await getActiveKeysForRotation("apify");
  if (!keys.length) throw new Error("Add an active Apify key in Settings → API & Connections to extract YouTube transcripts locally.");

  let lastError = "";
  for (const savedKey of keys) {
    try {
      const response = await fetch(
        `https://api.apify.com/v2/acts/api-ninja~youtube-transcript-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(savedKey.api_key)}&timeout=60`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ urls: [videoUrl], language: "en" }),
        },
      );
      if (!response.ok) {
        lastError = `Apify returned ${response.status}`;
        continue;
      }
      const data = await response.json();
      const item = Array.isArray(data) ? data[0] : data;
      const transcript = item && typeof item === "object" ? transcriptFromItem(item as Record<string, unknown>) : "";
      if (!transcript) {
        lastError = "The video has no readable transcript";
        continue;
      }
      await recordSuccess(savedKey.id);
      const title = String((item as Record<string, unknown>).title || "YouTube video");
      return `Title: ${title}\n\nTranscript:\n${transcript}`.slice(0, MAX_SOURCE_CHARS);
    } catch (error) {
      lastError = error instanceof Error ? error.message : "YouTube transcript request failed";
    }
    await recordFailure(savedKey.id, lastError || "YouTube transcript request failed");
  }
  throw new Error(`${lastError || "YouTube transcript extraction failed"}. Check that the video has captions and try again.`);
}

function promptFor(type: AnalysisType, persona?: string) {
  if (type === "training") {
    return `Analyze this conversation and extract the communication style and personality fingerprint.
Persona context: ${persona === "brozeen" ? "Brozeen (professional promoter)" : "Nifimas (friendly, casual friend)"}.

Return exactly this format:
Style: [one or two concise sentences]

Key patterns: [tone, techniques, and phrases used]`;
  }

  if (type === "objection") {
    return `Read the entire supplied material deeply and extract a focused objection-handling playbook. Return only a JSON array with up to 20 distinct, high-value items; aim for 20 when the material supports it. Do not stop after the first examples, and do not repeat the same objection in different words. Each item must have "category": "Objection Handling" and "insight" formatted exactly as: "Objection: <buyer words> → Response: <concise persuasive response>".`;
  }

  return `Read the entire supplied sales or marketing material deeply. Extract up to 20 distinct, high-value actionable insights for a streamer promotion business; aim for 20 when the source contains enough detail. Cover all useful sections rather than only the beginning. Do not invent facts or duplicate ideas. Return only a JSON array; each item must have "category" and "insight". Keep every insight concise and practical.`;
}

function filePart(fileData: string, fileMime?: string) {
  const match = /^data:([^;,]+)?(?:;base64)?,(.*)$/s.exec(fileData);
  if (!match) throw new Error("The selected file could not be read.");
  return {
    inline_data: {
      mime_type: fileMime || match[1] || "application/octet-stream",
      data: match[2],
    },
  };
}

/**
 * Development-only fallback used when the hosted Edge Function is unavailable.
 * It deliberately runs only on localhost and uses keys belonging to the signed-in user.
 */
export async function analyzeKnowledgeLocally(input: LocalAnalysisInput): Promise<LocalAnalysisResult> {
  const type = input.type || "knowledge";
  let sourceText = input.content?.trim() || "";
  if (input.url?.trim()) {
    if (!isYouTubeUrl(input.url.trim())) {
      throw new Error("Local link analysis currently supports YouTube. For other links, paste the text or use the hosted service when it is available.");
    }
    sourceText = await fetchYouTubeTranscriptLocally(input.url.trim());
  }
  if (!sourceText && !input.fileData) throw new Error("No content to analyze.");

  const keys = await getActiveKeysForRotation("gemini");
  if (!keys.length) throw new Error("Add an active Gemini key in Settings → API & Connections to analyze files locally.");

  const parts: Array<Record<string, unknown>> = [{ text: promptFor(type, input.persona) }];
  if (sourceText) parts.push({ text: `\n\nSource material:\n${sourceText.slice(0, MAX_SOURCE_CHARS)}` });
  if (input.fileData) parts.push(filePart(input.fileData, input.fileMime));

  let lastError = "";
  for (const savedKey of keys) {
    for (const model of MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": savedKey.api_key },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: { maxOutputTokens: 4096 },
            }),
          },
        );
        if (!response.ok) {
          lastError = `Gemini returned ${response.status}`;
          continue;
        }
        const payload = await response.json();
        const result = (payload.candidates?.[0]?.content?.parts || [])
          .map((part: { text?: string }) => part.text || "")
          .join("")
          .trim();
        if (!result) {
          lastError = "Gemini returned no text";
          continue;
        }
        await recordSuccess(savedKey.id);
        return {
          result,
          extractedContent: sourceText.slice(0, MAX_SOURCE_CHARS) || `Uploaded file analyzed locally.`,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Local Gemini request failed";
      }
    }
    await recordFailure(savedKey.id, lastError || "Gemini key could not process this request");
  }

  throw new Error(`${lastError || "Gemini could not analyze this source"}. Check your active Gemini keys and try again.`);
}
