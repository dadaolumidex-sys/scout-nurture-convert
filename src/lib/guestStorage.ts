import { safeGet, safeSetJson } from "@/lib/safeStorage";

type TimestampedRecord = {
  id: string;
  created_at: string;
  updated_at: string;
};

export type GuestContactRecord = TimestampedRecord & {
  user_id: null;
  username: string;
  display_name: string | null;
  platform: string;
  channel_url: string | null;
  growth_stage: string | null;
  avg_viewers: string | null;
  status: string | null;
  last_message: string | null;
  profile_image_url: string | null;
  conversation_type: string | null;
  description: string | null;
  broadcaster_type: string | null;
  created_at_twitch: string | null;
  followers_estimate: string | null;
  streaming_frequency: string | null;
  strengths: string[] | null;
  weaknesses: string[] | null;
  opportunities: string[] | null;
  promotion_potential: string | null;
  friend_message: string | null;
  promoter_message: string | null;
  is_live: boolean | null;
  live_title: string | null;
  live_game: string | null;
  live_viewers: number | null;
  client_profile?: {
    goal?: string;
    offer?: string;
    signals?: string;
    notes?: string;
    nextStep?: string;
  } | null;
};

export type GuestContactMessageRecord = TimestampedRecord & {
  user_id: null;
  contact_id: string;
  role: string;
  content: string;
  persona: string | null;
  image_url: string | null;
  selected: boolean;
  source?: string | null;
};

export type GuestKnowledgeEntryRecord = TimestampedRecord & {
  user_id: null;
  title: string;
  source_type: string;
  source_url: string | null;
  content: string;
  persona: string;
  category: string;
  insights: Array<{ category: string; insight: string }>;
};

export type GuestTrainingConversationRecord = TimestampedRecord & {
  user_id: null;
  title: string;
  persona: string;
  source_type: string;
  content: string;
  style_analysis: string | null;
  status: string;
};

export type GuestAnalyticsEventRecord = {
  id: string;
  user_id: null;
  event_type: string;
  persona: string | null;
  streamer_username: string | null;
  platform: string | null;
  revenue: number;
  created_at: string;
};

const STORAGE_KEYS = {
  contacts: "streamscout_guest_contacts",
  messages: "streamscout_guest_contact_messages",
  knowledge: "streamscout_guest_knowledge_entries",
  training: "streamscout_guest_training_conversations",
  analytics: "streamscout_guest_analytics_events",
} as const;

const isBrowser = typeof window !== "undefined";

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readCollection<T>(key: string): T[] {
  if (!isBrowser) return [];

  try {
    const raw = safeGet(key);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeCollection<T>(key: string, value: T[]) {
  if (!isBrowser) return;
  // Quota-aware: a full browser store must never throw mid-save and lose data.
  safeSetJson(key, value);
}

function sortByCreatedDesc<T extends { created_at?: string | null }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
  );
}

function sortByCreatedAsc<T extends { created_at?: string | null }>(items: T[]) {
  return [...items].sort(
    (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
  );
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export const guestStorage = {
  contacts: {
    list() {
      return sortByCreatedDesc(readCollection<GuestContactRecord>(STORAGE_KEYS.contacts));
    },
    get(id: string) {
      return readCollection<GuestContactRecord>(STORAGE_KEYS.contacts).find((item) => item.id === id) ?? null;
    },
    insert(input: Partial<GuestContactRecord> & Pick<GuestContactRecord, "username" | "platform">) {
      const items = readCollection<GuestContactRecord>(STORAGE_KEYS.contacts);
      const createdAt = nowIso();
      const next: GuestContactRecord = {
        id: createId(),
        created_at: createdAt,
        updated_at: createdAt,
        user_id: null,
        display_name: null,
        channel_url: null,
        growth_stage: null,
        avg_viewers: null,
        status: "new",
        last_message: null,
        profile_image_url: null,
        conversation_type: null,
        description: null,
        broadcaster_type: null,
        created_at_twitch: null,
        followers_estimate: null,
        streaming_frequency: null,
        strengths: null,
        weaknesses: null,
        opportunities: null,
        promotion_potential: null,
        friend_message: null,
        promoter_message: null,
        is_live: null,
        live_title: null,
        live_game: null,
        live_viewers: null,
        client_profile: {},
        ...input,
      };

      items.push(next);
      writeCollection(STORAGE_KEYS.contacts, items);
      return next;
    },
    upsert(input: Partial<GuestContactRecord> & Pick<GuestContactRecord, "username" | "platform">) {
      const items = readCollection<GuestContactRecord>(STORAGE_KEYS.contacts);
      const existingIndex = items.findIndex(
        (item) => item.id === input.id || (item.username === input.username && item.platform === input.platform)
      );

      if (existingIndex === -1) {
        return this.insert(input);
      }

      const existing = items[existingIndex];
      const next: GuestContactRecord = {
        ...existing,
        ...input,
        id: existing.id,
        created_at: existing.created_at,
        updated_at: nowIso(),
        user_id: null,
      };

      items[existingIndex] = next;
      writeCollection(STORAGE_KEYS.contacts, items);
      return next;
    },
    update(id: string, patch: Partial<GuestContactRecord>) {
      const items = readCollection<GuestContactRecord>(STORAGE_KEYS.contacts);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return null;

      items[index] = {
        ...items[index],
        ...patch,
        id,
        updated_at: nowIso(),
        user_id: null,
      };

      writeCollection(STORAGE_KEYS.contacts, items);
      return items[index];
    },
    remove(id: string) {
      writeCollection(STORAGE_KEYS.contacts, readCollection<GuestContactRecord>(STORAGE_KEYS.contacts).filter((item) => item.id !== id));
      writeCollection(STORAGE_KEYS.messages, readCollection<GuestContactMessageRecord>(STORAGE_KEYS.messages).filter((item) => item.contact_id !== id));
    },
  },

  messages: {
    list(contactId: string) {
      const items = readCollection<GuestContactMessageRecord>(STORAGE_KEYS.messages).filter(
        (item) => item.contact_id === contactId
      );
      return sortByCreatedAsc(items);
    },
    insert(input: Omit<GuestContactMessageRecord, "id" | "created_at" | "updated_at" | "user_id">) {
      const items = readCollection<GuestContactMessageRecord>(STORAGE_KEYS.messages);
      const createdAt = nowIso();
      const next: GuestContactMessageRecord = {
        id: createId(),
        created_at: createdAt,
        updated_at: createdAt,
        user_id: null,
        ...input,
      };

      items.push(next);
      writeCollection(STORAGE_KEYS.messages, items);
      return next;
    },
    update(id: string, patch: Partial<GuestContactMessageRecord>) {
      const items = readCollection<GuestContactMessageRecord>(STORAGE_KEYS.messages);
      const index = items.findIndex((item) => item.id === id);
      if (index === -1) return null;

      items[index] = {
        ...items[index],
        ...patch,
        id,
        updated_at: nowIso(),
        user_id: null,
      };

      writeCollection(STORAGE_KEYS.messages, items);
      return items[index];
    },
    remove(id: string) {
      const items = readCollection<GuestContactMessageRecord>(STORAGE_KEYS.messages).filter(
        (item) => item.id !== id
      );
      writeCollection(STORAGE_KEYS.messages, items);
    },
  },

  knowledge: {
    list() {
      return sortByCreatedDesc(readCollection<GuestKnowledgeEntryRecord>(STORAGE_KEYS.knowledge));
    },
    insert(input: Omit<GuestKnowledgeEntryRecord, "id" | "created_at" | "updated_at" | "user_id">) {
      const items = readCollection<GuestKnowledgeEntryRecord>(STORAGE_KEYS.knowledge);
      const createdAt = nowIso();
      const next: GuestKnowledgeEntryRecord = {
        id: createId(),
        created_at: createdAt,
        updated_at: createdAt,
        user_id: null,
        ...input,
      };
      items.push(next);
      writeCollection(STORAGE_KEYS.knowledge, items);
      return next;
    },
    remove(id: string) {
      const items = readCollection<GuestKnowledgeEntryRecord>(STORAGE_KEYS.knowledge).filter(
        (item) => item.id !== id
      );
      writeCollection(STORAGE_KEYS.knowledge, items);
    },
  },

  training: {
    list() {
      return sortByCreatedDesc(readCollection<GuestTrainingConversationRecord>(STORAGE_KEYS.training));
    },
    insert(input: Omit<GuestTrainingConversationRecord, "id" | "created_at" | "updated_at" | "user_id">) {
      const items = readCollection<GuestTrainingConversationRecord>(STORAGE_KEYS.training);
      const createdAt = nowIso();
      const next: GuestTrainingConversationRecord = {
        id: createId(),
        created_at: createdAt,
        updated_at: createdAt,
        user_id: null,
        ...input,
      };
      items.push(next);
      writeCollection(STORAGE_KEYS.training, items);
      return next;
    },
    remove(id: string) {
      const items = readCollection<GuestTrainingConversationRecord>(STORAGE_KEYS.training).filter(
        (item) => item.id !== id
      );
      writeCollection(STORAGE_KEYS.training, items);
    },
  },

  analytics: {
    list() {
      return sortByCreatedDesc(readCollection<GuestAnalyticsEventRecord>(STORAGE_KEYS.analytics));
    },
    insert(input: Omit<GuestAnalyticsEventRecord, "id" | "created_at" | "user_id">) {
      const items = readCollection<GuestAnalyticsEventRecord>(STORAGE_KEYS.analytics);
      const next: GuestAnalyticsEventRecord = {
        id: createId(),
        created_at: nowIso(),
        user_id: null,
        ...input,
      };
      items.push(next);
      writeCollection(STORAGE_KEYS.analytics, items);
      return next;
    },
  },
};
