import type { ChannelAudit } from "./channelAudit";

export type AuditFinding = {
  id: string;
  priority: "first" | "review";
  title: string;
  observation: string;
  action: string;
  sourceEndpoint: string;
  sourceLabel: string;
};

export type PublicSetupCheck = { label: string; complete: boolean };

/** Turn only facts returned by Twitch into recommendations. */
export function buildAuditInsights(audit: ChannelAudit): {
  findings: AuditFinding[];
  checks: PublicSetupCheck[];
} {
  const findings: AuditFinding[] = [];
  const checks: PublicSetupCheck[] = [];
  const live = audit.stream.data?.isLive ? audit.stream.data : null;
  const channel = audit.channel.data;
  const videos = audit.videos.data;

  if (live?.title !== null && live?.title !== undefined) {
    checks.push({ label: "Live title", complete: live.title.trim().length > 0 });
    if (!live.title.trim()) findings.push({
      id: "live-title", priority: "first", title: "Give this live stream a clear title",
      observation: "Twitch returned an empty title for the live stream at the time of this audit.",
      action: "Add a specific title that tells a new viewer what they will see right now.",
      sourceEndpoint: "get-streams", sourceLabel: "Twitch live stream",
    });
  }

  if (live?.category !== null && live?.category !== undefined) {
    checks.push({ label: "Live category", complete: live.category.trim().length > 0 });
    if (!live.category.trim()) findings.push({
      id: "live-category", priority: "first", title: "Set a category for the live stream",
      observation: "Twitch returned no category for the live stream at the time of this audit.",
      action: "Choose the category that best matches the stream so visitors know what to expect.",
      sourceEndpoint: "get-streams", sourceLabel: "Twitch live stream",
    });
  }

  if (audit.profile.description !== null) {
    checks.push({ label: "Channel bio", complete: audit.profile.description.trim().length > 0 });
    if (!audit.profile.description.trim()) findings.push({
      id: "bio", priority: "first", title: "Tell visitors what your channel is about",
      observation: "The channel bio returned by Twitch is empty.",
      action: "Add a short bio covering your content and what viewers can expect from you.",
      sourceEndpoint: "get-users", sourceLabel: "Twitch profile",
    });
  }

  if (channel?.title !== null && channel?.title !== undefined && !live) {
    checks.push({ label: "Channel title", complete: channel.title.trim().length > 0 });
    if (!channel.title.trim()) findings.push({
      id: "channel-title", priority: "first", title: "Prepare a descriptive channel title",
      observation: "Twitch returned an empty channel title in this snapshot.",
      action: "Set a title before your next stream that explains the content or goal of the broadcast.",
      sourceEndpoint: "get-channel-information", sourceLabel: "Twitch channel details",
    });
  }

  if (videos && videos.length > 0) {
    const knownTitles = videos.filter((video) => video.title !== null);
    if (knownTitles.length === videos.length) {
      checks.push({ label: "Recent VOD titles", complete: knownTitles.every((video) => !!video.title?.trim()) });
    }
    const untitled = knownTitles.filter((video) => !video.title?.trim()).length;
    if (untitled > 0) findings.push({
      id: "vod-titles", priority: "review", title: "Make your archived videos easier to recognize",
      observation: String(untitled) + " of " + String(videos.length) + " archived broadcasts returned by Twitch " + (untitled === 1 ? "has" : "have") + " an empty title.",
      action: "Review those VOD titles and describe the moment or topic a viewer will find there.",
      sourceEndpoint: "get-videos", sourceLabel: "Twitch archived videos",
    });
  } else if (videos?.length === 0) {
    findings.push({
      id: "vod-visibility", priority: "review", title: "Check what visitors can watch when you are offline",
      observation: "Twitch returned no public archived broadcasts in this snapshot. This does not prove the channel has not streamed.",
      action: "If you want visitors to sample past streams, review your VOD recording and publishing settings.",
      sourceEndpoint: "get-videos", sourceLabel: "Twitch archived videos",
    });
  }

  return { findings, checks };
}

export function buildAuditInviteMessage(audit: ChannelAudit, url: string): string {
  const { findings } = buildAuditInsights(audit);
  const detail = findings.length
    ? "A practical next step is to " + findings[0].title.toLowerCase() + ". The report shows the Twitch evidence behind it."
    : "It shows what Twitch makes public and what needs your own Creator Dashboard to verify.";
  const invitation = findings.length
    ? "If you want, I can walk through that first improvement with you."
    : "If you want, we can compare it with your Creator Dashboard and choose a next step.";
  const lineBreak = String.fromCharCode(10);
  return "Hi @" + audit.profile.login + " — I made a short, source-linked snapshot of your Twitch channel. " + detail + lineBreak + lineBreak + url + lineBreak + lineBreak + invitation;
}
