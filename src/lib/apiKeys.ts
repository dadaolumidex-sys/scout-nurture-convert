import { supabase } from "@/integrations/supabase/client";

export type Provider = "apify" | "gemini" | "openai";

export interface ApiKeyRow {
  id: string;
  user_id: string;
  provider: Provider;
  label: string;
  api_key: string;
  is_active: boolean;
  failure_count: number;
  last_used_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export async function listKeys(provider?: Provider): Promise<ApiKeyRow[]> {
  let q = (supabase.from("api_keys" as any) as any).select("*").order("created_at", { ascending: true });
  if (provider) q = q.eq("provider", provider);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as ApiKeyRow[];
}

export async function addKey(provider: Provider, label: string, api_key: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("NEED_SIGN_IN");
  const { error } = await (supabase.from("api_keys" as any) as any)
    .insert({ user_id: user.id, provider, label: label.trim() || "Key", api_key: api_key.trim() });
  if (error) throw error;

  // Also mirror into user_settings so the chat edge function picks it up automatically
  if (provider === "gemini" || provider === "openai") {
    const col = provider === "gemini" ? "gemini_api_key" : "openai_api_key";
    await (supabase.from("user_settings") as any)
      .upsert({ user_id: user.id, [col]: api_key.trim(), updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  }
}

export async function bulkAddKeys(provider: Provider, text: string) {
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let label: string, key: string;
    if (line.includes(":") && !line.startsWith("apify_") && !line.startsWith("sk-") && !line.startsWith("AIza")) {
      const idx = line.indexOf(":");
      label = line.slice(0, idx).trim() || `Key ${i + 1}`;
      key = line.slice(idx + 1).trim();
    } else {
      label = `Key ${i + 1}`;
      key = line;
    }
    if (key) {
      await addKey(provider, label, key);
      count++;
    }
  }
  return count;
}

export async function deleteKey(id: string) {
  const { error } = await (supabase.from("api_keys" as any) as any).delete().eq("id", id);
  if (error) throw error;
}

export async function toggleKey(id: string, is_active: boolean) {
  const { error } = await (supabase.from("api_keys" as any) as any).update({ is_active, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function recordFailure(id: string, err: string) {
  const { data } = await (supabase.from("api_keys" as any) as any).select("failure_count").eq("id", id).single();
  const next = ((data as any)?.failure_count ?? 0) + 1;
  await (supabase.from("api_keys" as any) as any).update({
    failure_count: next,
    last_error: err.slice(0, 300),
    is_active: next < 3,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
}

export async function recordSuccess(id: string) {
  await (supabase.from("api_keys" as any) as any).update({
    last_used_at: new Date().toISOString(),
    failure_count: 0,
    last_error: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);
}

/** Returns active keys ordered by least failures first, then oldest used. */
export async function getActiveKeysForRotation(provider: Provider): Promise<ApiKeyRow[]> {
  const { data, error } = await (supabase.from("api_keys" as any) as any)
    .select("*")
    .eq("provider", provider)
    .eq("is_active", true)
    .order("failure_count", { ascending: true })
    .order("last_used_at", { ascending: true, nullsFirst: true });
  if (error) return [];
  return (data || []) as ApiKeyRow[];
}

export async function testApifyKey(key: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.apify.com/v2/users/me?token=${key}`);
    return r.ok;
  } catch { return false; }
}
