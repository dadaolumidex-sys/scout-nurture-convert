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

type StoredMessage = ChatMessage & {
  id: string;
  conversation_id: string;
  created_at: string;
  updated_at: string;
};

const GUEST_CONVOS_KEY = "streamscout_guest_ai_conversations";
const GUEST_MSGS_KEY = "streamscout_guest_ai_messages";
const GUEST_CONVOS_BACKUP_KEY = "streamscout_guest_ai_conversations_backup";
const GUEST_MSGS_BACKUP_KEY = "streamscout_guest_ai_messages_backup";
const GUEST_MIGRATION_PREFIX = "streamscout_guest_ai_migrated";
const ACTIVE_CONVERSATION_KEY = "streamscout_active_ai_conversation";

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `g-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildTitle(content: string) {
  const trimmed = content.trim() || "New Chat";
  return trimmed.length > 50 ? `${trimmed.slice(0, 50)}…` : trimmed;
}

function sortConversations(items: Conversation[]) {
  return [...items].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
}

function sortStoredMessages<T extends { created_at: string }>(items: T[]) {
  return [...items].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

function readLS<T>(key: string, backupKey?: string): T[] {
  if (typeof window === "undefined") return [];

  const parse = (raw: string | null) => {
    if (!raw) return [] as T[];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [] as T[];
    }
  };

  const primary = parse(window.localStorage.getItem(key));
  if (primary.length > 0) return primary;

  const backup = parse(backupKey ? window.localStorage.getItem(backupKey) : null);
  if (backup.length > 0 && backupKey) {
    window.localStorage.setItem(key, JSON.stringify(backup));
  }

  return backup;
}

function writeLS<T>(key: string, value: T[], backupKey?: string) {
  if (typeof window === "undefined") return;
  const serialized = JSON.stringify(value);
  window.localStorage.setItem(key, serialized);
  if (backupKey) window.localStorage.setItem(backupKey, serialized);
}

function removeLS(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

function getUserConversationCacheKey(userId: string) {
  return `streamscout_cached_ai_conversations_${userId}`;
}

function getUserMessageCacheKey(userId: string, convoId: string) {
  return `streamscout_cached_ai_messages_${userId}_${convoId}`;
}

function getActiveConversationKey(userId?: string) {
  return userId ? `${ACTIVE_CONVERSATION_KEY}_${userId}` : `${ACTIVE_CONVERSATION_KEY}_guest`;
}

function readActiveConversation(userId?: string) {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(getActiveConversationKey(userId));
}

function writeActiveConversation(userId: string | undefined, convoId: string | null) {
  if (typeof window === "undefined") return;
  const key = getActiveConversationKey(userId);
  if (!convoId) {
    window.localStorage.removeItem(key);
    return;
  }
  window.localStorage.setItem(key, convoId);
}

function readGuestConversations() {
  return sortConversations(readLS<Conversation>(GUEST_CONVOS_KEY, GUEST_CONVOS_BACKUP_KEY));
}

function writeGuestConversations(items: Conversation[]) {
  writeLS(GUEST_CONVOS_KEY, sortConversations(items), GUEST_CONVOS_BACKUP_KEY);
}

function readGuestMessages() {
  return sortStoredMessages(readLS<StoredMessage>(GUEST_MSGS_KEY, GUEST_MSGS_BACKUP_KEY));
}

function writeGuestMessages(items: StoredMessage[]) {
  writeLS(GUEST_MSGS_KEY, sortStoredMessages(items), GUEST_MSGS_BACKUP_KEY);
}

function readCachedConversations(userId: string) {
  return sortConversations(readLS<Conversation>(getUserConversationCacheKey(userId)));
}

function writeCachedConversations(userId: string, items: Conversation[]) {
  writeLS(getUserConversationCacheKey(userId), sortConversations(items));
}

function readCachedMessages(userId: string, convoId: string) {
  return sortStoredMessages(readLS<StoredMessage>(getUserMessageCacheKey(userId, convoId)));
}

function writeCachedMessages(userId: string, convoId: string, items: StoredMessage[]) {
  writeLS(getUserMessageCacheKey(userId, convoId), sortStoredMessages(items));
}

function toChatMessages(records: StoredMessage[]): ChatMessage[] {
  return records.map((record) => ({
    role: record.role,
    content: record.content,
    images: record.images?.length ? record.images : undefined,
  }));
}

function toStoredMessage(convoId: string, msg: ChatMessage, createdAt = nowIso()): StoredMessage {
  return {
    id: createId(),
    conversation_id: convoId,
    role: msg.role,
    content: msg.content,
    images: msg.images?.length ? [...msg.images] : undefined,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

export function useChatHistory() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  // Guards against out-of-order loads: an older fetch must never paint its
  // messages into a conversation the user has already switched away from.
  const loadTokenRef = useRef(0);


  const migrateGuestHistory = useCallback(async () => {
    if (!user || typeof window === "undefined") return;

    const guestConversations = readGuestConversations();
    if (guestConversations.length === 0) return;

    const guestMessages = readGuestMessages();
    const migrationKey = `${GUEST_MIGRATION_PREFIX}_${user.id}`;
    const migratedIds = new Set(readLS<string>(migrationKey));
    const cachedConversations = readCachedConversations(user.id);
    let didMigrate = false;

    for (const guestConversation of guestConversations) {
      if (migratedIds.has(guestConversation.id)) continue;

      const { data: createdConversation, error: conversationError } = await supabase
        .from("ai_conversations")
        .insert({
          user_id: user.id,
          title: guestConversation.title,
          persona: guestConversation.persona,
          deep_research: guestConversation.deep_research,
          created_at: guestConversation.created_at,
          updated_at: guestConversation.updated_at,
        })
        .select()
        .single();

      if (conversationError || !createdConversation) continue;

      const relatedMessages = guestMessages
        .filter((message) => message.conversation_id === guestConversation.id)
        .map((message) => ({
          ...message,
          conversation_id: createdConversation.id,
        }));

      if (relatedMessages.length > 0) {
        await supabase.from("ai_messages").insert(
          relatedMessages.map(({ role, content, images, created_at, updated_at }) => ({
            conversation_id: createdConversation.id,
            role,
            content,
            images: images || [],
            created_at,
            updated_at,
          }))
        );
        writeCachedMessages(user.id, createdConversation.id, relatedMessages);
      }

      cachedConversations.push(createdConversation as Conversation);
      migratedIds.add(guestConversation.id);
      writeLS(migrationKey, Array.from(migratedIds));
      didMigrate = true;
    }

    if (didMigrate) {
      writeCachedConversations(user.id, cachedConversations);
    }
  }, [user]);

  const loadConversations = useCallback(async () => {
    setLoadingHistory(true);

    if (user) {
      await migrateGuestHistory();

      const { data, error } = await supabase
        .from("ai_conversations")
        .select("*")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error) {
        setConversations(readCachedConversations(user.id));
      } else {
        const nextConversations = sortConversations((data as Conversation[]) || []);
        setConversations(nextConversations);
        writeCachedConversations(user.id, nextConversations);
      }
    } else {
      setConversations(readGuestConversations());
    }

    setLoadingHistory(false);
  }, [migrateGuestHistory, user]);

  const loadMessages = useCallback(async (convoId: string) => {
    setActiveId(convoId);
    writeActiveConversation(user?.id, convoId);

    if (user) {
      const { data, error } = await supabase
        .from("ai_messages")
        .select("*")
        .eq("conversation_id", convoId)
        .order("created_at", { ascending: true });

      if (error) {
        setMessages(toChatMessages(readCachedMessages(user.id, convoId)));
        return;
      }

      const storedMessages = sortStoredMessages(
        (data || []).map((message: any) => ({
          id: message.id,
          conversation_id: message.conversation_id,
          role: message.role as "user" | "assistant",
          content: message.content,
          images: message.images?.length ? message.images : undefined,
          created_at: message.created_at,
          updated_at: message.updated_at,
        }))
      );

      writeCachedMessages(user.id, convoId, storedMessages);
      setMessages(toChatMessages(storedMessages));
    } else {
      const guestMessages = readGuestMessages().filter((message) => message.conversation_id === convoId);
      setMessages(toChatMessages(guestMessages));
    }
  }, [user]);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (loadingHistory || activeId || conversations.length === 0) return;
    const persistedId = readActiveConversation(user?.id);
    if (!persistedId || !conversations.some((conversation) => conversation.id === persistedId)) return;
    void loadMessages(persistedId);
  }, [activeId, conversations, loadMessages, loadingHistory, user]);

  const createConversation = useCallback(async (persona: string, deepResearch: boolean): Promise<string> => {
    const now = nowIso();

    if (user) {
      const { data, error } = await supabase
        .from("ai_conversations")
        .insert({
          user_id: user.id,
          persona,
          deep_research: deepResearch,
          title: "New Chat",
          created_at: now,
          updated_at: now,
        })
        .select()
        .single();

      if (error || !data) throw new Error("Failed to create conversation");

      const conversation = data as Conversation;
      setConversations((prev) => {
        const next = sortConversations([conversation, ...prev.filter((item) => item.id !== conversation.id)]);
        writeCachedConversations(user.id, next);
        return next;
      });
      writeCachedMessages(user.id, conversation.id, []);
      setActiveId(conversation.id);
      writeActiveConversation(user.id, conversation.id);
      setMessages([]);
      return conversation.id;
    }

    const id = createId();
    const conversation: Conversation = {
      id,
      title: "New Chat",
      persona,
      deep_research: deepResearch,
      created_at: now,
      updated_at: now,
    };

    const nextConversations = sortConversations([conversation, ...readGuestConversations().filter((item) => item.id !== id)]);
    writeGuestConversations(nextConversations);
    setConversations(nextConversations);
    setActiveId(id);
    writeActiveConversation(undefined, id);
    setMessages([]);
    return id;
  }, [user]);

  const saveMessage = useCallback(async (convoId: string, msg: ChatMessage) => {
    const now = nowIso();
    const storedMessage = toStoredMessage(convoId, msg, now);

    if (user) {
      await supabase.from("ai_messages").insert({
        conversation_id: convoId,
        role: msg.role,
        content: msg.content,
        images: msg.images || [],
        created_at: now,
        updated_at: now,
      });

      const currentConversation = conversations.find((conversation) => conversation.id === convoId);
      const shouldRename = msg.role === "user" && (!currentConversation || currentConversation.title === "New Chat");
      const nextTitle = shouldRename ? buildTitle(msg.content) : currentConversation?.title ?? "New Chat";

      if (shouldRename) {
        await supabase.from("ai_conversations").update({ title: nextTitle, updated_at: now }).eq("id", convoId);
      } else {
        await supabase.from("ai_conversations").update({ updated_at: now }).eq("id", convoId);
      }

      writeCachedMessages(user.id, convoId, [...readCachedMessages(user.id, convoId), storedMessage]);
      setConversations((prev) => {
        const next = sortConversations(
          prev.map((conversation) => (
            conversation.id === convoId
              ? { ...conversation, title: shouldRename ? nextTitle : conversation.title, updated_at: now }
              : conversation
          ))
        );
        writeCachedConversations(user.id, next);
        return next;
      });
      return;
    }

    const nextGuestMessages = [...readGuestMessages(), storedMessage];
    writeGuestMessages(nextGuestMessages);

    const nextGuestConversations = sortConversations(
      readGuestConversations().map((conversation) => {
        if (conversation.id !== convoId) return conversation;
        return {
          ...conversation,
          title: conversation.title === "New Chat" && msg.role === "user" ? buildTitle(msg.content) : conversation.title,
          updated_at: now,
        };
      })
    );

    writeGuestConversations(nextGuestConversations);
    setConversations(nextGuestConversations);
  }, [conversations, user]);

  const replaceMessages = useCallback(async (convoId: string, newMessages: ChatMessage[]) => {
    const now = nowIso();
    const nextStoredMessages = newMessages.map((message, index) =>
      toStoredMessage(convoId, message, new Date(Date.now() + index).toISOString())
    );

    if (user) {
      await supabase.from("ai_messages").delete().eq("conversation_id", convoId);

      if (nextStoredMessages.length > 0) {
        await supabase.from("ai_messages").insert(
          nextStoredMessages.map(({ role, content, images, created_at, updated_at }) => ({
            conversation_id: convoId,
            role,
            content,
            images: images || [],
            created_at,
            updated_at,
          }))
        );
      }

      writeCachedMessages(user.id, convoId, nextStoredMessages);
      await supabase.from("ai_conversations").update({ updated_at: now }).eq("id", convoId);
      setConversations((prev) => {
        const next = sortConversations(prev.map((conversation) => (
          conversation.id === convoId ? { ...conversation, updated_at: now } : conversation
        )));
        writeCachedConversations(user.id, next);
        return next;
      });
      return;
    }

    const remainingMessages = readGuestMessages().filter((message) => message.conversation_id !== convoId);
    writeGuestMessages([...remainingMessages, ...nextStoredMessages]);

    const nextGuestConversations = sortConversations(
      readGuestConversations().map((conversation) => (
        conversation.id === convoId ? { ...conversation, updated_at: now } : conversation
      ))
    );
    writeGuestConversations(nextGuestConversations);
    setConversations(nextGuestConversations);
  }, [user]);

  const deleteConversation = useCallback(async (convoId: string) => {
    if (user) {
      await supabase.from("ai_messages").delete().eq("conversation_id", convoId);
      await supabase.from("ai_conversations").delete().eq("id", convoId);
      removeLS(getUserMessageCacheKey(user.id, convoId));
      setConversations((prev) => {
        const next = prev.filter((conversation) => conversation.id !== convoId);
        writeCachedConversations(user.id, next);
        return next;
      });
    } else {
      writeGuestConversations(readGuestConversations().filter((conversation) => conversation.id !== convoId));
      writeGuestMessages(readGuestMessages().filter((message) => message.conversation_id !== convoId));
      setConversations((prev) => prev.filter((conversation) => conversation.id !== convoId));
    }

    if (activeId === convoId) {
      setActiveId(null);
      writeActiveConversation(user?.id, null);
      setMessages([]);
    }
  }, [activeId, user]);

  const renameConversation = useCallback(async (convoId: string, newTitle: string) => {
    const nextUpdatedAt = nowIso();

    if (user) {
      await supabase.from("ai_conversations").update({ title: newTitle, updated_at: nextUpdatedAt }).eq("id", convoId);
      setConversations((prev) => {
        const next = sortConversations(
          prev.map((conversation) => (
            conversation.id === convoId ? { ...conversation, title: newTitle, updated_at: nextUpdatedAt } : conversation
          ))
        );
        writeCachedConversations(user.id, next);
        return next;
      });
      return;
    }

    const nextGuestConversations = sortConversations(
      readGuestConversations().map((conversation) => (
        conversation.id === convoId ? { ...conversation, title: newTitle, updated_at: nextUpdatedAt } : conversation
      ))
    );
    writeGuestConversations(nextGuestConversations);
    setConversations(nextGuestConversations);
  }, [user]);

  const startNewChat = useCallback(() => {
    setActiveId(null);
    writeActiveConversation(user?.id, null);
    setMessages([]);
  }, [user]);

  /**
   * Grab the last few messages from the most recent PREVIOUS conversation so a
   * brand-new chat can still "remember" what you were just talking about.
   * `excludeId` skips the current/active conversation.
   */
  const getRecentContext = useCallback(
    async (excludeId: string | null, limit = 6): Promise<ChatMessage[]> => {
      if (user) {
        const { data: convos } = await supabase
          .from("ai_conversations")
          .select("id")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(5);
        const target = (convos || []).find((c: { id: string }) => c.id !== excludeId);
        if (!target) return [];
        const { data } = await supabase
          .from("ai_messages")
          .select("role, content, created_at")
          .eq("conversation_id", target.id)
          .order("created_at", { ascending: false })
          .limit(limit);
        return sortStoredMessages((data as any[]) || [])
          .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
          .filter((m) => m.content?.trim());
      }

      const convos = readGuestConversations().filter((c) => c.id !== excludeId);
      if (convos.length === 0) return [];
      const target = convos[0];
      const msgs = readGuestMessages()
        .filter((m) => m.conversation_id === target.id)
        .slice(-limit);
      return msgs.map((m) => ({ role: m.role, content: m.content })).filter((m) => m.content?.trim());
    },
    [user]
  );

  return {
    conversations,
    activeId,
    messages,
    setMessages,
    loadingHistory,
    loadConversations,
    loadMessages,
    createConversation,
    saveMessage,
    replaceMessages,
    deleteConversation,
    startNewChat,
    setActiveId,
    renameConversation,
    getRecentContext,
  };
}
