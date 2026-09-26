import { afterEach, describe, expect, it, vi } from "vitest";
import { readAuditShare } from "@/lib/readAuditShare";
import { auditFixture } from "./fixtures/channelAudit";

afterEach(() => vi.unstubAllGlobals());

describe("public report transport", () => {
  it("sends the bearer token in the request body, without the visitor's authorization or referrer", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: auditFixture, expiresAt: "2026-10-25T12:00:00Z" })));
    vi.stubGlobal("fetch", fetcher);
    const token = "a".repeat(64);
    const result = await readAuditShare(token, new AbortController().signal);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).not.toContain(token);
    expect(options.headers).not.toHaveProperty("Authorization");
    expect(options.referrerPolicy).toBe("no-referrer");
    expect(options.cache).toBe("no-store");
    expect(JSON.parse(options.body)).toEqual({ action: "read", token });
    expect(result.report.followers.data).toBe(0);
  });

  it("rejects malformed tokens before any request", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(readAuditShare("bad", new AbortController().signal)).rejects.toThrow("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects a malformed or legacy report response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ report: { username: "example", followersEstimate: "~50" }, expiresAt: "2026-10-25T12:00:00Z" }))));
    await expect(readAuditShare("a".repeat(64), new AbortController().signal)).rejects.toThrow("verified");
  });
});
