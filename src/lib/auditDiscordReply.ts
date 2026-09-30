import type { ChannelAudit } from "@/lib/channelAudit";
import type { KickAudit } from "@/lib/kickAudit";
import { buildAuditInsights, buildReplayReview } from "@/lib/auditInsights";
import { buildKickInsights } from "@/lib/kickInsights";

/** Suggested text only. The visitor chooses whether to send it in their existing Discord chat. */
export function buildAuditDiscordReply(audit: ChannelAudit | KickAudit): string {
  const platform = audit.platform === "kick" ? "Kick" : "Twitch";
  const channel = audit.platform === "kick" ? audit.profile.slug : audit.profile.login;
  let priority = "I'd like to understand the first improvement in the report.";

  if (audit.platform === "kick") {
    const first = buildKickInsights(audit).findings[0];
    if (first) priority = "I noticed the report's first recommendation: " + first.title + ".";
  } else {
    const replay = buildReplayReview(audit);
    const first = buildAuditInsights(audit).findings[0];
    if (replay.status === "attention") priority = "I noticed the public replay-view signal in the report.";
    else if (first) priority = "I noticed the report's first recommendation: " + first.title + ".";
  }

  return "Hi, I read the " + platform + " audit you sent for my channel @" + channel + ". " + priority
    + " Can you show me what to fix first and how you would help me set it up?"
    + " If it is easier, could we arrange a short Discord call to walk through the plan?";
}
