import type { ChannelAudit } from "@/lib/channelAudit";

// Synthetic data for tests only. Never used as a production fallback.
export const auditFixture: ChannelAudit = {
  version: "twitch-audit-v1", platform: "twitch", source: "Twitch Helix API", fetchedAt: "2026-09-25T12:00:00Z",
  profile: { id: "123", login: "example", displayName: "Example", description: "Public test bio", profileImageUrl: null, broadcasterType: "affiliate", createdAt: "2020-01-01T00:00:00Z" },
  followers: { status: "available", data: 0, reason: null },
  stream: { status: "available", data: { isLive: false, title: null, category: null, viewers: null, startedAt: null }, reason: null },
  channel: { status: "available", data: { title: "Public title", category: "Art", language: "en" }, reason: null },
  videos: { status: "available", data: [], reason: null },
};
