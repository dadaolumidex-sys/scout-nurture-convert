import { getActiveKeysForRotation, recordFailure, recordSuccess } from "@/lib/apiKeys";

type AnalysisType = "knowledge" | "objection" | "training";

type LocalAnalysisInput = {
  content?: string;
  fileData?: string;
  fileMime?: string;
  type?: AnalysisType;
  persona?: string;
};

type LocalAnalysisResult = { result: string; extractedContent: string };

const MODELS = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-2.5-flash"];
const MAX_SOURCE_CHARS = 100_000;

function promptFor(type: AnalysisType, persona?: string) {
  if (type === "training") {
    return `Analyze this conversation and extract the communication style and personality fingerprint.
Persona context: ${persona === "brozeen" ? "Brozeen (professional promoter)" : "Nifimas (friendly, casual friend)"}.

Return exactly this format:
Style: [one or two concise sentences]

Key patterns: [tone, techniques, and phrases used]`;
  }

  if (type === "objection") {
    return `Read the entire supplied material deeply and extract a comprehensive objection-handling playbook. Return only a JSON array with up to 50 distinct, useful items; aim for 50 when the material supports it. Do not stop after the first examples, and do not repeat the same objection in different words. If there are fewer than 50 genuinely distinct objections, return every useful one you can find. Each item must have "category": "Objection Handling" and "insight" formatted exactly as: "Objection: <buyer words> → Response: <concise persuasive response>".`;
  }

  return `Read the entire supplied sales or marketing material deeply. Extract up to 50 distinct actionable insights for a streamer promotion business; aim for 50 when the source contains enough detail. Cover all useful sections rather than only the beginning. Do not invent facts or duplicate ideas. Return only a JSON array; each item must have "category" and "insight". Keep every insight concise and practical.`;
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
  const sourceText = input.content?.trim() || "";
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
              generationConfig: { maxOutputTokens: 8192 },
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
