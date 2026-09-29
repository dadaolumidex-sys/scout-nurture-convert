import type { KickAudit } from "./kickAudit";
import { copy } from "./auditRoadmap";

export function buildKickRoadmap(audit: KickAudit) {
  const name = audit.profile.displayName;
  const bio = audit.profile.description?.trim();
  const title = audit.channel.title?.trim();
  const category = audit.channel.category?.trim();
  const recommendedStart = !bio ? 1 : !title ? 4 : !category ? 2 : 10;
  const recommendedReason = !bio ? "The public description is empty or unavailable. Explain the content and reason to return before inviting new people."
    : !title ? "The current stream title is empty or unavailable. Test a content-led title before promotion."
    : !category ? "The category is empty or unavailable. Set an accurate category so visitors can understand the content."
    : "Public presentation fields are filled. Review private audience analytics with the creator to decide what to test first.";
  const notes = [
    bio ? name + " has a public description. Review whether it explains the content and why to return." : "Kick did not return a filled description. Confirm and improve it with the creator.",
    category ? "Kick returned " + category + " as the category. Check it matches the next broadcast." : "No category was returned. Confirm an accurate category before the next stream.",
    category ? "Position " + name + "'s " + category + " content for a specific audience." : "Define the target audience and content identity with the creator.",
    title ? "Current public title: " + title.slice(0, 120) + ". Test a clearer content-led alternative." : "Kick did not return a filled stream title. Write one for the next broadcast.",
    "Kick's public channel endpoint does not provide a verified follower total. Confirm audience baselines with the creator.",
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
