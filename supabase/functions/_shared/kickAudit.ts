import { KICK_AUDIT_VERSION, parseKickChannel, type KickAudit } from "./kickAuditContract.ts";
import { generateKickAiAudit } from "./kickAuditAI.ts";

type Env = (name: string) => string | undefined;
const object = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, max = 300): string | null =>
  typeof value === "string" ? value.trim().slice(0, max) : null;
// Kick can return blank presentation fields even when its channel page shows them.
// A blank API value is unavailable evidence, not a confirmed channel gap.
const presentedText = (value: unknown, max: number): string | null => text(value, max) || null;
const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const date = (value: unknown): string | null =>
  typeof value === "string" && Number.isFinite(Date.parse(value)) && !value.startsWith("0001-") ? new Date(value).toISOString() : null;
const safeUrl = (value: unknown): string | null => {
  const raw = text(value, 2048);
  if (!raw) return null;
  try { return new URL(raw).protocol === "https:" ? raw : null; } catch { return null; }
};
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export function createKickAuditHandler(env: Env, fetcher: typeof fetch = fetch) {
  const getJson = async (url: string, init: RequestInit) => {
    const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw new Error(String(response.status));
    }
    return object(await response.json());
  };
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST") return json({ error: "Use POST." }, 405);
    let input: Record<string, unknown>;
    try {
      const raw = await req.text();
      if (raw.length > 512) return json({ error: "Request too large." }, 413);
      input = object(JSON.parse(raw));
    } catch { return json({ error: "Invalid request." }, 400); }
    if (Object.keys(input).some((key) => !["username", "includeAi"].includes(key))) return json({ error: "Invalid request." }, 400);
    const slug = parseKickChannel(input.username);
    if (!slug) return json({ error: "Enter a valid Kick channel name or kick.com link." }, 400);
    const clientId = env("KICK_CLIENT_ID");
    const clientSecret = env("KICK_CLIENT_SECRET");
    if (!clientId || !clientSecret) return json({ error: "Kick audits need a Kick Developer app. Add KICK_CLIENT_ID and KICK_CLIENT_SECRET to Supabase Edge Function Secrets first." }, 503);
    try {
      const token = await getJson("https://id.kick.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret }),
      });
      const accessToken = text(token.access_token, 4096);
      if (!accessToken) return json({ error: "Kick could not authorize this app. Check its developer credentials." }, 503);
      const headers = { Authorization: "Bearer " + accessToken, Accept: "application/json" };
      const response = await getJson("https://api.kick.com/public/v1/channels?slug=" + encodeURIComponent(slug), { headers });
      const rows = Array.isArray(response.data) ? response.data : [];
      const channel = rows.map(object).find((item) => text(item.slug, 25)?.toLowerCase() === slug);
      if (!channel) return json({ error: "Kick channel not found. Check its link and try again." }, 404);
      const id = count(channel.broadcaster_user_id);
      if (id === null) return json({ error: "Kick returned an incomplete channel profile. Please retry." }, 502);
      const [userResponse, liveResponse] = await Promise.allSettled([
        getJson("https://api.kick.com/public/v1/users?id=" + id, { headers }),
        getJson("https://api.kick.com/public/v1/users/livestreams?user_id=" + id, { headers }),
      ]);
      const users = userResponse.status === "fulfilled" && Array.isArray(userResponse.value.data) ? userResponse.value.data : [];
      const user = object(users.map(object).find((item) => count(item.user_id) === id));
      const broadcasts = liveResponse.status === "fulfilled" && Array.isArray(liveResponse.value.data) ? liveResponse.value.data : [];
      const live = object(broadcasts.map(object).find((item) => count(object(item.broadcaster_user).id) === id));
      const isLive = liveResponse.status === "fulfilled" ? Object.keys(live).length > 0 : null;
      const audit: KickAudit = {
        version: KICK_AUDIT_VERSION, platform: "kick", source: "Kick Developer Public API", fetchedAt: new Date().toISOString(),
        profile: {
          id: String(id), slug, displayName: text(user.name, 80) || slug,
          description: presentedText(channel.channel_description, 1000),
          profileImageUrl: safeUrl(user.profile_picture),
        },
        channel: {
          title: presentedText(channel.stream_title, 200),
          category: presentedText(object(channel.category).name, 100),
          bannerUrl: safeUrl(channel.banner_picture),
        },
        stream: {
          isLive,
          viewers: isLive ? count(live.viewer_count) : null,
          startedAt: isLive ? date(live.started_at) : null,
        },
        ai: { status: "unavailable", reason: "AI review was not requested.", findings: [] },
      };
      if (input.includeAi === true) audit.ai = await generateKickAiAudit(audit, req, env, fetcher);
      return json(audit);
    } catch {
      return json({ error: "Kick could not return this channel right now. Please try again shortly." }, 502);
    }
  };
}
