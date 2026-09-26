import { AUDIT_VERSION, parseTwitchChannel } from "./twitchAuditContract.ts";
import type { AuditChannel, AuditProfile, AuditSection, AuditStream, AuditVideo, ChannelAudit } from "./twitchAuditContract.ts";

type Env = (name: string) => string | undefined;
type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject => value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
const text = (value: unknown): string | null => typeof value === "string" ? value : null;
const count = (value: unknown): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
const date = (value: unknown): string | null => typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
const available = <T>(data: T): AuditSection<T> => ({ status: "available", data, reason: null });
const unavailable = <T>(reason: string): AuditSection<T> => ({ status: "unavailable", data: null, reason });

class AuditError extends Error {
  constructor(message: string, readonly status = 502) { super(message); }
}

function rows(payload: unknown): JsonObject[] {
  const data = object(payload).data;
  if (!Array.isArray(data) || data.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    throw new AuditError("Twitch returned an incomplete response. Please try again.");
  }
  return data.map(object);
}

function upstreamError(status: number): AuditError {
  if (status === 429) return new AuditError("Twitch rate limit reached. Please wait and try again.", 429);
  if (status === 401 || status === 403) return new AuditError("Twitch did not authorize this data. The server's Twitch connection may need to be renewed.", 503);
  return new AuditError("Twitch data is temporarily unavailable. Please try again.");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Only documented Twitch endpoints are used. Keys remain on the server. */
export function createTwitchAuditHandler(env: Env, fetcher: typeof fetch = fetch) {
  let tokenCache: { token: string; expiresAt: number } | null = null;

  async function requestJson(url: string, init: RequestInit = {}): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetcher(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        // Log only the upstream host/path and status; never credentials, queries, or bodies.
        const endpoint = new URL(url);
        const diagnostic: Record<string, unknown> = { host: endpoint.host, path: endpoint.pathname, status: response.status };
        if (endpoint.host === "id.twitch.tv" && endpoint.pathname === "/oauth2/token") {
          try {
            const body = object(await response.clone().json());
            const safeError = typeof body.message === "string" ? body.message : typeof body.error === "string" ? body.error : "";
            diagnostic.oauthError = /client.?secret/i.test(safeError) ? "invalid_client_secret"
              : /client.?id/i.test(safeError) ? "invalid_client_id"
              : /invalid client/i.test(safeError) ? "invalid_client"
              : /unsupported grant/i.test(safeError) ? "unsupported_grant_type"
              : /invalid request/i.test(safeError) ? "invalid_request"
              : "unclassified";
          } catch { diagnostic.oauthError = "unclassified"; }
        }
        console.warn("Twitch audit upstream rejected request", diagnostic);
        // Stream cleanup must not delay the error (a teed body may never settle).
        void response.body?.cancel().catch(() => {});
        throw upstreamError(response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof AuditError) throw error;
      throw new AuditError(controller.signal.aborted
        ? "Twitch took too long to respond. Please try again."
        : "Could not read Twitch data. Please try again.");
    } finally { clearTimeout(timeout); }
  }

  async function connection(): Promise<{ base: string; headers: Record<string, string> }> {
    const clientId = env("TWITCH_CLIENT_ID")?.trim();
    const clientSecret = env("TWITCH_CLIENT_SECRET")?.trim();
    if (clientId && clientSecret) {
      if (!tokenCache || tokenCache.expiresAt <= Date.now()) {
        const token = object(await requestJson("https://id.twitch.tv/oauth2/token", {
          method: "POST",
          body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials" }),
        }));
        if (typeof token.access_token !== "string" || !token.access_token || !count(token.expires_in)) {
          throw new AuditError("The server's Twitch connection could not be authenticated.", 503);
        }
        tokenCache = { token: token.access_token, expiresAt: Date.now() + Math.max(0, Number(token.expires_in) - 60) * 1000 };
      }
      return { base: "https://api.twitch.tv/helix", headers: { "Client-Id": clientId, Authorization: `Bearer ${tokenCache.token}` } };
    }
    const gatewayKey = env("LOVABLE_API_KEY");
    const twitchKey = env("TWITCH_API_KEY");
    if (gatewayKey && twitchKey) {
      return { base: "https://connector-gateway.lovable.dev/twitch", headers: { Authorization: `Bearer ${gatewayKey}`, "X-Connection-Api-Key": twitchKey } };
    }
    throw new AuditError("Channel Audit needs a Twitch connection configured on the server.", 503);
  }

  async function audit(login: string): Promise<ChannelAudit> {
    const { base, headers } = await connection();
    const get = async (path: string) => {
      try { return await requestJson(`${base}/${path}`, { headers }); }
      catch (error) {
        // Refresh a revoked/expired app token on the next attempt.
        if (error instanceof AuditError && error.status === 503) tokenCache = null;
        throw error;
      }
    };
    const users = rows(await get(`users?login=${encodeURIComponent(login)}`));
    if (users.length === 0) throw new AuditError("Twitch channel not found. Check the username or channel link.", 404);
    const user = users[0];
    if (typeof user.id !== "string" || !/^\d+$/.test(user.id) || user.login !== login || typeof user.display_name !== "string") {
      throw new AuditError("Twitch returned an incomplete channel profile. Please try again.");
    }
    const profile: AuditProfile = {
      id: user.id, login, displayName: user.display_name,
      description: text(user.description),
      profileImageUrl: typeof user.profile_image_url === "string" && user.profile_image_url.startsWith("https://") ? user.profile_image_url : null,
      broadcasterType: ["", "affiliate", "partner"].includes(String(user.broadcaster_type)) ? user.broadcaster_type as AuditProfile["broadcasterType"] : null,
      createdAt: date(user.created_at),
    };
    async function section<T>(path: string, map: (data: unknown) => T): Promise<AuditSection<T>> {
      try { return available(map(await get(path))); }
      catch (error) { return unavailable(error instanceof AuditError ? error.message : "Twitch did not return this data."); }
    }
    const [followers, stream, channel, videos] = await Promise.all([
      section(`channels/followers?broadcaster_id=${user.id}&first=1`, (payload) => {
        const total = count(object(payload).total);
        if (total === null) throw new AuditError("Twitch did not return a follower total.");
        return total;
      }),
      section<AuditStream>(`streams?user_id=${user.id}`, (payload) => {
        const streams = rows(payload);
        if (!streams.length) return { isLive: false, title: null, category: null, viewers: null, startedAt: null };
        const live = streams[0];
        if (live.user_id !== user.id || live.type !== "live") throw new AuditError("Twitch did not confirm the channel's live status.");
        return { isLive: true, title: text(live.title), category: text(live.game_name), viewers: count(live.viewer_count), startedAt: date(live.started_at) };
      }),
      section<AuditChannel>(`channels?broadcaster_id=${user.id}`, (payload) => {
        const info = rows(payload)[0];
        if (!info || info.broadcaster_id !== user.id) throw new AuditError("Twitch did not return channel details.");
        return { title: text(info.title), category: text(info.game_name), language: text(info.broadcaster_language) };
      }),
      section<AuditVideo[]>(`videos?user_id=${user.id}&first=10&type=archive&sort=time`, (payload) => rows(payload).map((video) => {
        if (typeof video.id !== "string" || !/^\d+$/.test(video.id) || video.user_id !== user.id || video.type !== "archive") {
          throw new AuditError("Twitch returned incomplete broadcast data.");
        }
        return { id: video.id, title: text(video.title), createdAt: date(video.created_at), duration: text(video.duration), views: count(video.view_count) };
      })),
    ]);
    return { version: AUDIT_VERSION, platform: "twitch", source: "Twitch Helix API", fetchedAt: new Date().toISOString(), profile, followers, stream, channel, videos };
  }

  return async (req: Request): Promise<Response> => {
    const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Use POST to run a channel audit." }, 405);
    let body: unknown;
    try { body = await req.json(); }
    catch { return json({ error: "Send a valid JSON request." }, 400); }
    const login = parseTwitchChannel(object(body).username);
    if (!login) return json({ error: "Enter a Twitch username or channel URL, such as https://www.twitch.tv/twitchdev." }, 400);
    try { return json(await audit(login)); }
    catch (error) {
      return json({ error: error instanceof AuditError ? error.message : "Could not complete the Twitch audit. Please try again." }, error instanceof AuditError ? error.status : 500);
    }
  };
}
