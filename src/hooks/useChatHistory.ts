import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  images?: string[];
};

export type Conversation = {
  id: string;
  title: string;
  persona: string;
  deep_research: boolean;
  created_at: string;
  updated_at: string;
};

const GUEST_CONVOS_KEY = "streamscout_guest_ai_conversations";
const GUEST_MSGS_KEY = "streamscout_guest_ai_messages";

function nowIso() { return new Date().toISOString(); }
function createId() { return globalThis.crypto?.randomUUID?.() ?? `g-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }

function readLS<T>(key: string): T[] {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : []; } catch { return []; }
}
function writeLS<T>(key: string, v: T[]) { localStorage.setItem(key, JSON.stringify(v)); }

export function useChatHistory() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const loadConversations = useCallback(async () => {
    setLoadingHistory(true);
    if (user) {
      const { data } = await supabase
        .from("ai_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(50);
      setConversations((data as Conversation[]) || []);
    } else {
      const items = readLS<Conversation>(GUEST_CONVOS_KEY)
        .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      setConversations(items);
    }
    setLoadingHistory(false);
  }, [user]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const loadMessages = useCallback(async (convoId: string) => {
    setActiveId(convoId);
    if (user) {
      const { data } = await supabase
        .from("ai_messages")
        .select("*")
        .eq("conversation_id", convoId)
        .order("created_at", { ascending: true });
      const msgs: ChatMessage[] = (data || []).map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
        images: m.images?.length ? m.images : undefined,
      }));
      setMessages(msgs);
    } else {
      const all = readLS<any>(GUEST_MSGS_KEY)
        .filter((m: any) => m.conversation_id === convoId)
        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      setMessages(all.map((m: any) => ({ role: m.role, content: m.content, images: m.images })));
    }
  }, [user]);

  const createConversation = useCallback(async (persona: string, deepResearch: boolean): Promise<string> => {
    const now = nowIso();
    if (user) {
      const { data, error } = await supabase
        .from("ai_conversations")
        .insert({ user_id: user.id, persona, deep_research: deepResearch, title: "New Chat", created_at: now, updated_at: now })
        .select()
        .single();
      if (error || !data) throw new Error("Failed to create conversation");
      const convo = data as Conversation;
      setConversations(prev => [convo, ...prev]);
      setActiveId(convo.id);
      setMessages([]);
      return convo.id;
    } else {
      const id = createId();
      const convo: Conversation = { id, title: "New Chat", persona, deep_research: deepResearch, created_at: now, updated_at: now };
      const items = readLS<Conversation>(GUEST_CONVOS_KEY);
      items.unshift(convo);
      writeLS(GUEST_CONVOS_KEY, items);
      setConversations(prev => [convo, ...prev]);
      setActiveId(id);
      setMessages([]);
      return id;
    }
  }, [user]);

  const saveMessage = useCallback(async (convoId: string, msg: ChatMessage) => {
    const now = nowIso();
    if (user) {
      await supabase.from("ai_messages").insert({
        conversation_id: convoId, role: msg.role, content: msg.content,
        images: msg.images || [], created_at: now, updated_at: now,
      });
      const convo = conversations.find(c => c.id === convoId);
      if (convo?.title === "New Chat" && msg.role === "user") {
        const title = msg.content.slice(0, 50) + (msg.content.length > 50 ? "…" : "");
        await supabase.from("ai_conversations").update({ title, updated_at: now }).eq("id", convoId);
        setConversations(prev => prev.map(c => c.id === convoId ? { ...c, title, updated_at: now } : c));
      } else {
        await supabase.from("ai_conversations").update({ updated_at: now }).eq("id", convoId);
        setConversations(prev => prev.map(c => c.id === convoId ? { ...c, updated_at: now } : c));
      }
    } else {
      const allMsgs = readLS<any>(GUEST_MSGS_KEY);
      allMsgs.push({ id: createId(), conversation_id: convoId, role: msg.role, content: msg.content, images: msg.images || [], created_at: now, updated_at: now });
      writeLS(GUEST_MSGS_KEY, allMsgs);
      const convos = readLS<Conversation>(GUEST_CONVOS_KEY);
      const idx = convos.findIndex(c => c.id === convoId);
      if (idx !== -1) {
        if (convos[idx].title === "New Chat" && msg.role === "user") {
          convos[idx].title = msg.content.slice(0, 50) + (msg.content.length > 50 ? "…" : "");
        }
        convos[idx].updated_at = now;
        writeLS(GUEST_CONVOS_KEY, convos);
        setConversations([...convos].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
      }
    }
  }, [user, conversations]);

  const replaceMessages = useCallback(async (convoId: string, newMessages: ChatMessage[]) => {
    if (user) {
      await supabase.from("ai_messages").delete().eq("conversation_id", convoId);
      const now = nowIso();
      const inserts = newMessages.map((m, i) => ({
        conversation_id: convoId, role: m.role, content: m.content,
        images: m.images || [], created_at: new Date(Date.now() + i).toISOString(), updated_at: now,
      }));
      if (inserts.length) await supabase.from("ai_messages").insert(inserts);
    } else {
      const allMsgs = readLS<any>(GUEST_MSGS_KEY).filter((m: any) => m.conversation_id !== convoId);
      const now = nowIso();
      newMessages.forEach((m, i) => {
        allMsgs.push({ id: createId(), conversation_id: convoId, role: m.role, content: m.content, images: m.images || [], created_at: new Date(Date.now() + i).toISOString(), updated_at: now });
      });
      writeLS(GUEST_MSGS_KEY, allMsgs);
    }
  }, [user]);

  const deleteConversation = useCallback(async (convoId: string) => {
    if (user) {
      await supabase.from("ai_messages").delete().eq("conversation_id", convoId);
      await supabase.from("ai_conversations").delete().eq("id", convoId);
    } else {
      writeLS(GUEST_CONVOS_KEY, readLS<Conversation>(GUEST_CONVOS_KEY).filter(c => c.id !== convoId));
      writeLS(GUEST_MSGS_KEY, readLS<any>(GUEST_MSGS_KEY).filter((m: any) => m.conversation_id !== convoId));
    }
    setConversations(prev => prev.filter(c => c.id !== convoId));
    if (activeId === convoId) { setActiveId(null); setMessages([]); }
  }, [user, activeId]);

  const renameConversation = useCallback(async (convoId: string, newTitle: string) => {
    if (user) {
      await supabase.from("ai_conversations").update({ title: newTitle, updated_at: nowIso() }).eq("id", convoId);
    } else {
      const convos = readLS<Conversation>(GUEST_CONVOS_KEY);
      const idx = convos.findIndex(c => c.id === convoId);
      if (idx !== -1) { convos[idx].title = newTitle; writeLS(GUEST_CONVOS_KEY, convos); }
    }
    setConversations(prev => prev.map(c => c.id === convoId ? { ...c, title: newTitle } : c));
  }, [user]);

  const startNewChat = useCallback(() => {
    setActiveId(null);
    setMessages([]);
  }, []);

  return {
    conversations, activeId, messages, setMessages, loadingHistory,
    loadConversations, loadMessages, createConversation, saveMessage,
    replaceMessages, deleteConversation, startNewChat, setActiveId,
    renameConversation,
  };
}
