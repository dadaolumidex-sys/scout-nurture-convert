import type { KickAudit } from "./kickAudit";

export type KickScoreCriterion = {
  label: string;
  earned: number | null;
  possible: number;
  basis: string;
};

export type KickFinding = {
  id: string;
  severity: "critical" | "review";
  title: string;
  evidence: string;
  whyItMatters: string;
  fix: string;
};

const wordCount = (value: string) => value.split(/\s+/).filter(Boolean).length;
const asksForFollowFirst = (value: string) =>
  /^\s*(?:drop\s+(?:a\s+)?follow|follow(?:\s+(?:me|us|back))?|please\s+follow|subscribe|like|share)\b/i.test(value);

/** Editorial snapshot score: public signals only, not a Kick ranking or growth diagnosis. */
export function buildKickInsights(audit: KickAudit) {
  const title = audit.channel.title?.trim() || null;
  const category = audit.channel.category?.trim() || null;
  const viewers = audit.stream.isLive ? audit.stream.viewers : null;
  const titleIsFollowFirst = title !== null && asksForFollowFirst(title);
  const titleIsSpecific = title !== null && wordCount(title) >= 4 && title.length >= 24;
  const criteria: KickScoreCriterion[] = [
    {
      label: "Live viewers at retrieval",
      earned: viewers === null ? null : viewers <= 2 ? 0 : viewers < 10 ? 15 : viewers < 25 ? 35 : 60,
      possible: 60,
      basis: viewers === null
        ? "No live-viewer snapshot was returned. Offline or missing data is not zero."
        : viewers.toLocaleString() + " viewers at retrieval. Editorial comparison: 0-2 = 0 points, 3-9 = 15, 10-24 = 35, 25+ = 60. This is one moment, not average viewers or a Kick rule.",
    },
    {
      label: "Viewer-facing stream title",
      earned: title === null ? null : titleIsFollowFirst ? 0 : titleIsSpecific ? 30 : 15,
      possible: 30,
      basis: title === null
        ? "Kick did not return a title. It is not scored as empty."
        : titleIsFollowFirst
          ? "The title leads with a follow or engagement request, before describing the content. Editorial clarity score: 0/30."
          : titleIsSpecific
            ? "The title has at least 4 words and 24 characters. Editorial clarity score: 30/30."
            : "A title was returned but is brief. Editorial clarity score: 15/30. Length does not prove click performance.",
    },
    {
      label: "Category returned",
      earned: category === null ? null : 10,
      possible: 10,
      basis: category === null
        ? "Kick did not return a category. It is not scored as missing from the channel."
        : "Kick returned " + category + " as the channel category. Confirm it matches the broadcast.",
    },
  ];
  const scored = criteria.filter((criterion) => criterion.earned !== null);
  const covered = scored.reduce((total, criterion) => total + criterion.possible, 0);
  // Without a live snapshot, presentation alone cannot stand in for audience performance.
  const value = viewers !== null && title !== null
    ? Math.round(scored.reduce((total, criterion) => total + criterion.earned!, 0) / covered * 100)
    : null;

  const findings: KickFinding[] = [];
  if (titleIsFollowFirst) findings.push({
    id: "follow-first-title", severity: "critical",
    title: "Critical presentation priority: lead with the stream, not a follow request",
    evidence: "Kick returned this title: " + title!.slice(0, 120),
    whyItMatters: "New viewers see a request before they know what this broadcast offers. Its effect on clicks has not been measured.",
    fix: "Put the game, challenge, or standout moment first. Move the follow invitation after the content promise, then compare results.",
  });
  else if (title !== null && !titleIsSpecific) findings.push({
    id: "brief-title", severity: "review",
    title: "Make the stream title more specific",
    evidence: "Kick returned this title: " + title.slice(0, 120),
    whyItMatters: "A brief title can give a new viewer less context about what they will see.",
    fix: "Test a title that names the content and a reason to watch. Compare the next broadcasts with the creator's own analytics.",
  });
  if (viewers !== null && viewers < 10) findings.push({
    id: "live-snapshot", severity: "review",
    title: "Review current live reach before the next broadcast",
    evidence: "Kick showed " + viewers.toLocaleString() + " live " + (viewers === 1 ? "viewer" : "viewers") + " at retrieval.",
    whyItMatters: "This is a small live audience at one moment. It does not show average viewers, prove a hidden error, or explain why anyone left.",
    fix: "Check the creator's live-viewer trend, discovery sources, schedule, and chat activity. Test one title or promotion change and measure the next streams.",
  });
  const bio = audit.profile.description?.trim();
  if (bio && bio.length < 60) findings.push({
    id: "brief-bio", severity: "review",
    title: "Give new visitors a clearer channel promise",
    evidence: "Kick returned a description of " + bio.length + " characters.",
    whyItMatters: "A more specific About section may help visitors understand the content. This is an editorial suggestion, not a measured loss.",
    fix: "Explain what is streamed, who it is for, and why someone might return. Compare follows after the change.",
  });
  return { value, covered, criteria, findings };
}
