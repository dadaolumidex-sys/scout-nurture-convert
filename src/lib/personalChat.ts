import { getActiveKeysForRotation, recordFailure, recordSuccess } from "@/lib/apiKeys";
import { supabase } from "@/integrations/supabase/client";

type ApiMessage = {
  role: "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

// Keep the local reply path quick. Each extra model is another network request
// when a key is invalid or rate-limited, which used to make a failed reply look
// like the chat was hanging for minutes.
const MODELS = ["gemini-2.5-flash", "gemini-flash-latest"];
const NORMAL_MEMORY_LIMIT = 24;
const NORMAL_KNOWLEDGE_LIMIT = 8;

function toBase64(bytes: ArrayBuffer) {
  const data = new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < data.length; i += 0x8000) binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function imagePart(url: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith("image/")) return null;
    return { inline_data: { mime_type: blob.type, data: toBase64(await blob.arrayBuffer()) } };
  } catch {
    return null;
  }
}

async function loadKnowledge(persona: "friend" | "promoter", limit = NORMAL_KNOWLEDGE_LIMIT) {
  const key = persona === "promoter" ? "brozeen" : "nifimas";
  const { data } = await (supabase.from("knowledge_entries" as any) as any)
    .select("title, content, insights")
    .or(`persona.eq.${key},persona.eq.shared`)
    .limit(limit);
  return (data || []).map((entry: any) => {
    const insights = Array.isArray(entry.insights)
      ? entry.insights.slice(0, 8).map((item: any) => typeof item === "string" ? item : item?.insight || "").filter(Boolean).join("\n")
      : "";
    return `${entry.title || "Saved knowledge"}: ${insights || String(entry.content || "").slice(0, 900)}`;
  }).filter(Boolean).join("\n\n").slice(0, 12_000);
}

/**
 * Last-resort reply path for a signed-in person's own Gemini keys. It protects
 * chats from an old or temporarily unavailable hosted Edge Function.
 */
export async function generatePersonalChatReply({
  messages,
  persona,
  deepResearch,
  memory = [],
  knowledge = [],
}: {
  messages: ApiMessage[];
  persona: "friend" | "promoter";
  deepResearch: boolean;
  memory?: string[];
  knowledge?: unknown[];
}) {
  const keys = await getActiveKeysForRotation("gemini");
  if (!keys.length) throw new Error("No active personal Gemini key is available.");

  // Normal replies use a focused context so they remain quick after many
  // uploads and saved memories. Deep Research intentionally reads more.
  const savedKnowledge = await loadKnowledge(persona, deepResearch ? 16 : NORMAL_KNOWLEDGE_LIMIT);
  const memoryLimit = deepResearch ? 60 : NORMAL_MEMORY_LIMIT;
  memory = memory.slice(0, memoryLimit);
  const role = persona === "promoter"
    ? "Promoter & Closer: professional, confident, practical, and persuasive when appropriate."
    : "Friendship: warm, natural, helpful, and casual without forcing a sales pitch.";
  const deepResearchInstructions = deepResearch
    ? " Deep Research is enabled: review the available conversation, saved knowledge, screenshots, and any supplied link carefully before answering. Give a detailed, structured answer; separate confirmed facts from recommendations; and say clearly when a fact cannot be verified from the supplied material."
    : "";
  const system = `You are StreamScout AI acting as ${role}\n\nGive accurate, useful replies. When a chat or screenshot is supplied, read it carefully and answer the latest message only. Do not invent facts. Use clear markdown and keep normal replies concise.${deepResearchInstructions}\n\nLONG-TERM MEMORY:\n${memory.slice(0, 100).join("\n") || "None."}\n\nSAVED KNOWLEDGE:\n${savedKnowledge || JSON.stringify(knowledge).slice(0, 12_000) || "None."}`;

  const contents = await Promise.all(messages.slice(deepResearch ? -50 : -20).map(async (message) => {
    const parts: Array<Record<string, unknown>> = [];
    if (typeof message.content === "string") parts.push({ text: message.content || " " });
    else {
      for (const item of message.content) {
        if (item.type === "text") parts.push({ text: item.text || " " });
        else {
          const image = await imagePart(item.image_url.url);
          if (image) parts.push(image);
          else parts.push({ text: "[Screenshot attached but could not be reloaded; use the accompanying text.]" });
        }
      }
    }
    return { role: message.role === "assistant" ? "model" : "user", parts };
  }));

  let lastError = "";
  for (const key of keys) {
    for (const model of MODELS) {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key.api_key },
          // Detailed research regularly needs more than a short reply window.
          // Normal replies still have a finite timeout so a failed provider
          // does not make the chat appear frozen.
          signal: AbortSignal.timeout(deepResearch ? 60_000 : 18_000),
          body: JSON.stringify({
            system_instruction: { parts: [{ text: system }] },
            contents,
            // Leave enough room to finish a useful answer rather than cutting
            // it in the middle of a numbered plan or draft message.
            generationConfig: { maxOutputTokens: deepResearch ? 6_000 : 1_200 },
          }),
        });
        if (!response.ok) {
          lastError = `Gemini ${model} returned ${response.status}`;
          // A rejected or rate-limited key will not succeed by trying another
          // model. Move to the next saved key immediately.
          if ([401, 403, 429].includes(response.status)) break;
          continue;
        }
        const payload = await response.json();
        const reply = (payload.candidates?.[0]?.content?.parts || []).map((part: { text?: string }) => part.text || "").join("").trim();
        if (!reply) { lastError = `Gemini ${model} returned no text`; continue; }
        await recordSuccess(key.id);
        return reply;
      } catch (error) {
        lastError = error instanceof Error ? error.message : "Gemini request failed";
        // Do not spend another timeout on the same key after a connection
        // failure. Rotation can try the next key instead.
        if (error instanceof DOMException && error.name === "TimeoutError") break;
      }
    }
    await recordFailure(key.id, lastError || "Gemini key could not generate a chat reply");
  }
  throw new Error(lastError || "Your active Gemini keys could not generate a reply.");
}
