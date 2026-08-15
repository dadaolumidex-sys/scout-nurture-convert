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

function promptFor(type: AnalysisType, persona?: string) {
  if (type === "training") {
    return `Analyze this conversation and extract the communication style and personality fingerprint.
Persona context: ${persona === "brozeen" ? "Brozeen (professional promoter)" : "Nifimas (friendly, casual friend)"}.

Return exactly this format:
Style: [one or two concise sentences]

Key patterns: [tone, techniques, and phrases used]`;
  }

  if (type === "objection") {
    return `Extract an objection-handling playbook from the supplied material. Return only a JSON array with 3-15 items. Each item must have "category": "Objection Handling" and "insight" formatted exactly as: "Objection: <buyer words> → Response: <concise persuasive response>".`;
  }

  return `Extract 3-8 actionable insights from the supplied sales or marketing material for a streamer promotion business. Return only a JSON array. Each item must have "category" and "insight". Keep every insight concise and practical.`;
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
  if (sourceText) parts.push({ text: `\n\nSource material:\n${sourceText.slice(0, 12000)}` });
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
            body: JSON.stringify({ contents: [{ role: "user", parts }] }),
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
          extractedContent: sourceText || `Uploaded file analyzed locally.`,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Local Gemini request failed";
      }
    }
    await recordFailure(savedKey.id, lastError || "Gemini key could not process this request");
  }

  throw new Error(`${lastError || "Gemini could not analyze this source"}. Check your active Gemini keys and try again.`);
}
