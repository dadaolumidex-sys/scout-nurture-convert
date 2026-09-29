export const KICK_AUDIT_VERSION = "kick-audit-v1" as const;

export type KickFinding = {
  evidenceId: string;
  evidence: string;
  title: string;
  possibleImpact: string;
  fix: string;
  test: string;
};

export type KickAudit = {
  version: typeof KICK_AUDIT_VERSION;
  platform: "kick";
  source: "Kick Developer Public API";
  fetchedAt: string;
  profile: {
    id: string;
    slug: string;
    displayName: string;
    description: string | null;
    profileImageUrl: string | null;
  };
  channel: {
    title: string | null;
    category: string | null;
    bannerUrl: string | null;
  };
  stream: {
    isLive: boolean | null;
    viewers: number | null;
    startedAt: string | null;
  };
  ai: {
    status: "available" | "unavailable";
    reason: string | null;
    findings: KickFinding[];
  };
};

export function parseKickChannel(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  if (/^[a-z0-9_-]{1,25}$/i.test(value)) return value.toLowerCase();
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["kick.com", "www.kick.com"].includes(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length !== 1 || !/^[a-z0-9_-]{1,25}$/i.test(parts[0])) return null;
    return parts[0].toLowerCase();
  } catch { return null; }
}
