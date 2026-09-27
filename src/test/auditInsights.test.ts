import { describe, expect, it } from "vitest";
import { buildAuditInsights, buildAuditInviteMessage } from "@/lib/auditInsights";
import type { ChannelAudit } from "@/lib/channelAudit";
import { auditFixture } from "./fixtures/channelAudit";

describe("evidence-based audit insights", () => {
  it("does not call zero followers or an offline channel a critical failure", () => {
    const { findings, checks } = buildAuditInsights(auditFixture);
    expect(findings.map((finding) => finding.id)).toEqual(["vod-visibility"]);
    expect(findings[0].priority).toBe("review");
    expect(checks).toEqual([
      { label: "Channel bio", complete: true },
      { label: "Channel title", complete: true },
    ]);
    expect(JSON.stringify(findings)).not.toMatch(/lost money|average viewers|follower count too low/i);
  });

  it("prioritizes only confirmed empty public fields", () => {
    const report: ChannelAudit = {
      ...auditFixture,
      profile: { ...auditFixture.profile, description: "" },
      channel: { status: "available", data: { title: "", category: "Art", language: "en" }, reason: null },
    };
    const { findings, checks } = buildAuditInsights(report);
    expect(findings.map((finding) => finding.id)).toEqual(["bio", "channel-title", "vod-visibility"]);
    expect(checks.every((check) => !check.complete)).toBe(true);
    const message = buildAuditInviteMessage(report, "https://app.test/audit-report#token");
    expect(message).toContain("tell visitors what your channel is about");
    expect(message).toContain("https://app.test/audit-report#token");
    expect(message).not.toMatch(/0%|losing money|guarantee/i);
  });

  it("does not treat unavailable Twitch data as missing setup or zero progress", () => {
    const report: ChannelAudit = {
      ...auditFixture,
      profile: { ...auditFixture.profile, description: null, broadcasterType: null },
      stream: { status: "unavailable", data: null, reason: "Twitch timed out." },
      channel: { status: "unavailable", data: null, reason: "Twitch timed out." },
      videos: { status: "unavailable", data: null, reason: "Twitch timed out." },
    };
    expect(buildAuditInsights(report)).toEqual({ findings: [], checks: [] });
    expect(buildAuditInviteMessage(report, "https://app.test/report")).toContain("Creator Dashboard");
  });

  it("flags empty live presentation and untitled returned VODs without inventing averages", () => {
    const report: ChannelAudit = {
      ...auditFixture,
      stream: { status: "available", data: { isLive: true, title: "", category: "", viewers: 12, startedAt: auditFixture.fetchedAt }, reason: null },
      videos: { status: "available", data: [{ id: "123", title: "", createdAt: auditFixture.fetchedAt, duration: "1h", views: 80 }], reason: null },
    };
    const { findings } = buildAuditInsights(report);
    expect(findings.map((finding) => finding.id)).toEqual(["live-title", "live-category", "vod-titles"]);
    expect(JSON.stringify(findings)).not.toMatch(/average live viewers|stream days|stream hours/i);
  });
});
