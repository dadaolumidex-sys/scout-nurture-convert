import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuditDiscordReply } from "@/components/analyzer/AuditDiscordReply";
import { ChannelAuditReport } from "@/components/analyzer/ChannelAuditReport";
import { KickAuditReport } from "@/components/analyzer/KickAuditReport";
import { buildAuditDiscordReply } from "@/lib/auditDiscordReply";
import { auditFixture } from "./fixtures/channelAudit";
import type { KickAudit } from "@/lib/kickAudit";

const kickAudit: KickAudit = {
  version: "kick-audit-v1", platform: "kick", source: "Kick Developer Public API", fetchedAt: "2026-09-28T12:00:00Z",
  profile: { id: "123", slug: "example", displayName: "Example", description: "", profileImageUrl: null },
  channel: { title: "Follow me now", category: "Gaming", bannerUrl: null },
  stream: { isLive: true, viewers: 2, startedAt: "2026-09-28T12:00:00Z" },
  ai: { status: "unavailable", reason: "No AI review.", findings: [] },
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("shared audit Discord next step", () => {
  it("uses the audited platform, channel and a real first finding without promising a result", () => {
    const twitch = buildAuditDiscordReply(auditFixture);
    const kick = buildAuditDiscordReply(kickAudit);
    expect(twitch).toContain("Twitch audit you sent for my channel @example");
    expect(kick).toContain("Kick audit you sent for my channel @example");
    expect(kick).toContain("lead with the stream, not a follow request");
    expect(kick).toContain("short Discord call");
    expect(kick).not.toMatch(/guarantee|hidden error|bot followers/i);
  });

  it("only appears on shared reports, near the summary and after the roadmap", () => {
    const { rerender } = render(<ChannelAuditReport audit={auditFixture} />);
    expect(screen.queryByText("Copy question for Discord")).not.toBeInTheDocument();
    rerender(<ChannelAuditReport audit={auditFixture} readOnly />);
    expect(screen.getAllByRole("button", { name: "Copy question for Discord" })).toHaveLength(2);
    rerender(<KickAuditReport audit={kickAudit} readOnly />);
    expect(screen.getAllByRole("button", { name: "Copy question for Discord" })).toHaveLength(2);
  });

  it("copies a suggested reply without claiming to send it", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<AuditDiscordReply audit={kickAudit} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy question for Discord" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(buildAuditDiscordReply(kickAudit)));
    expect(screen.getByRole("status")).toHaveTextContent("paste the message");
    expect(screen.getByText(/does not send anything/)).toBeInTheDocument();
  });

  it("shows the message for manual copying if the clipboard fails", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("blocked")) } });
    render(<AuditDiscordReply audit={kickAudit} compact />);
    fireEvent.click(screen.getByRole("button", { name: "Copy question for Discord" }));
    expect(await screen.findByLabelText("Suggested message to send")).toHaveValue(buildAuditDiscordReply(kickAudit));
    expect(screen.getByRole("status")).toHaveTextContent("Copy the suggested message below");
  });
});
