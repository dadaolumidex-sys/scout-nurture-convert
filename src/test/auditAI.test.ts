import { describe, expect, it, vi } from "vitest";
import { generateAiAudit, publicAuditEvidence } from "../../supabase/functions/_shared/auditAI";
import { auditFixture } from "./fixtures/channelAudit";
import { publicAuditSnapshot } from "../../supabase/functions/_shared/auditShare";
import { buildAuditInviteMessage } from "@/lib/auditInsights";

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const env = (name: string) => ({ SUPABASE_URL: "https://database.test", SUPABASE_ANON_KEY: "public" } as Record<string, string>)[name];
const request = new Request("https://local.test/audit", { method: "POST", headers: { Authorization: "Bearer user-jwt" } });

describe("AI-assisted audit", () => {
  it("uses saved user AI keys and only server-verified evidence in findings", async () => {
    expect(request.headers.get("Authorization")).toBe("Bearer user-jwt");
    expect(env("SUPABASE_URL")).toBe("https://database.test");
    expect(env("SUPABASE_ANON_KEY")).toBe("public");
    const fetcher = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === "/auth/v1/user") return json({ id: "owner", is_anonymous: false });
      if (path === "/rest/v1/api_keys") return json([{ provider: "gemini", api_key: "private-key" }]);
      if (path === "/v1beta/openai/chat/completions") {
        expect(init?.headers).toMatchObject({ Authorization: "Bearer private-key" });
        return json({ choices: [{ message: { content: JSON.stringify({ findings: [
          { evidenceId: "bio", title: "Clarify your channel promise", possibleImpact: "A visitor may not know why to follow.", fix: "Say what you stream and for whom.", test: "Compare follows in your Creator Dashboard." },
          { evidenceId: "fake-metric", title: "Invented", possibleImpact: "Bad", fix: "Bad", test: "Bad" },
        ] }) } }] });
      }
      throw new Error("Unexpected request");
    });
    const report = await generateAiAudit(auditFixture, request, env, fetcher);
    expect(report.status, JSON.stringify({ report, calls: fetcher.mock.calls.map(([url]) => String(url)) })).toBe("available");
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].evidence).toBe(publicAuditEvidence(auditFixture).find((item) => item.id === "bio")?.fact);
    expect(JSON.stringify(report)).not.toContain("private-key");
    expect(JSON.stringify(publicAuditSnapshot({ ...auditFixture, ai: report }))).not.toContain("private-key");
    expect(buildAuditInviteMessage({ ...auditFixture, ai: report }, "https://app.test/report")).toContain("Say what you stream and for whom.");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not spend AI credits for an unauthenticated visitor", async () => {
    const fetcher = vi.fn();
    const result = await generateAiAudit(auditFixture, new Request("https://local.test/audit"), env, fetcher);
    expect(result.status).toBe("unavailable");
    expect(result.reason).toContain("Sign in");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses an older Settings key when the newer key list is empty", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const path = new URL(String(url)).pathname;
      if (path === "/auth/v1/user") return json({ id: "owner" });
      if (path === "/rest/v1/api_keys") return json([]);
      if (path === "/rest/v1/user_settings") return json([{ gemini_api_key: "legacy-private-key" }]);
      if (path === "/v1beta/openai/chat/completions") return json({ choices: [{ message: { content: JSON.stringify({ findings: [{
        evidenceId: "title", title: "Clarify the title", possibleImpact: "A visitor may not know what is planned.",
        fix: "Describe the broadcast goal.", test: "Review audience response in Creator Dashboard.",
      }] }) } }] });
      throw new Error("Unexpected request");
    });
    const report = await generateAiAudit(auditFixture, request, env, fetcher);
    expect(report.status).toBe("available");
    expect(JSON.stringify(report)).not.toContain("legacy-private-key");
    expect(fetcher.mock.calls).toHaveLength(5);
  });

  it("does not revive a disabled key from its Settings copy", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/auth/v1/user") return json({ id: "owner" });
      if (parsed.pathname === "/rest/v1/api_keys" && parsed.searchParams.get("select") === "id") return json([{ id: "disabled" }]);
      if (parsed.pathname === "/rest/v1/api_keys") return json([]);
      throw new Error("No Settings or AI call should be made");
    });
    const result = await generateAiAudit(auditFixture, request, env, fetcher);
    expect(result.status).toBe("unavailable");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
