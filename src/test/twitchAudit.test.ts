// Synthetic Twitch responses are test fixtures only; the app has no demo fallback.
import { describe, expect, it, vi } from "vitest";
import { createTwitchAuditHandler } from "../../supabase/functions/_shared/twitchAudit";
import { parseTwitchChannel, readChannelAudit } from "@/lib/channelAudit";

const user = { id: "123", login: "example", display_name: "Example", description: "A test bio", broadcaster_type: "affiliate", profile_image_url: "https://static-cdn.jtvnw.net/example.png", created_at: "2020-01-01T00:00:00Z" };
const video = { id: "456", user_id: "123", type: "archive", title: "Test broadcast", created_at: "2026-09-01T10:00:00Z", duration: "2h3m", view_count: 12500 };
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const request = (username: unknown = "example") => new Request("https://local.test/audit", { method: "POST", body: JSON.stringify({ username }) });

function setup(overrides: Record<string, unknown | Response | Error> = {}, direct = false) {
  const replies: Record<string, unknown> = {
    users: { data: [user] },
    "channels/followers": { total: 0, data: [] },
    streams: { data: [] },
    channels: { data: [{ broadcaster_id: "123", title: "Channel title", game_name: "Art", broadcaster_language: "en" }] },
    videos: { data: [video] },
    ...overrides,
  };
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    if (url.hostname === "id.twitch.tv") return response({ access_token: "test-token", expires_in: 3600 });
    const key = url.pathname.replace(/^\/(twitch|helix)\//, "");
    const data = replies[key];
    if (data instanceof Error) throw data;
    return data instanceof Response ? data.clone() : response(data);
  });
  const secrets: Record<string, string> = direct
    ? { TWITCH_CLIENT_ID: "test-client", TWITCH_CLIENT_SECRET: "test-secret" }
    : { LOVABLE_API_KEY: "test-gateway", TWITCH_API_KEY: "test-connection" };
  return { handler: createTwitchAuditHandler((name) => secrets[name], fetcher), fetcher };
}

describe("Twitch channel input", () => {
  it.each(["example", " EXAMPLE ", "https://www.twitch.tv/example", "twitch.tv/example/", "https://m.twitch.tv/example?ref=home#about"])("accepts channel %s", (input) => {
    expect(parseTwitchChannel(input)).toBe("example");
  });
  it.each(["", null, 42, {}, "https://kick.com/example", "https://twitch.tv.evil.test/example", "https://evil.test/twitch.tv/example", "https://twitch.tv@evil.test/example", "https://evil.test@twitch.tv/example", "https://twitch.tv/videos/123", "https://clips.twitch.tv/example", "https://twitch.tv/directory", "https://twitch.tv/example/videos", "https://twitch.tv/example/../someone", "https://twitch.tv", "ftp://twitch.tv/example", "https://twitch.tv:8080/example", "bad name", "a".repeat(26)])("rejects non-channel input %s", (input) => {
    expect(parseTwitchChannel(input)).toBeNull();
  });
});

describe("Twitch audit service", () => {
  it("preserves zero followers, offline state, and exact VOD views without inferred metrics", async () => {
    const { handler, fetcher } = setup();
    const res = await handler(request());
    const audit = readChannelAudit(await res.json(), "example");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(audit.followers.data).toBe(0);
    expect(audit.stream.data).toMatchObject({ isLive: false, viewers: null });
    expect(audit.videos.data?.[0].views).toBe(12500);
    expect(audit).not.toHaveProperty("avgViewers");
    expect(audit).not.toHaveProperty("followersEstimate");
    expect(audit).not.toHaveProperty("streamingFrequency");
    expect(audit).not.toHaveProperty("growthStage");
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("first=10&type=archive&sort=time"))).toBe(true);
  });

  it("uses stream existence for live status even at zero viewers", async () => {
    const { handler } = setup({ streams: { data: [{ user_id: "123", type: "live", title: "Live now", viewer_count: 0, game_name: "Art", started_at: "2026-09-25T10:00:00Z" }] } });
    const audit = await (await handler(request())).json();
    expect(audit.stream.data).toMatchObject({ isLive: true, viewers: 0, title: "Live now" });
  });

  it("does not turn denied followers, stream failures, or invalid videos into zero or offline", async () => {
    const { handler } = setup({ "channels/followers": response({}, 403), streams: new Error("Network failed"), videos: { error: "invalid" } });
    const res = await handler(request());
    const audit = readChannelAudit(await res.json(), "example");
    expect(res.status).toBe(200);
    for (const part of [audit.followers, audit.stream, audit.videos]) {
      expect(part.status).toBe("unavailable");
      expect(part.data).toBeNull();
      expect(part.reason).toBeTruthy();
    }
    expect(audit.channel.status).toBe("available");
  });

  it.each([undefined, null, -1, "123", 1.5])("does not invent missing/invalid counts (%s)", async (total) => {
    const { handler } = setup({ "channels/followers": { total }, videos: { data: [{ ...video, view_count: total }] } });
    const audit = await (await handler(request())).json();
    expect(audit.followers.status).toBe("unavailable");
    expect(audit.videos.data[0].views).toBeNull();
  });

  it("keeps an empty archive result distinct from an unavailable result", async () => {
    const { handler } = setup({ videos: { data: [] } });
    const audit = await (await handler(request())).json();
    expect(audit.videos).toEqual({ status: "available", data: [], reason: null });
  });

  it("does not call an empty or malformed streams payload offline", async () => {
    const { handler } = setup({ streams: {} });
    const audit = await (await handler(request())).json();
    expect(audit.stream.status).toBe("unavailable");
  });

  it.each([401, 429, 500])("reports profile HTTP %s without generating fallback data", async (status) => {
    const { handler, fetcher } = setup({ users: response({}, status) });
    const res = await handler(request());
    expect(res.status).toBe(status === 401 ? 503 : status === 429 ? 429 : 502);
    expect(await res.json()).toHaveProperty("error");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("reports missing channels as 404", async () => {
    const { handler } = setup({ users: { data: [] } });
    expect((await handler(request())).status).toBe(404);
  });

  it("never accepts broadcasts belonging to a different channel", async () => {
    const { handler } = setup({ videos: { data: [{ ...video, user_id: "999" }] } });
    const audit = await (await handler(request())).json();
    expect(audit.videos.status).toBe("unavailable");
    expect(audit.videos.data).toBeNull();
  });

  it("bounds slow Twitch calls and returns a retryable error", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
      }));
      const handler = createTwitchAuditHandler((name) => name === "LOVABLE_API_KEY" || name === "TWITCH_API_KEY" ? "test" : undefined, fetcher);
      const pending = handler(request());
      await vi.advanceTimersByTimeAsync(10_001);
      const res = await pending;
      expect(res.status).toBe(502);
      expect((await res.json()).error).toContain("too long");
    } finally { vi.useRealTimers(); }
  });

  it("validates requests before making any Twitch call", async () => {
    const { handler, fetcher } = setup();
    expect((await handler(request("https://kick.com/example"))).status).toBe(400);
    expect((await handler(request({ login: "example" }))).status).toBe(400);
    expect((await handler(new Request("https://local.test/audit", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await handler(new Request("https://local.test/audit"))).status).toBe(405);
    expect((await handler(new Request("https://local.test/audit", { method: "OPTIONS" }))).status).toBe(200);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports missing server configuration without fetching", async () => {
    const fetcher = vi.fn();
    const handler = createTwitchAuditHandler(() => undefined, fetcher);
    expect((await handler(request())).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("supports server-side app credentials and reuses a valid token", async () => {
    const { handler, fetcher } = setup({}, true);
    await handler(request());
    const payload = await (await handler(request())).json();
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("oauth2/token"))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("api.twitch.tv/helix"))).toHaveLength(10);
    expect(JSON.stringify(payload)).not.toContain("test-secret");
    expect(JSON.stringify(payload)).not.toContain("test-token");
  });
});

describe("audit response validation", () => {
  it("rejects legacy AI analysis and responses for a different channel", async () => {
    expect(() => readChannelAudit({ username: "example", avgViewers: "~100", followersEstimate: "5,000" }, "example")).toThrow("backend update");
    const { handler } = setup();
    const data = await (await handler(request())).json();
    expect(() => readChannelAudit(data, "different")).toThrow("different channel");
    data.followers.data = "~50";
    expect(() => readChannelAudit(data, "example")).toThrow("verified Twitch report");
  });
});
