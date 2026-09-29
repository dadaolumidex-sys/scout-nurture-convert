import type { ChannelAudit } from "./channelAudit";
import { buildAuditInsights, buildReplayReview } from "./auditInsights";

type Copy = [string, string, string, string, string, string];
export type RoadmapStep = {
  number: number; title: string; hook: string; needsDoing: string;
  whatWeDo: string; whyItMatters: string; outcome: string; channelNote: string;
};
export const copy: Copy[] = [
  ["Channel foundation", "Before bringing more people to your channel, make sure your channel is ready to receive them.", "Review the profile, bio, panels, links, branding, channel information, and first-time visitor experience.", "We optimize the profile, bio, panels, links, branding, and overall presentation with you.", "Visitors need to understand the channel before deciding to return.", "A stronger first impression and a channel prepared to turn relevant visits into follows."],
  ["Discoverability & SEO", "If people can't discover you, they can't become your audience.", "Use accurate game or topic language in titles, descriptions, categories, and profile text.", "We review keywords, titles, descriptions, categories, and other discoverability opportunities.", "Clear labels help relevant people find content; they do not guarantee ranking.", "More opportunities for relevant viewers to discover your content."],
  ["Content positioning", "Give viewers a clear reason to choose your stream.", "Choose a recognizable content focus, target viewer, and promise for recurring streams.", "We analyze your niche and position content for its intended audience.", "A clear identity makes the channel easier to remember.", "Clearer content identity and stronger audience targeting."],
  ["Stream title & click optimization", "Your stream needs to earn the click before it can earn the viewer.", "Lead titles with the content, game, challenge, or viewer benefit; test formats.", "We improve titles, stream messaging, and presentation.", "A title is a viewer's first clue about what will happen; its effect needs testing.", "Better click potential and stronger viewer interest."],
  ["Audience targeting", "Don't just look for more viewers. Find the people most likely to care about your content.", "Describe your ideal viewer and choose relevant communities for respectful, permitted outreach.", "We identify your ideal audience and build a targeted discovery strategy.", "Relevant people are more likely to engage than untargeted traffic.", "More relevant exposure and better audience alignment."],
  ["Awareness & campaign promotion", "Organic content can only go as far as the people who discover it.", "Prepare a message, destination, audience, budget, and measurement plan before promotion.", "We plan targeted, platform-compliant campaigns with you. An appropriate Campaign Growth Token may be included if available and approved.", "Campaigns can create awareness, but exposure alone does not create loyal viewers.", "Greater awareness and more opportunities to reach potential viewers."],
  ["Viewer conversion", "Getting someone to your channel is only half the battle. Give them a reason to follow.", "Make the next action clear: why to follow, when to return, and where to join your community.", "We improve the viewer journey, calls to action, messaging, and conversion opportunities.", "A visitor may enjoy a stream but leave without knowing what comes next.", "More opportunities to turn visitors into organic followers and returning viewers."],
  ["Engagement & community", "One-time viewers create traffic. Returning viewers create a community.", "Plan chat prompts, participation moments, moderation, and community touchpoints.", "We identify ways to improve chat interaction, participation, and community-building.", "People need reasons to take part and return beyond one visit.", "Stronger engagement and greater potential for active chatters and returning viewers."],
  ["Retention & content consistency", "Growth becomes easier to maintain when viewers know what to expect from you.", "Choose a realistic schedule, repeatable content formats, and a way to announce the next stream.", "We help structure content, scheduling, and consistency around your goals and audience.", "Predictability gives interested people a better chance to return.", "Better consistency and stronger opportunities to build returning-viewer habits."],
  ["Measure, optimize & scale", "Growth doesn't stop when the first campaign ends. That's when you learn what works.", "Record a baseline; test changes; review live viewers, follows, chat, repeat visits, and VOD activity.", "We review performance with you, adjust strategy, and prioritize the next actions.", "Measurement separates useful changes from a lucky stream.", "A repeatable process that can support Affiliate or Partner progress and, where eligible, subscribers and earnings."],
];

export function buildAuditRoadmap(audit: ChannelAudit) {
  const findings = buildAuditInsights(audit).findings;
  const has = (id: string) => findings.some((finding) => finding.id === id);
  const replay = buildReplayReview(audit);
  const name = audit.profile.displayName || audit.profile.login;
  const followers = audit.followers.data;
  const category = audit.stream.data?.isLive ? audit.stream.data.category : audit.channel.data?.category;
  const title = audit.stream.data?.isLive ? audit.stream.data.title : audit.channel.data?.title;
  const bio = audit.profile.description;
  const foundationIssue = ["bio", "live-category", "channel-category", "live-title", "channel-title"].some(has);
  const titleIssue = ["follow-first-title", "live-title-clarity", "channel-title-clarity"].some(has);
  const recommendedStart = foundationIssue ? 1 : titleIssue ? 4 : replay.status === "attention" ? 10 : followers !== null && followers < 25 && audit.profile.broadcasterType === "" ? 5 : 3;
  const recommendedReason = recommendedStart === 1 ? "A public profile, title, or category needs attention. Prepare the channel before sending more people to it."
    : recommendedStart === 4 ? "A public title could communicate the stream more clearly. Test that first, then check the response."
    : recommendedStart === 10 ? "Recent VOD counts are low. Review private analytics and test changes before spending on promotion."
    : recommendedStart === 5 ? "The public follower count is below the Affiliate follower milestone. Begin with a relevant audience strategy, not a follower-count promise."
    : "Start by defining a clear reason for the right viewers to choose this channel.";
  const stageMessage = audit.profile.broadcasterType === "partner"
    ? "Partner channel: prioritize returning viewers, community value, and subscriber experience. Subscriber revenue is not measured here."
    : audit.profile.broadcasterType === "affiliate"
    ? "Affiliate channel: strengthen discovery, engagement, and consistency while checking Partner progress in the Creator Dashboard."
    : "Building toward Affiliate: develop a real, returning audience and check private eligibility measures in the Creator Dashboard.";
  const channelNotes = [
    bio === null ? "The public bio was unavailable; review it with the creator." : bio.trim() ? name + " has a public bio. Check whether it explains the content and reason to return." : name + " has no public bio in this snapshot. Write a clear introduction first.",
    category === null || category === undefined ? "The public category was unavailable; verify it before making a discovery claim." : category.trim() ? "Twitch returned " + category.trim() + " as the category. Check that it matches the next stream." : "Twitch returned no category. Set one that accurately fits the content.",
    category?.trim() ? name + " is associated with " + category.trim() + ". Define the audience and content promise with the creator." : "The content niche cannot be confirmed from the public category alone.",
    title === null || title === undefined ? "The current title was unavailable; check it with the creator." : title.trim() ? "Current public title: " + title.trim().slice(0, 120) + ". Test a content-led alternative." : "The current public title is empty. Set one before the next stream.",
    followers === null ? "The follower total was unavailable. Agree on a baseline before setting a target." : "Twitch returned " + followers.toLocaleString() + " followers. Count alone cannot show whether they watch, chat, or return.",
    replay.status === "attention" ? "Recent VODs show low replay counts. Diagnose the audience path before paying to send more traffic." : "No public metric here proves a campaign will work. Agree on budget and success measures first.",
    "Public Twitch data cannot show " + name + "'s visitor-to-follower rate. Check follows gained per stream in the Creator Dashboard.",
    "Chat activity is not provided by this public audit. Review actual chat and return visits with the creator.",
    "Archived broadcasts do not establish " + name + "'s complete schedule or retention. Confirm both with the creator.",
    replay.status === "attention" ? replay.lowCount + " of " + replay.sampleCount + " sampled VODs have 20 or fewer views. Private analytics are needed to diagnose the cause." : "Use Creator Dashboard data for live audience, follows, chat, and eligible monetization measures.",
  ];
  const steps: RoadmapStep[] = copy.map(([stepTitle, hook, needsDoing, whatWeDo, whyItMatters, outcome], index) => ({
    number: index + 1, title: stepTitle, hook, needsDoing, whatWeDo, whyItMatters, outcome, channelNote: channelNotes[index],
  }));
  return { recommendedStart, recommendedReason, stageMessage, steps };
}
