import type { ChannelAudit } from "./channelAudit";

export type AuditFinding = {
  id: string;
  priority: "first" | "review";
  title: string;
  observation: string;
  whyItMatters: string;
  action: string;
  sourceEndpoint: string;
  sourceLabel: string;
};

export type PublicSetupCheck = { label: string; complete: boolean };

export type PresentationCriterion = { label: string; earned: number; possible: number; basis: string };
export type PresentationScore = { value: number | null; covered: number; criteria: PresentationCriterion[] };

const words = (value: string) => value.trim().split(/\s+/).filter(Boolean).length;
const titlePoints = (value: string, possible: number) => {
  const title = value.trim();
  return Math.round(possible * ((title ? 0.4 : 0) + (words(title) >= 4 ? 0.3 : 0) + (title.length >= 24 ? 0.3 : 0)));
};

/** A disclosed editorial checklist, not a Twitch ranking or channel-performance score. */
export function buildPresentationScore(audit: ChannelAudit): PresentationScore {
  const criteria: PresentationCriterion[] = [];
  const title = audit.stream.data?.isLive ? audit.stream.data.title : audit.channel.data?.title;
  const category = audit.stream.data?.isLive ? audit.stream.data.category : audit.channel.data?.category;
  if (title !== null && title !== undefined) criteria.push({
    label: "Stream title clarity", earned: titlePoints(title, 30), possible: 30,
    basis: "30 points: a title is present (12), at least 4 words (9), and at least 24 characters (9). These are editorial prompts, not Twitch ranking rules.",
  });
  if (audit.profile.description !== null) {
    const bio = audit.profile.description.trim();
    criteria.push({
      label: "Channel bio detail", earned: (bio ? 10 : 0) + (bio.length >= 60 ? 10 : 0) + (bio.length >= 120 ? 5 : 0), possible: 25,
      basis: "25 points: a bio is present (10), at least 60 characters (10), and at least 120 characters (5). Length is only a prompt to review detail.",
    });
  }
  if (category !== null && category !== undefined) criteria.push({
    label: "Category set", earned: category.trim() ? 20 : 0, possible: 20,
    basis: "20 points when the returned live or channel category is set.",
  });
  if (audit.videos.data !== null) {
    const titled = audit.videos.data.filter((video) => video.title !== null);
    if (audit.videos.data.length === 0) criteria.push({
      label: "Public archive", earned: 0, possible: 25,
      basis: "No public archived broadcasts were returned. This may be intentional and does not imply the channel has not streamed.",
    });
    else if (titled.length > 0) criteria.push({
      label: "Recent VOD title clarity",
      earned: Math.round(titled.reduce((sum, video) => sum + titlePoints(video.title!, 25), 0) / titled.length), possible: 25,
      basis: "Average title points across returned VODs with known titles: present (10), at least 4 words (7.5), and at least 24 characters (7.5). Up to 10 recent VODs; this is not a performance metric.",
    });
  }
  const covered = criteria.reduce((sum, criterion) => sum + criterion.possible, 0);
  const earned = criteria.reduce((sum, criterion) => sum + criterion.earned, 0);
  return { value: covered >= 50 ? Math.round(earned / covered * 100) : null, covered, criteria };
}

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
      whyItMatters: "A new visitor has less context to decide whether this stream is for them.",
      action: "Add a specific title that tells a new viewer what they will see right now.",
      sourceEndpoint: "get-streams", sourceLabel: "Twitch live stream",
    });
    else if (words(live.title) < 4 || live.title.trim().length < 24) findings.push({
      id: "live-title-clarity", priority: "review", title: "Test a more specific title before the next stream",
      observation: "Twitch returned the live title “" + live.title.trim().replace(/\s+/g, " ").slice(0, 100) + "”. It is " + words(live.title) + " words long.",
      whyItMatters: "A more descriptive title may make the stream easier to understand at a glance; any effect needs testing.",
      action: "Try a title that names the game or topic, the stream goal, and a reason to join. Compare results in your own Creator Dashboard.",
      sourceEndpoint: "get-streams", sourceLabel: "Twitch live stream",
    });
  }

  if (live?.category !== null && live?.category !== undefined) {
    checks.push({ label: "Live category", complete: live.category.trim().length > 0 });
    if (!live.category.trim()) findings.push({
      id: "live-category", priority: "first", title: "Set a category for the live stream",
      observation: "Twitch returned no category for the live stream at the time of this audit.",
      whyItMatters: "Twitch uses categories to help viewers browse and discover relevant streams.",
      action: "Choose the category that best matches the stream so visitors know what to expect.",
      sourceEndpoint: "get-streams", sourceLabel: "Twitch live stream",
    });
  }

  if (audit.profile.description !== null) {
    checks.push({ label: "Channel bio", complete: audit.profile.description.trim().length > 0 });
    if (!audit.profile.description.trim()) findings.push({
      id: "bio", priority: "first", title: "Tell visitors what your channel is about",
      observation: "The channel bio returned by Twitch is empty.",
      whyItMatters: "Visitors cannot learn what to expect from the channel bio.",
      action: "Add a short bio covering your content and what viewers can expect from you.",
      sourceEndpoint: "get-users", sourceLabel: "Twitch profile",
    });
    else if (audit.profile.description.trim().length < 60) findings.push({
      id: "bio-detail", priority: "review", title: "Make the channel bio more specific",
      observation: "The public bio returned by Twitch is " + audit.profile.description.trim().length + " characters long.",
      whyItMatters: "A more specific introduction may help the right viewers recognize the channel; this is not a measured loss.",
      action: "Consider adding what you stream, who it is for, and what a new viewer can expect. This is an editorial suggestion, not a measured growth problem.",
      sourceEndpoint: "get-users", sourceLabel: "Twitch profile",
    });
  }

  if (channel?.title !== null && channel?.title !== undefined && !live) {
    checks.push({ label: "Channel title", complete: channel.title.trim().length > 0 });
    if (!channel.title.trim()) findings.push({
      id: "channel-title", priority: "first", title: "Prepare a descriptive channel title",
      observation: "Twitch returned an empty channel title in this snapshot.",
      whyItMatters: "A visitor has less context about the next broadcast.",
      action: "Set a title before your next stream that explains the content or goal of the broadcast.",
      sourceEndpoint: "get-channel-information", sourceLabel: "Twitch channel details",
    });
    else if (words(channel.title) < 4 || channel.title.trim().length < 24) findings.push({
      id: "channel-title-clarity", priority: "review", title: "Prepare a more specific title for the next stream",
      observation: "Twitch returned the channel title “" + channel.title.trim().replace(/\s+/g, " ").slice(0, 100) + "”. It is " + words(channel.title) + " words long.",
      whyItMatters: "A title that explains the next broadcast may give a new visitor a clearer reason to return.",
      action: "Try a title that says what will happen in the next stream and why someone should join. Test it against your Creator Dashboard data.",
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
      whyItMatters: "A visitor cannot tell what those archived broadcasts contain from their titles.",
      action: "Review those VOD titles and describe the moment or topic a viewer will find there.",
      sourceEndpoint: "get-videos", sourceLabel: "Twitch archived videos",
    });
    else if (knownTitles.some((video) => words(video.title!) < 4 || video.title!.trim().length < 24)) findings.push({
      id: "vod-title-clarity", priority: "review", title: "Help visitors choose a past broadcast",
      observation: "Some returned VOD titles are short. The report does not know whether this affects their views.",
      whyItMatters: "More descriptive VOD titles may make it easier to choose a past broadcast; any effect needs testing.",
      action: "Test titles that explain the moment, game, or challenge a viewer will find in each VOD.",
      sourceEndpoint: "get-videos", sourceLabel: "Twitch archived videos",
    });
  } else if (videos?.length === 0) {
    findings.push({
      id: "vod-visibility", priority: "review", title: "Check what visitors can watch when you are offline",
      observation: "Twitch returned no public archived broadcasts in this snapshot. This does not prove the channel has not streamed.",
      whyItMatters: "Visitors have no returned public archive to sample when the channel is offline.",
      action: "If you want visitors to sample past streams, review your VOD recording and publishing settings.",
      sourceEndpoint: "get-videos", sourceLabel: "Twitch archived videos",
    });
  }

  return { findings, checks };
}

export function buildAuditInviteMessage(audit: ChannelAudit, url: string): string {
  const { findings } = buildAuditInsights(audit);
  const detail = findings.length
    ? "One public-presentation opportunity worth testing is to " + findings[0].title.toLowerCase() + ". The report shows the Twitch evidence and explains what is only an editorial suggestion."
    : "The limited public checklist did not confirm a presentation issue. The report also shows what only your Creator Dashboard can verify.";
  const invitation = findings.length
    ? "If you'd like, I can turn this into three concrete edits and a short test plan you can check against your own analytics."
    : "If you want, we can review your private analytics together with your permission and choose a useful next step.";
  const lineBreak = String.fromCharCode(10);
  return "Hi @" + audit.profile.login + " — I made a short, source-linked snapshot of your Twitch channel. " + detail + lineBreak + lineBreak + url + lineBreak + lineBreak + invitation;
}
