import { describe, expect, it } from "vitest";
import { auditShareUrl } from "@/lib/auditShare";
import { compactAuditToken, expandAuditToken } from "@/lib/auditShareToken";

describe("compact audit share links", () => {
  const raw = "0123456789abcdef".repeat(4);

  it("keeps every bit of the existing secret in a shorter URL-safe form", () => {
    const code = compactAuditToken(raw);
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expandAuditToken(code)).toBe(raw);
    expect(expandAuditToken(raw)).toBe(raw);
  });

  it("makes a short, branded route without exposing the raw token", () => {
    const url = auditShareUrl(raw, "https://scout-nurture-convert.vercel.app");
    expect(url).toMatch(/^https:\/\/scout-nurture-convert\.vercel\.app\/r#[A-Za-z0-9_-]{43}$/);
    expect(url).not.toContain(raw);
    expect(url.length).toBeLessThan("https://scout-nurture-convert.vercel.app/audit-report#".length + raw.length);
  });

  it("rejects malformed or noncanonical codes", () => {
    expect(() => expandAuditToken("short")).toThrow("unavailable");
    expect(() => expandAuditToken(compactAuditToken(raw).slice(0, -1) + "!")).toThrow("unavailable");
    expect(() => compactAuditToken("a".repeat(32))).toThrow("unavailable");
  });
});
