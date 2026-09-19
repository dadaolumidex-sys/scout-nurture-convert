import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { safeGet, safeSet, safeSetJson } from "@/lib/safeStorage";

export type MemoryItem = {
  id: string;
  content: string;
  source: string;
  created_at: string;
};

const GUEST_MEMORY_KEY = "streamscout_guest_memory";
const MEMORY_ENABLED_KEY = "streamscout_memory_enabled";
const MAX_MEMORIES = 100;
const MAX_AUTO_MEMORIES = 50;

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readGuest(): MemoryItem[] {
  try {
    const raw = safeGet(GUEST_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGuest(items: MemoryItem[]) {
  safeSetJson(GUEST_MEMORY_KEY, items.slice(0, MAX_MEMORIES));
}

export function isMemoryEnabled() {
  return safeGet(MEMORY_ENABLED_KEY) !== "false";
}

export function setMemoryEnabled(enabled: boolean) {
  safeSet(MEMORY_ENABLED_KEY, enabled ? "true" : "false");
}

/** Normalize text so we can dedupe near-identical facts. */
function normalize(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!,;]+$/g, "");
}

// Automatic memory is for durable facts about the app user. Prospect updates,
// planned DMs, and time-sensitive notes belong in Inbox history instead.
function isTemporaryAutoMemory(content: string) {
  const value = normalize(content);
  return /\b(today|tomorrow|tonight|this morning|this afternoon|this evening|next week|right now)\b/.test(value)
    || /\b(prospect|client)\s+[^.]+\b(mentioned|said|replied|asked|plans?)\b/.test(value)
    || /\b(user plans to (send|message|reach out|follow up|have .+ drop in))\b/.test(value)
    || /\b(discord|twitch|kick)\b[^.]{0,100}\b(mentioned|said|replied|asked)\b/.test(value);
}

export function useMemory() {
  const { user } = useAuth();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabledState] = useState(isMemoryEnabled());

  const load = useCallback(async () => {
    setLoading(true);
    if (user) {
      const { data, error } = await supabase
        .from("user_memory")
        .select("id, content, source, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(MAX_MEMORIES);
      setMemories(error ? [] : ((data as MemoryItem[]) || []));
    } else {
      setMemories(readGuest());
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const addMemory = useCallback(
    async (content: string, source = "manual") => {
      const clean = content.trim();
      if (!clean) return;
      const key = normalize(clean);
      if (memories.some((m) => normalize(m.content) === key)) return;

      if (user) {
        const { data, error } = await supabase
          .from("user_memory")
          .insert({ user_id: user.id, content: clean, source })
          .select("id, content, source, created_at")
          .single();
        if (!error && data) setMemories((prev) => [data as MemoryItem, ...prev]);
      } else {
        const item: MemoryItem = { id: createId(), content: clean, source, created_at: nowIso() };
        setMemories((prev) => {
          const next = [item, ...prev];
          writeGuest(next);
          return next;
        });
      }
    },
    [user, memories]
  );

  /** Save several auto-extracted facts at once (deduped against current + each other). */
  const addMany = useCallback(
    async (contents: string[], source = "auto") => {
      const seen = new Set(memories.map((m) => normalize(m.content)));
      const fresh: string[] = [];
      for (const c of contents) {
        const clean = c.trim();
        if (!clean) continue;
        if (source === "auto" && isTemporaryAutoMemory(clean)) continue;
        const key = normalize(clean);
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push(clean);
      }
      if (fresh.length === 0) return;

      if (user) {
        let removedIds: string[] = [];
        if (source === "auto") {
          const { data: automaticRows } = await supabase
            .from("user_memory")
            .select("id")
            .eq("user_id", user.id)
            .eq("source", "auto")
            .order("created_at", { ascending: true });
          const toRemove = (automaticRows || []).slice(0, Math.max(0, (automaticRows || []).length + fresh.length - MAX_AUTO_MEMORIES));
          removedIds = toRemove.map((memory: { id: string }) => memory.id);
          if (removedIds.length) await supabase.from("user_memory").delete().in("id", removedIds);
        }
        const { data, error } = await supabase
          .from("user_memory")
          .insert(fresh.map((content) => ({ user_id: user.id, content, source })))
          .select("id, content, source, created_at");
        if (!error && data) setMemories((prev) => [...(data as MemoryItem[]), ...prev.filter((memory) => !removedIds.includes(memory.id))].slice(0, MAX_MEMORIES));
      } else {
        const items: MemoryItem[] = fresh.map((content) => ({ id: createId(), content, source, created_at: nowIso() }));
        setMemories((prev) => {
          const allItems = [...items, ...prev];
          const keptAutoIds = new Set(allItems.filter((memory) => memory.source === "auto").slice(0, MAX_AUTO_MEMORIES).map((memory) => memory.id));
          const next = source === "auto"
            ? allItems.filter((memory) => memory.source !== "auto" || keptAutoIds.has(memory.id))
            : allItems;
          writeGuest(next);
          return next;
        });
      }
    },
    [user, memories]
  );

  const cleanupTemporaryAutoMemories = useCallback(async () => {
    const automatic = memories.filter((memory) => memory.source === "auto");
    const temporary = automatic.filter((memory) => isTemporaryAutoMemory(memory.content));
    const durableAutomatic = automatic.filter((memory) => !isTemporaryAutoMemory(memory.content));
    const tooOld = durableAutomatic.slice(MAX_AUTO_MEMORIES);
    const ids = [...temporary, ...tooOld].map((memory) => memory.id);
    if (!ids.length) return 0;
    if (user) await supabase.from("user_memory").delete().in("id", ids);
    setMemories((prev) => prev.filter((memory) => !ids.includes(memory.id)));
    if (!user) writeGuest(memories.filter((memory) => !ids.includes(memory.id)));
    return ids.length;
  }, [user, memories]);

  const removeMemory = useCallback(
    async (id: string) => {
      if (user) {
        await supabase.from("user_memory").delete().eq("id", id);
      }
      setMemories((prev) => {
        const next = prev.filter((m) => m.id !== id);
        if (!user) writeGuest(next);
        return next;
      });
    },
    [user]
  );

  const clearAll = useCallback(async () => {
    if (user) {
      await supabase.from("user_memory").delete().eq("user_id", user.id);
    }
    setMemories([]);
    if (!user) writeGuest([]);
  }, [user]);

  const setEnabled = useCallback((value: boolean) => {
    setMemoryEnabled(value);
    setEnabledState(value);
  }, []);

  return { memories, loading, enabled, setEnabled, addMemory, addMany, removeMemory, clearAll, cleanupTemporaryAutoMemories, reload: load };
}

/** Read current memory facts synchronously for sending with a chat request. */
export async function getMemorySnapshot(userId?: string): Promise<string[]> {
  if (!isMemoryEnabled()) return [];
  if (userId) {
    const { data } = await supabase
      .from("user_memory")
      .select("content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_MEMORIES);
    return (data || []).map((d: { content: string }) => d.content);
  }
  return readGuest().map((m) => m.content);
}
