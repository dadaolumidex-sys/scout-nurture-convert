import { supabase } from "@/integrations/supabase/client";

const PREFIX = "storage://chat-images/";

export function isStoredChatImage(value: string) {
  return value.startsWith(PREFIX);
}

export async function uploadChatImage(dataUrl: string, userId: string, area: "ai" | "inbox") {
  const file = await fetch(dataUrl).then((response) => response.blob());
  const extension = file.type === "image/png" ? "png" : "jpg";
  const path = `${userId}/${area}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("chat-images").upload(path, file, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error("Your screenshot could not be saved. Please try sending it again.");
  return `${PREFIX}${path}`;
}

export async function resolveChatImage(value: string) {
  if (!isStoredChatImage(value)) return value;
  const path = value.slice(PREFIX.length);
  const { data, error } = await supabase.storage.from("chat-images").createSignedUrl(path, 60 * 60 * 24 * 7);
  if (error || !data?.signedUrl) throw new Error("This screenshot could not be opened.");
  return data.signedUrl;
}
