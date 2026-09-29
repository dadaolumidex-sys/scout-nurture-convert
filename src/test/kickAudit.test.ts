import { describe, expect, it, vi } from "vitest";
import { createKickAuditHandler } from "../../supabase/functions/_shared/kickAudit";
import { parseKickChannel } from "@/lib/kickAudit";
import { readKickAudit } from "@/lib/kickAudit";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const request = (username: string) => new Request("https://local.test/audit", {
  method: "POST", body: JSON.stringify({ username, includeAi: false }),
});

describe("verified Kick audits", () => {
  it("accepts only an exact Kick channel link or safe slug", () => {
    expect(parseKickChannel("https://kick.com/Example-Streamer")).toBe("example-streamer");
    expect(parseKickChannel("example_streamer")).toBe("example_streamer");
    expect(parseKickChannel("https://kick.com.evil.test/example")).toBeNull();
    expect(parseKickChannel("https://kick.com/example/videos")).toBeNull();
    expect(parseKickChannel("https://twitch.tv/example")).toBeNull();
  });

  it("requires server-side developer credentials before contacting Kick", async () => {
    const fetcher = vi.fn();
    const response = await createKickAuditHandler(() => undefined, fetcher)(request("example"));
    expect(response.status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("projects only real public fields and never invents missing metrics", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("id.kick.com")) return json({ access_token: "private-token" });
      if (url.includes("/channels?")) return json({ data: [{
        broadcaster_user_id: 123, slug: "example", channel_description: "I play games",
        stream_title: "Ranked night", category: { name: "Games" }, banner_picture: "https://cdn.kick.com/banner.jpg",
        stream: { key: "PRIVATE-STREAM-KEY" }, active_subscribers_count: 42,
      }] });
      if (url.includes("/users/livestreams?")) return json({ data: [{ broadcaster_user: { id: 123 }, viewer_count: 7, started_at: "2026-09-28T12:00:00Z" }] });
      if (url.includes("/users?")) return json({ data: [{ user_id: 123, name: "Example", profile_picture: "https://cdn.kick.com/avatar.jpg", email: "PRIVATE-EMAIL" }] });
      return json({}, 404);
    });
    const response = await createKickAuditHandler((name) => ({ KICK_CLIENT_ID: "client", KICK_CLIENT_SECRET: "secret" })[name], fetcher)(request("https://kick.com/example"));
    expect(response.status).toBe(200);
    const raw = await response.json();
    const audit = readKickAudit(raw, "example");
    expect(audit.profile.displayName).toBe("Example");
    expect(audit.stream.viewers).toBe(7);
    expect(audit).not.toHaveProperty("followers");
    expect(audit).not.toHaveProperty("avgViewers");
    expect(JSON.stringify(raw)).not.toMatch(/PRIVATE|private-token|active_subscribers_count/);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("rejects a response for another channel", () => {
    expect(() => readKickAudit({ version: "kick-audit-v1", platform: "kick", profile: { slug: "other" } }, "example")).toThrow();
  });
});
