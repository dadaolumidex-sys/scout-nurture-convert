/**
 * Small, device-local draft storage. Drafts are deliberately not sent to
 * Supabase: they are private working text until the user chooses Send.
 */
export function readDraft(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

export function writeDraft(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // A full or unavailable browser store should never interrupt typing.
  }
}

export function readDraftRecord<T>(key: string, fallback: T): T {
  const raw = readDraft(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeDraftRecord(key: string, value: unknown) {
  try {
    writeDraft(key, JSON.stringify(value));
  } catch {
    // Ignore a malformed/unserializable draft rather than disrupting the UI.
  }
}
