import { describe, expect, it } from "vitest";
import { auditFixture } from "./fixtures/channelAudit";
import { buildAuditRoadmap } from "@/lib/auditRoadmap";
import type { ChannelAudit } from "@/lib/channelAudit";

describe("streamer growth roadmap", () => {
  it("has ten complete steps in order", () => {
    const roadmap = buildAuditRoadmap(auditFixture);
    expect(roadmap.steps).toHaveLength(10);
    expect(roadmap.steps.map((step) => step.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const step of roadmap.steps) {
      expect([step.hook, step.needsDoing, step.whatWeDo, step.whyItMatters, step.outcome, step.channelNote].every(Boolean)).toBe(true);
    }
  });
  it("starts with foundation when a public bio is empty", () => {
    const report: ChannelAudit = { ...auditFixture, profile: { ...auditFixture.profile, description: "" } };
    const roadmap = buildAuditRoadmap(report);
    expect(roadmap.recommendedStart).toBe(1);
    expect(roadmap.steps[0].channelNote).toContain("no public bio");
  });
  it("starts with measurement for low replay counts when setup is clear", () => {
    const report: ChannelAudit = {
      ...auditFixture,
      channel: { status: "available", data: { title: "Exploring Fortnite ranked matches tonight", category: "Fortnite", language: "en" }, reason: null },
      videos: { status: "available", data: [3, 8, 11].map((views, index) => ({
        id: String(index + 1), title: "Fortnite ranked match highlights",
        createdAt: "2026-09-20T12:00:00Z", duration: "1h", views,
      })), reason: null },
    };
    const roadmap = buildAuditRoadmap(report);
    expect(roadmap.recommendedStart).toBe(10);
    expect(roadmap.steps[9].channelNote).toContain("3 of 3 sampled VODs");
    expect(roadmap.steps[7].channelNote).toContain("not provided");
  });
});
