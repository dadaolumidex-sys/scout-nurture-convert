import { describe, expect, it } from "vitest";
import type { KickAudit } from "@/lib/kickAudit";
import { buildKickInsights } from "@/lib/kickInsights";
import { buildKickRoadmap } from "@/lib/kickRoadmap";

const base: KickAudit = {
  version: "kick-audit-v1", platform: "kick", source: "Kick Developer Public API",
  fetchedAt: "2026-09-28T12:00:00Z",
  profile: { id: "123", slug: "example", displayName: "Example", description: null, profileImageUrl: null },
  channel: { title: "Playing ranked games with friends", category: "Gaming", bannerUrl: null },
  stream: { isLive: true, viewers: 1, startedAt: "2026-09-28T12:00:00Z" },
  ai: { status: "unavailable", reason: null, findings: [] },
};

describe("Kick public opportunity score", () => {
  it("shows a red score for a small live-viewer snapshot without claiming a hidden error", () => {
    const insights = buildKickInsights(base);
    expect(insights.value).toBe(40);
    expect(insights.covered).toBe(100);
    expect(insights.findings.find((finding) => finding.id === "live-snapshot")?.whyItMatters)
      .toContain("one moment");
  });

  it("flags a returned follow-first title as a critical presentation issue", () => {
    const insights = buildKickInsights({
      ...base, channel: { ...base.channel, title: "Drop follow guyz - PUBG Mobile" },
    });
    expect(insights.value).toBe(10);
    expect(insights.findings[0].severity).toBe("critical");
    expect(insights.findings[0].evidence).toContain("Drop follow guyz");
    expect(buildKickRoadmap({ ...base, channel: { ...base.channel, title: "Drop follow guyz - PUBG Mobile" } }).recommendedStart).toBe(4);
  });

  it("does not score offline time or missing Kick fields as zero", () => {
    const insights = buildKickInsights({
      ...base, channel: { ...base.channel, title: null, category: null },
      stream: { isLive: false, viewers: null, startedAt: null },
    });
    expect(insights.value).toBeNull();
    expect(insights.covered).toBe(0);
    expect(insights.criteria.every((criterion) => criterion.earned === null)).toBe(true);
    expect(insights.findings).toHaveLength(0);
  });
});
