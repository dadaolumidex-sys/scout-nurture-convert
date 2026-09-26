import { describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { createAuditShareHandler, publicAuditSnapshot } from "../../supabase/functions/_shared/auditShare";
import { auditFixture } from "./fixtures/channelAudit";

const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const token = "a".repeat(64);
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const request = (body: unknown, auth = true) => new Request("https://local.test/share", { method: "POST", headers: auth ? { Authorization: "Bearer user-token" } : {}, body: JSON.stringify(body) });

function setup(options: { authStatus?: number; readMissing?: boolean; saveStatus?: number; anonymous?: boolean } = {}) {
  const secrets: Record<string, string> = { SUPABASE_URL: "https://database.test", SUPABASE_ANON_KEY: "public-key", SUPABASE_SERVICE_ROLE_KEY: "service-secret", LOVABLE_API_KEY: "gateway-secret", TWITCH_API_KEY: "connection-secret" };
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname === "/auth/v1/user") return json({ id: owner, email: "private@example.test", is_anonymous: options.anonymous }, options.authStatus ?? 200);
    if (url.pathname === "/rest/v1/twitch_audit_shares") {
      if (init?.method === "POST") return json([{ id }], options.saveStatus ?? 201);
      if (init?.method === "DELETE") return json([{ id }]);
      if (url.searchParams.has("token_hash")) return json(options.readMissing ? [] : [{ report: auditFixture, owner_id: owner, token_hash: "private-hash", created_at: "2026-09-25T12:00:00Z", expires_at: "2026-10-25T12:00:00Z" }]);
      return json([{ id, channel_login: "example", created_at: "2026-09-25T12:00:00Z", expires_at: "2026-10-25T12:00:00Z" }]);
    }
    if (url.pathname === "/twitch/users") return json({ data: [{ id: "123", login: "example", display_name: "Example", description: "Public test bio", broadcaster_type: "affiliate", created_at: "2020-01-01T00:00:00Z", email: "upstream-private" }] });
    if (url.pathname === "/twitch/channels/followers") return json({ total: 0, data: [{ user_login: "private-follower-identity" }] });
    if (url.pathname === "/twitch/channels") return json({ data: [{ broadcaster_id: "123", title: "Public title", game_name: "Art", broadcaster_language: "en" }] });
    return json({ data: [] });
  });
  return { handler: createAuditShareHandler((key) => secrets[key], fetcher, webcrypto as unknown as Crypto), fetcher };
}

describe("public Twitch share service", () => {
  it("requires a verified user before fetching or persisting an audit", async () => {
    const { handler, fetcher } = setup({ authStatus: 401 });
    expect((await handler(request({ action: "create", username: "example" }, false))).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await handler(request({ action: "create", username: "example" }))).status).toBe(401);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("denies anonymous auth users and forged browser report fields", async () => {
    const { handler, fetcher } = setup({ anonymous: true });
    expect((await handler(request({ action: "create", username: "example", report: { inbox: "secret" } }))).status).toBe(400);
    expect(fetcher).not.toHaveBeenCalled();
    expect((await handler(request({ action: "create", username: "example" }))).status).toBe(401);
  });

  it("saves fresh public facts, only a token hash, and a 30-day expiry", async () => {
    const { handler, fetcher } = setup();
    const res = await handler(request({ action: "create", username: "example" }));
    expect(res.status).toBe(201);
    const result = await res.json();
    expect(result.token).toMatch(/^[a-f0-9]{64}$/);
    const insert = fetcher.mock.calls.find(([, init]) => init?.method === "POST" && String(init.body).includes("token_hash"))!;
    const saved = JSON.parse(String(insert[1]?.body));
    expect(saved.owner_id).toBe(owner);
    expect(saved.token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(saved.token_hash).not.toBe(result.token);
    expect(JSON.stringify(saved)).not.toContain(result.token);
    expect(saved.report.followers.data).toBe(0);
    expect(Date.parse(saved.expires_at) - Date.parse(saved.created_at)).toBe(30 * 86400_000);
    for (const privateValue of ["private@example", "upstream-private", "private-follower-identity", "service-secret", "gateway-secret", "connection-secret"]) {
      expect(JSON.stringify(saved)).not.toContain(privateValue);
      expect(JSON.stringify(result)).not.toContain(privateValue);
    }
    expect(result).not.toHaveProperty("owner_id");
    expect(result).not.toHaveProperty("token_hash");
  });

  it("returns no link if persistence fails", async () => {
    const { handler } = setup({ saveStatus: 500 });
    const res = await handler(request({ action: "create", username: "example" }));
    expect(res.status).toBe(503);
    expect(await res.json()).not.toHaveProperty("token");
  });

  it("allows a public exact-token read without authentication or owner metadata", async () => {
    const { handler, fetcher } = setup();
    const res = await handler(request({ action: "read", token }, false));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(Object.keys(body).sort()).toEqual(["createdAt", "expiresAt", "report"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const query = new URL(String(fetcher.mock.calls[0][0]));
    expect(query.searchParams.get("token_hash")).toMatch(/^eq\.[a-f0-9]{64}$/);
    expect(query.href).not.toContain(token);
    expect(query.searchParams.get("expires_at")).toMatch(/^gt\./);
    expect(query.searchParams.get("limit")).toBe("1");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(JSON.stringify(body)).not.toContain(owner);
    expect(JSON.stringify(body)).not.toContain("private-hash");
  });

  it("makes invalid, unknown, revoked, and expired tokens indistinguishable", async () => {
    const { handler, fetcher } = setup({ readMissing: true });
    const invalid = await handler(request({ action: "read", token: "short" }, false));
    expect(fetcher).not.toHaveBeenCalled();
    const missing = await handler(request({ action: "read", token }, false));
    expect(invalid.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(await invalid.json()).toEqual(await missing.json());
  });

  it.each(["list", "revoke"])("uses the caller JWT for %s so database RLS is enforced", async (action) => {
    const { handler, fetcher } = setup();
    const res = await handler(request(action === "revoke" ? { action, id } : { action }));
    expect(res.status).toBe(200);
    const rest = fetcher.mock.calls.find(([url]) => String(url).includes("/rest/v1/"))!;
    expect(new Headers(rest[1]?.headers).get("Authorization")).toBe("Bearer user-token");
    expect(new Headers(rest[1]?.headers).get("apikey")).toBe("public-key");
    expect(String(rest[0])).not.toContain("report,");
  });

  it("projects out unknown nested keys and replaces potentially sensitive failure reasons", () => {
    const contaminated = { ...auditFixture, privateChat: "PRIVATE", profile: { ...auditFixture.profile, email: "PRIVATE" }, followers: { status: "unavailable" as const, data: null, reason: "PRIVATE" }, channel: { ...auditFixture.channel, data: { ...auditFixture.channel.data!, internalKey: "PRIVATE" } } };
    expect(JSON.stringify(publicAuditSnapshot(contaminated))).not.toContain("PRIVATE");
  });
});
