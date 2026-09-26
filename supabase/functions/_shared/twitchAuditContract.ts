export const AUDIT_VERSION = "twitch-audit-v1" as const;

const RESERVED_PATHS = new Set([
  "directory", "downloads", "settings", "subscriptions", "inventory", "wallet",
  "videos", "clip", "clips", "search", "login", "signup", "p", "turbo", "jobs",
]);

/** Accept a login or an exact Twitch channel URL, never a substring match. */
export function parseTwitchChannel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (/[\\\s]/.test(value) || /(?:^|\/)\.{1,2}(?:\/|[?#]|$)/.test(value)) return null;
  let login = value;
  if (!/^[a-zA-Z0-9_]{1,25}$/.test(value)) {
    try {
      const url = new URL(/^[\w+.-]+:\/\//.test(value) ? value : `https://${value}`);
      if (!['https:', 'http:'].includes(url.protocol)
        || !['twitch.tv', 'www.twitch.tv', 'm.twitch.tv'].includes(url.hostname)
        || url.username || url.password || url.port
        || !/^\/[a-zA-Z0-9_]{1,25}\/?$/.test(url.pathname)) return null;
      login = url.pathname.split('/')[1];
    } catch { return null; }
  }
  login = login.toLowerCase();
  return RESERVED_PATHS.has(login) ? null : login;
}

export type AuditSection<T> = {
  status: "available" | "unavailable";
  data: T | null;
  reason: string | null;
};

export type AuditProfile = {
  id: string;
  login: string;
  displayName: string;
  description: string | null;
  profileImageUrl: string | null;
  broadcasterType: "partner" | "affiliate" | "" | null;
  createdAt: string | null;
};

export type AuditStream = {
  isLive: boolean;
  title: string | null;
  category: string | null;
  viewers: number | null;
  startedAt: string | null;
};

export type AuditChannel = {
  title: string | null;
  category: string | null;
  language: string | null;
};

export type AuditVideo = {
  id: string;
  title: string | null;
  createdAt: string | null;
  duration: string | null;
  views: number | null;
};

export type ChannelAudit = {
  version: typeof AUDIT_VERSION;
  platform: "twitch";
  source: "Twitch Helix API";
  fetchedAt: string;
  profile: AuditProfile;
  followers: AuditSection<number>;
  stream: AuditSection<AuditStream>;
  channel: AuditSection<AuditChannel>;
  videos: AuditSection<AuditVideo[]>;
};
