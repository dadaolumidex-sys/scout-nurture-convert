import { createTwitchAuditHandler } from "./twitchAudit.ts";
import { parseTwitchChannel } from "./twitchAuditContract.ts";
import type { AuditSection, ChannelAudit } from "./twitchAuditContract.ts";

type Env = (name: string) => string | undefined;
const TOKEN = /^[a-f0-9]{64}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

/** Explicit projection: never serialize an entire user object or upstream payload. */
export function publicAuditSnapshot(audit: ChannelAudit): ChannelAudit {
  const section = <T, U>(part: AuditSection<T>, map: (data: T) => U): AuditSection<U> => part.status === "available" && part.data !== null
    ? { status: "available", data: map(part.data), reason: null }
    : { status: "unavailable", data: null, reason: "Twitch data was unavailable when this snapshot was retrieved." };
  const p = audit.profile;
  return {
    version: "twitch-audit-v1", platform: "twitch", source: "Twitch Helix API", fetchedAt: audit.fetchedAt,
    profile: { id: p.id, login: p.login, displayName: p.displayName, description: p.description,
      profileImageUrl: p.profileImageUrl, broadcasterType: p.broadcasterType, createdAt: p.createdAt },
    followers: section(audit.followers, (total) => total),
    stream: section(audit.stream, (s) => ({ isLive: s.isLive, title: s.title, category: s.category, viewers: s.viewers, startedAt: s.startedAt })),
    channel: section(audit.channel, (c) => ({ title: c.title, category: c.category, language: c.language })),
    videos: section(audit.videos, (videos) => videos.map((v) => ({ id: v.id, title: v.title, createdAt: v.createdAt, duration: v.duration, views: v.views }))),
  };
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function createAuditShareHandler(env: Env, fetcher: typeof fetch = fetch, cryptography: Crypto = crypto) {
  const runAudit = createTwitchAuditHandler(env, fetcher);
  const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
    status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex, nofollow, noarchive" },
  });
  const hash = async (token: string) => hex(new Uint8Array(await cryptography.subtle.digest("SHA-256", new TextEncoder().encode(token))));
  const boundedFetch = async (url: string, init: RequestInit) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetcher(url, { ...init, signal: controller.signal });
      // Bound body consumption as well as response headers. Never reflect error bodies.
      const data: unknown = response.ok ? await response.json() : null;
      if (!response.ok) void response.body?.cancel().catch(() => {});
      return { ok: response.ok, json: async () => data };
    } finally { clearTimeout(timer); }
  };

  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    let input: Record<string, unknown>;
    try {
      // Small requests contain only an action and a login, token, or share ID.
      const raw = await req.text();
      if (raw.length > 1024) return json({ error: "Request too large." }, 413);
      input = JSON.parse(raw);
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error();
    } catch { return json({ error: "Invalid request." }, 400); }
    const action = input.action;
    const allowed = action === "create" ? ["action", "username"] : action === "read" ? ["action", "token"] : action === "revoke" ? ["action", "id"] : action === "list" ? ["action"] : [];
    if (!allowed.length || Object.keys(input).some((key) => !allowed.includes(key))) return json({ error: "Invalid share request." }, 400);
    if (action === "read" && (typeof input.token !== "string" || !TOKEN.test(input.token))) return json({ error: "Report unavailable or link expired." }, 404);
    if (action === "revoke" && (typeof input.id !== "string" || !UUID.test(input.id))) return json({ error: "Invalid share ID." }, 400);
    const login = action === "create" ? parseTwitchChannel(input.username) : null;
    if (action === "create" && !login) return json({ error: "Enter a Twitch channel." }, 400);

    const url = env("SUPABASE_URL");
    const anon = env("SUPABASE_ANON_KEY");
    const service = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anon || !service) return json({ error: "Report sharing is not configured on the server." }, 503);
    const serviceHeaders = { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" };
    try {
      if (action === "read") {
        const tokenHash = await hash(input.token as string);
        const res = await boundedFetch(`${url}/rest/v1/twitch_audit_shares?token_hash=eq.${tokenHash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=report,created_at,expires_at&limit=1`, { headers: serviceHeaders });
        if (!res.ok) return json({ error: "Report sharing is temporarily unavailable." }, 503);
        const rows = await res.json() as { report: ChannelAudit; created_at: string; expires_at: string }[];
        if (!Array.isArray(rows) || !rows[0]) return json({ error: "Report unavailable or link expired." }, 404);
        // Deliberately omit owner ID, row ID, and token hash from public responses.
        return json({ report: publicAuditSnapshot(rows[0].report), createdAt: rows[0].created_at, expiresAt: rows[0].expires_at });
      }

      const authorization = req.headers.get("Authorization") || "";
      if (!/^Bearer .+$/i.test(authorization)) return json({ error: "Sign in to manage share links." }, 401);
      const userHeaders = { apikey: anon, Authorization: authorization, "Content-Type": "application/json" };
      const auth = await boundedFetch(`${url}/auth/v1/user`, { headers: userHeaders });
      if (!auth.ok) return json({ error: "Sign in to manage share links." }, 401);
      const user = await auth.json() as { id?: unknown; is_anonymous?: unknown };
      if (typeof user.id !== "string" || !UUID.test(user.id) || user.is_anonymous === true) return json({ error: "Sign in to manage share links." }, 401);

      if (action === "list" || action === "revoke") {
        // The user's JWT, never the service role: database RLS enforces ownership.
        const path = action === "list"
          ? `?select=id,channel_login,created_at,expires_at&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&order=created_at.desc`
          : `?id=eq.${input.id}&select=id`;
        const res = await boundedFetch(`${url}/rest/v1/twitch_audit_shares${path}`, {
          method: action === "list" ? "GET" : "DELETE",
          headers: { ...userHeaders, Prefer: "return=representation" },
        });
        if (!res.ok) return json({ error: "Could not manage share links. Please try again." }, 503);
        const rows = await res.json();
        return action === "list" ? json({ shares: rows }) : json({ revoked: true });
      }

      // Never accept report JSON from the browser; re-fetch facts from Twitch.
      const auditResponse = await runAudit(new Request("https://internal.invalid/audit", { method: "POST", body: JSON.stringify({ username: login }) }));
      if (!auditResponse.ok) return json({ error: "Could not retrieve a fresh Twitch snapshot. Please retry the audit before sharing." }, 502);
      const report = publicAuditSnapshot(await auditResponse.json());
      const token = hex(cryptography.getRandomValues(new Uint8Array(32)));
      const tokenHash = await hash(token);
      const createdAt = new Date().toISOString();
      const expiresAt = new Date(Date.parse(createdAt) + 30 * 86400_000).toISOString();
      const saved = await boundedFetch(`${url}/rest/v1/twitch_audit_shares?select=id`, {
        method: "POST", headers: { ...serviceHeaders, Prefer: "return=representation" },
        body: JSON.stringify({ owner_id: user.id, channel_login: report.profile.login, token_hash: tokenHash, report, created_at: createdAt, expires_at: expiresAt }),
      });
      if (!saved.ok) return json({ error: "Could not save the report. Check that report sharing is set up, then retry." }, 503);
      const rows = await saved.json() as { id: string }[];
      if (!Array.isArray(rows) || !UUID.test(rows[0]?.id)) return json({ error: "Could not confirm that the report was saved." }, 503);
      return json({ id: rows[0].id, token, createdAt, expiresAt, report }, 201);
    } catch {
      // Do not reflect raw upstream bodies, auth data, tokens, or database errors.
      return json({ error: "Report sharing is temporarily unavailable. Please try again." }, 503);
    }
  };
}
