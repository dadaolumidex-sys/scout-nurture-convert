import type { KickAudit } from "./kickAudit";
import { copy } from "./auditRoadmap";

export function buildKickRoadmap(audit: KickAudit) {
  const name = audit.profile.displayName;
  const bio = audit.profile.description?.trim();
  const title = audit.channel.title?.trim();
  const category = audit.channel.category?.trim();
  const hasUnavailableFields = !bio || !title || !category;
  const recommendedStart = hasUnavailableFields ? 1 : 10;
  const recommendedReason = hasUnavailableFields
    ? "Verify fields Kick's API did not return against the channel page before recommending changes. Missing API data is not a channel problem."
    : "Kick returned the public presentation fields. Review audience analytics with the creator to decide what to test first.";
  const notes = [
    bio ? name + " has a public description. Review whether it explains the content and why to return." : "Kick's API did not return the About description. Check the channel page before suggesting a rewrite.",
    category ? "Kick returned " + category + " as the category. Check it matches the next broadcast." : "Kick's API did not return a category. Check the channel page before suggesting a change.",
    category ? "Position " + name + "'s " + category + " content for a specific audience." : "Define the target audience and content identity with the creator.",
    title ? "Current public title: " + title.slice(0, 120) + ". Test a clearer content-led alternative." : "Kick's API did not return a stream title. Check the channel page before suggesting a change.",
    "Kick's public channel endpoint does not provide follower totals. Check the current number on the channel page and confirm audience baselines with the creator.",
    "Do not buy traffic based on public profile details alone. Agree on targeting, budget, and success measures first.",
    "Public Kick data cannot show visitor-to-follower conversion. Ask the creator to compare follows after specific changes.",
    "Chat participation is not measured by this public audit. Review real chat activity with the creator.",
    "One public snapshot cannot establish " + name + "'s full schedule or returning-viewer rate.",
    audit.stream.isLive && audit.stream.viewers !== null
      ? "Kick showed " + audit.stream.viewers + " live viewers at retrieval. That is one moment, not an average or a diagnosis."
      : "Review private live-viewer, follow, chat, and retention trends with the creator.",
  ];
  return {
    recommendedStart, recommendedReason,
    stageMessage: "Kick channel: use public presentation facts to choose a first test, then use the creator's own analytics to measure whether it helps.",
    steps: copy.map(([stepTitle, hook, needsDoing, whatWeDo, whyItMatters, outcome], index) => ({
      number: index + 1, title: stepTitle, hook, needsDoing, whatWeDo, whyItMatters,
      outcome: index === 9 ? "A repeatable growth process informed by the creator's real audience data." : outcome,
      channelNote: notes[index],
    })),
  };
}
