import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type MemoryItem = {
  id: string;
  content: string;
  source: string;
  conversation_id?: string | null;
  created_at: string;
};

const GUEST_MEMORY_KEY = "streamscout_guest_memory";
const MEMORY_ENABLED_KEY = "streamscout_memory_enabled";
const MAX_MEMORIES = 100;

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `m-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readGuest(): MemoryItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(GUEST_MEMORY_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeGuest(items: MemoryItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(GUEST_MEMORY_KEY, JSON.stringify(items.slice(0, MAX_MEMORIES)));
}

export function isMemoryEnabled() {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MEMORY_ENABLED_KEY) !== "false";
}

export function setMemoryEnabled(enabled: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MEMORY_ENABLED_KEY, enabled ? "true" : "false");
}

/** Normalize text so we can dedupe near-identical facts. */
function normalize(text: string) {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!,;]+$/g, "");
}

export function useMemory() {
  const { user, loading: authLoading } = useAuth();
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabledState] = useState(isMemoryEnabled());

  const load = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    if (user) {
      const { data, error } = await supabase
        .from("user_memory" as any)
        .select("id, content, source, conversation_id, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(MAX_MEMORIES);
      setMemories(error ? [] : (((data as unknown) as MemoryItem[]) || []));
    } else {
      setMemories(readGuest());
    }
    setLoading(false);
  }, [authLoading, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const addMemory = useCallback(
    async (content: string, source = "manual", conversationId?: string | null) => {
      const clean = content.trim();
      if (!clean) return;
      const key = normalize(clean);
      if (memories.some((m) => normalize(m.content) === key && (m.conversation_id ?? null) === (conversationId ?? null))) return;

      if (user) {
        const { data, error } = await supabase
          .from("user_memory" as any)
          .insert({ user_id: user.id, content: clean, source, conversation_id: conversationId ?? null } as any)
          .select("id, content, source, conversation_id, created_at")
          .single();
        if (!error && data) setMemories((prev) => [((data as unknown) as MemoryItem), ...prev]);
      } else {
        const item: MemoryItem = { id: createId(), content: clean, source, conversation_id: conversationId ?? null, created_at: nowIso() };
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
    async (contents: string[], source = "auto", conversationId?: string | null) => {
      const scopedConversationId = conversationId ?? null;
      const seen = new Set(
        memories
          .filter((m) => (m.conversation_id ?? null) === scopedConversationId)
          .map((m) => normalize(m.content))
      );
      const fresh: string[] = [];
      for (const c of contents) {
        const clean = c.trim();
        if (!clean) continue;
        const key = normalize(clean);
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push(clean);
      }
      if (fresh.length === 0) return;

      if (user) {
        const { data, error } = await supabase
          .from("user_memory" as any)
          .insert(fresh.map((content) => ({ user_id: user.id, content, source, conversation_id: scopedConversationId })) as any)
          .select("id, content, source, conversation_id, created_at");
        if (!error && data) setMemories((prev) => [...((data as unknown) as MemoryItem[]), ...prev]);
      } else {
        const items: MemoryItem[] = fresh.map((content) => ({ id: createId(), content, source, conversation_id: scopedConversationId, created_at: nowIso() }));
        setMemories((prev) => {
          const next = [...items, ...prev];
          writeGuest(next);
          return next;
        });
      }
    },
    [user, memories]
  );

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

  return { memories, loading, enabled, setEnabled, addMemory, addMany, removeMemory, clearAll, reload: load };
}

/** Read current memory facts synchronously for sending with a chat request. */
export async function getMemorySnapshot(userId?: string, conversationId?: string | null): Promise<string[]> {
  if (!isMemoryEnabled()) return [];
  const scopedConversationId = conversationId ?? null;
  if (userId) {
    let query = supabase
      .from("user_memory" as any)
      .select("content")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_MEMORIES);
    query = scopedConversationId ? query.eq("conversation_id", scopedConversationId) : query.is("conversation_id", null);
    const { data } = await query;
    return (((data as unknown) as Array<{ content: string }>) || []).map((d) => d.content);
  }
  return readGuest()
    .filter((m) => (m.conversation_id ?? null) === scopedConversationId)
    .map((m) => m.content);
}
