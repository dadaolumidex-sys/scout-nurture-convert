/**
 * Quota-aware localStorage helpers.
 *
 * The app caches chats, drafts and guest data locally. Once the browser's
 * ~5MB localStorage quota is hit, EVERY setItem throws a QuotaExceededError,
 * which used to bubble up and break sending messages, saving drafts and
 * switching conversations. These helpers never throw: they prune the least
 * important cached data and retry, and give up silently as a last resort.
 */

const isBrowser = typeof window !== "undefined";

/** Cache key prefixes ordered from most disposable to least. */
const PRUNE_PREFIXES = [
  "streamscout_cached_ai_messages_",
  "streamscout_cached_ai_conversations_",
  "streamscout_draft_",
  "streamscout_",
];

function isQuotaError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    /quota/i.test(error.message)
  );
}

function keys() {
  const out: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const k = window.localStorage.key(i);
    if (k) out.push(k);
  }
  return out;
}

/** Drops disposable cached entries (largest first) to make room. */
function pruneOnce(protectedKey: string): boolean {
  const all = keys().filter((k) => k !== protectedKey);
  for (const prefix of PRUNE_PREFIXES) {
    const candidates = all
      .filter((k) => k.startsWith(prefix))
      .map((k) => ({ k, size: window.localStorage.getItem(k)?.length ?? 0 }))
      .sort((a, b) => b.size - a.size);
    if (candidates.length > 0) {
      window.localStorage.removeItem(candidates[0].k);
      return true;
    }
  }
  return false;
}

export function safeGet(key: string): string | null {
  if (!isBrowser) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeRemove(key: string) {
  if (!isBrowser) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Returns true when the value was persisted. Never throws. */
export function safeSet(key: string, value: string): boolean {
  if (!isBrowser) return false;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      if (!isQuotaError(error)) return false;
      if (!pruneOnce(key)) {
        safeRemove(key);
        return false;
      }
    }
  }
  return false;
}

export function safeSetJson(key: string, value: unknown): boolean {
  try {
    return safeSet(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/** Approximate bytes currently used by this origin. */
export function storageUsageBytes(): number {
  if (!isBrowser) return 0;
  try {
    return keys().reduce((sum, k) => sum + k.length + (window.localStorage.getItem(k)?.length ?? 0), 0) * 2;
  } catch {
    return 0;
  }
}

/** Clears cached chat/search data but keeps auth, settings and drafts. */
export function clearAppCaches() {
  if (!isBrowser) return;
  try {
    keys()
      .filter((k) => k.startsWith("streamscout_cached_"))
      .forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
