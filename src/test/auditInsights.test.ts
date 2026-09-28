import { describe, expect, it } from "vitest";
import { buildAuditInsights, buildAuditInviteMessage, buildPresentationScore, presentationScoreBand } from "@/lib/auditInsights";
import type { ChannelAudit } from "@/lib/channelAudit";
import { auditFixture } from "./fixtures/channelAudit";

describe("evidence-based audit insights", () => {
  it("shows genuinely low scores, including 1, in the danger band without forcing other scores low", () => {
    expect(presentationScoreBand(1)).toBe("danger");
    expect(presentationScoreBand(49)).toBe("danger");
    expect(presentationScoreBand(50)).toBe("review");
    expect(presentationScoreBand(100)).toBe("strong");
    expect(presentationScoreBand(null)).toBe("unavailable");
  });
  it("does not call zero followers or an offline channel a critical failure", () => {
    const { findings, checks } = buildAuditInsights(auditFixture);
    expect(findings.map((finding) => finding.id)).toEqual(["bio-detail", "channel-title-clarity", "vod-visibility"]);
    expect(findings.every((finding) => finding.priority === "review")).toBe(true);
    expect(checks).toEqual([
      { label: "Channel bio", complete: true },
      { label: "Channel title", complete: true },
    ]);
    expect(JSON.stringify(findings)).not.toMatch(/lost money|average viewers|follower count too low/i);
    expect(buildPresentationScore(auditFixture).value).toBe(42);
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
    expect(message).toMatch(/tell visitors what your channel is about/i);
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
    expect(buildPresentationScore(report)).toEqual({ value: null, covered: 0, criteria: [] });
    expect(buildAuditInviteMessage(report, "https://app.test/report")).toContain("Creator Dashboard");
  });

  it("flags empty live presentation and untitled returned VODs without inventing averages", () => {
    const report: ChannelAudit = {
      ...auditFixture,
      stream: { status: "available", data: { isLive: true, title: "", category: "", viewers: 12, startedAt: auditFixture.fetchedAt }, reason: null },
      videos: { status: "available", data: [{ id: "123", title: "", createdAt: auditFixture.fetchedAt, duration: "1h", views: 80 }], reason: null },
    };
    const { findings } = buildAuditInsights(report);
    expect(findings.map((finding) => finding.id)).toEqual(["live-title", "live-category", "bio-detail", "vod-titles"]);
    expect(JSON.stringify(findings)).not.toMatch(/average live viewers|stream days|stream hours/i);
  });

  it("can award a full score when the disclosed presentation checklist is met", () => {
    const report: ChannelAudit = {
      ...auditFixture,
      profile: { ...auditFixture.profile, description: "I stream cooperative puzzle games with viewers every week. Join for beginner-friendly challenges and community play sessions. Say hello in chat!" },
      channel: { status: "available", data: { title: "Solving the hardest co-op puzzle with viewers tonight", category: "Games", language: "en" }, reason: null },
      videos: { status: "available", data: [{ id: "123", title: "Can viewers solve this puzzle before the timer ends?", createdAt: auditFixture.fetchedAt, duration: "2h", views: 80 }], reason: null },
    };
    expect(buildPresentationScore(report).value).toBe(100);
    expect(buildAuditInsights(report).findings).toEqual([]);
  });

  it("flags a vague live title as a test, without claiming a measured loss", () => {
    const report: ChannelAudit = {
      ...auditFixture,
      stream: { status: "available", data: { isLive: true, title: "Animo time!", category: "Animo", viewers: 1, startedAt: auditFixture.fetchedAt }, reason: null },
    };
    const finding = buildAuditInsights(report).findings.find((item) => item.id === "live-title-clarity");
    expect(finding?.priority).toBe("review");
    expect(finding?.observation).toContain("Animo time!");
    expect(finding?.whyItMatters).toMatch(/needs testing/i);
    expect(buildPresentationScore(report).value).not.toBeNull();
  });
});
