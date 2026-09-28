import { AlertTriangle, CheckCircle2, ExternalLink, Radio, ShieldCheck, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelGrowthRoadmap } from "./ChannelGrowthRoadmap";
import { Badge } from "@/components/ui/badge";
import { formatAuditDate, type ChannelAudit } from "@/lib/channelAudit";
import { buildAuditInsights, buildPublicOpportunityScore, buildReplayReview, presentationScoreBand, type AuditFinding } from "@/lib/auditInsights";

const docs = "https://dev.twitch.tv/docs/api/reference/";

function Source({ endpoint, label }: { endpoint: string; label: string }) {
  return <a href={`${docs}#${endpoint}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4 hover:text-primary">
    Source: {label}<ExternalLink className="h-3 w-3" aria-hidden="true" />
  </a>;
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="rounded-lg bg-muted/50 p-3 min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="mt-1 text-sm font-semibold break-words">{value}</dd>
    {note && <dd className="mt-1 text-xs font-normal text-muted-foreground">{note}</dd>}
  </div>;
}

function RequirementItem({ label, target, progress }: { label: string; target: string; progress: string }) {
  return <li className="rounded-lg border border-border/70 bg-background/60 p-3">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-sm font-bold text-primary">{target}</span>
    </div>
    <p className="mt-1 text-xs text-muted-foreground">{progress}</p>
  </li>;
}

function FindingCard({ finding, index }: { finding: AuditFinding; index: number }) {
  const first = finding.priority === "first";
  const attention = first || finding.id === "replay-views";
  return <li className={"rounded-xl border p-4 sm:p-5 " + (attention ? "border-rose-500/55 bg-rose-500/10" : "border-amber-500/35 bg-amber-500/5")}>
    <div className={"flex items-center gap-2 text-xs font-bold uppercase tracking-wide " + (attention ? "text-rose-500" : "text-amber-500")}>
      {attention ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <Target className="h-4 w-4" aria-hidden="true" />}
      <span>{finding.id === "replay-views" ? "Public replay signal" : first ? "Verified public issue" : "Opportunity to test"} · {index + 1}</span>
    </div>
    <h4 className="mt-2 text-lg font-bold">{finding.title}</h4>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg bg-background/70 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Evidence</p>
        <p className="mt-1 text-sm">{finding.observation}</p>
      </div>
      <div className="rounded-lg bg-background/70 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Why it matters</p>
        <p className="mt-1 text-sm">{finding.whyItMatters}</p>
      </div>
    </div>
    <p className="mt-3 rounded-lg border border-border/70 p-3 text-sm"><span className="font-bold">Fix to test:</span> {finding.action}</p>
    <div className="mt-3"><Source endpoint={finding.sourceEndpoint} label={finding.sourceLabel} /></div>
  </li>;
}

export function ChannelAuditReport({ audit, readOnly = false }: { audit: ChannelAudit; readOnly?: boolean }) {
  const { profile, stream, followers, channel, videos } = audit;
  const live = stream.data;
  const partial = [stream, followers, channel, videos].some((part) => part.status === "unavailable");
  const broadcaster = profile.broadcasterType === "" ? "Neither Affiliate nor Partner" : profile.broadcasterType === null ? "Unavailable" : profile.broadcasterType === "partner" ? "Partner" : "Affiliate";
  const { findings, checks } = buildAuditInsights(audit);
  const replay = buildReplayReview(audit);
  const repeatedLowReplay = replay.sampleCount >= 3 && replay.lowCount === replay.sampleCount;
  const score = buildPublicOpportunityScore(audit);
  const scoreBand = presentationScoreBand(score.value);
  const completed = checks.filter((check) => check.complete).length;
  const verifiedIssues = findings.filter((finding) => finding.priority === "first").length;
  const aiFindings = audit.ai?.status === "available" ? audit.ai.findings : [];
  const aiPriority = aiFindings[0];
  const urgent = verifiedIssues > 0 || replay.status === "attention" || scoreBand === "danger";
  const headline = repeatedLowReplay ? "Critical review priority: repeated low replay activity" : replay.status === "attention" ? "Recent broadcasts need a replay-reach review" : scoreBand === "danger" && followers.data !== null && followers.data < 25 ? "Build the audience and test replay reach" : aiPriority ? aiPriority.title : verifiedIssues > 0 ? verifiedIssues + " public channel " + (verifiedIssues === 1 ? "issue" : "issues") + " to fix" : findings.length > 0 ? findings.length + " channel opportunities to test" : "Public setup reviewed; audience performance unknown";
  const knownVodViews = videos.data?.flatMap((video) => video.views === null ? [] : [video.views]) ?? [];
  const vodViewRange = videos.data === null ? "Unavailable" : videos.data.length === 0 ? "No public VODs" : knownVodViews.length === 0 ? "Unavailable" : Math.min(...knownVodViews) === Math.max(...knownVodViews) ? Math.min(...knownVodViews).toLocaleString() : Math.min(...knownVodViews).toLocaleString() + "–" + Math.max(...knownVodViews).toLocaleString();

  return <div className="space-y-4 animate-slide-in" aria-label={`Audit for ${profile.displayName}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" />{audit.source}</span>
      <span>Retrieved {formatAuditDate(audit.fetchedAt)}</span>
    </div>
    {partial && <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Partial report: some Twitch data could not be retrieved. Available facts are shown below.{!readOnly && " Run the audit again to retry."}</p>}

    <Card className={"overflow-hidden border bg-gradient-to-br via-card to-card " + (urgent ? "border-rose-500/50 from-rose-500/15" : "border-amber-500/30 from-amber-500/10")}>
      <CardContent className="space-y-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <p className={"text-xs font-bold uppercase tracking-[0.16em] " + (urgent ? "text-rose-500" : "text-amber-500")}>{repeatedLowReplay ? "Critical public replay issue" : replay.status === "attention" ? "Public replay signal needs attention" : aiPriority ? "AI-assisted first priority" : verifiedIssues > 0 ? "Verified channel issues" : "Public-channel review"}</p>
            <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">{headline}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {repeatedLowReplay ? "Every sampled recent broadcast has 20 or fewer VOD views. This repeated pattern deserves a focused review before more streams go by without a plan." : replay.status === "attention" ? "Twitch returned " + replay.lowCount + " recent archived " + (replay.lowCount === 1 ? "broadcast" : "broadcasts") + " with 20 or fewer VOD views. That is a real replay signal to investigate, not proof of bot followers or a hidden Twitch error." : aiPriority ? "First fix to test: " + aiPriority.fix : findings.length ? "First fix to test: " + findings[0].action : "Completed setup fields do not measure audience growth. Review the creator's own analytics before claiming a cause."}
            </p>
          </div>
          <Badge variant="outline" className={urgent ? "border-rose-500/60 text-rose-500" : "border-amber-500/50 text-amber-500"}><ShieldCheck className="mr-1 h-3 w-3" />{repeatedLowReplay ? "Review now" : replay.status === "attention" ? "Action recommended" : aiPriority ? aiFindings.length + " AI " + (aiFindings.length === 1 ? "fix" : "fixes") : verifiedIssues > 0 ? verifiedIssues + " verified" : findings.length + " to test"}</Badge>
        </div>
        <div className={"rounded-xl border bg-background/80 p-4 sm:p-5 " + (scoreBand === "danger" ? "border-rose-500/70" : "border-border/70")}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Public opportunity score</p>
              <p className={"mt-1 text-3xl font-extrabold " + (scoreBand === "danger" ? "text-rose-500" : scoreBand === "review" ? "text-amber-500" : scoreBand === "strong" ? "text-emerald-500" : "text-foreground")}>
                {score.value === null ? "Not enough data" : score.value + "/100"}
              </p>
            </div>
            <Badge variant="outline" className={scoreBand === "danger" ? "border-rose-500/70 text-rose-500" : scoreBand === "review" ? "border-amber-500/60 text-amber-500" : "border-border"}>
              {repeatedLowReplay && scoreBand === "danger" ? "Critical issue to investigate" : scoreBand === "danger" ? "Priority: needs work" : scoreBand === "review" ? "Opportunities to test" : scoreBand === "strong" ? "Stronger public signals" : "Unscored"}
            </Badge>
          </div>
          {score.value !== null && <div role="meter" aria-label="Public opportunity score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score.value} className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
            <div className={"h-full rounded-full " + (scoreBand === "danger" ? "bg-rose-500" : scoreBand === "review" ? "bg-amber-500" : "bg-emerald-500")} style={{ width: score.value + "%" }} />
          </div>}
          <p className="mt-3 text-sm text-muted-foreground">{replay.status === "attention"
            ? replay.lowCount + " of " + replay.sampleCount + " recent archived broadcasts have 20 or fewer VOD views; the lowest has " + replay.lowestViews + ". " + (repeatedLowReplay ? "Repeated low replay activity is the top issue in this public review." : "That is a concrete replay signal worth investigating.")
            : replay.status === "insufficient" ? "There are not enough aged public VODs to score replay activity fairly." : "This sample did not show VODs at or below the 20-view review line."}</p>
          <p className="mt-2 text-sm text-muted-foreground">{followers.data === null ? "Follower total unavailable; it is not scored as zero." : followers.data >= 25 ? repeatedLowReplay ? followers.data.toLocaleString() + " followers are already present. That does not explain the low VOD counts; the next step is to investigate what can improve replay activity." : followers.data.toLocaleString() + " followers returned by Twitch: the public follower milestone is met, so this report does not flag a follower deficit." : followers.data.toLocaleString() + " followers returned by Twitch: organic audience building is one area to work on."}</p>
          {repeatedLowReplay && <div className="mt-4 rounded-lg border border-rose-500/60 bg-rose-500/10 p-4">
            <p className="font-bold text-rose-500">Get an expert review before the next broadcasts</p>
            <p className="mt-2 text-sm">Review the VOD titles, category choices, highlights, promotion path, and the creator's private analytics. An expert can prioritize specific fixes and measure whether the next broadcasts improve.</p>
            <p className="mt-2 text-sm font-semibold">{readOnly ? "Reply to the person who sent this report to request a channel review and fix plan." : "Share this finding and offer the streamer a focused channel review and fix plan."}</p>
            <p className="mt-2 text-xs text-muted-foreground">Public VOD counts do not reveal a hidden Twitch backend error or prove why viewers leave.</p>
          </div>}
          <details className="mt-4 border-t border-border/70 pt-3">
            <summary className="cursor-pointer text-sm font-semibold">How this score is calculated</summary>
            <p className="mt-2 text-xs text-muted-foreground">An editorial public-signal score, not a Twitch health score, live-viewer average, SEO ranking, bot diagnosis, or proof of lost revenue. Red is below 50; amber is 50-79; green is 80-100. Missing inputs make the whole score unavailable, never zero.</p>
            <ul className="mt-3 space-y-3">{score.criteria.map((criterion) => <li key={criterion.label} className="rounded-lg border border-border/70 p-3">
              <div className="flex justify-between gap-3 text-sm font-semibold"><span>{criterion.label}</span><span className="shrink-0">{criterion.earned === null ? "Unavailable" : criterion.earned + "/" + criterion.possible}</span></div>
              <p className="mt-1 text-xs text-muted-foreground">{criterion.basis}</p>
            </li>)}</ul>
            <a href="https://help.twitch.tv/s/article/twitch-affiliate-program-faq?language=en_US" target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-primary underline underline-offset-4">Twitch Affiliate requirements <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>
          </details>
        </div>
        {findings.length > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{verifiedIssues} verified setup {verifiedIssues === 1 ? "issue" : "issues"} · {findings.length - verifiedIssues} improvement {findings.length - verifiedIssues === 1 ? "test" : "tests"}</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border/70 bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Followers returned</p>
            <p className="mt-1 text-xl font-bold">{followers.data === null ? "Unavailable" : followers.data.toLocaleString()}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Live viewers at retrieval</p>
            <p className="mt-1 text-xl font-bold">{live?.isLive ? live.viewers?.toLocaleString() ?? "Unavailable" : stream.status === "unavailable" ? "Unavailable" : "Not live"}</p>
          </div>
          <div className="rounded-lg border border-border/70 bg-background/70 p-3">
            <p className="text-xs text-muted-foreground">Views on returned recent VODs</p>
            <p className="mt-1 text-xl font-bold">{vodViewRange}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">These public snapshots are not average viewers, a follower-conversion rate, or evidence that a title caused low views.</p>
      </CardContent>
    </Card>

    {audit.ai && <Card className="border-orange-500/40">
      <CardHeader className="pb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-orange-500">AI-assisted channel review</p>
        <CardTitle className="text-xl">What may be holding this channel back—and what to change</CardTitle>
        <p className="text-sm text-muted-foreground">Each recommendation uses a real public channel detail. The possible effect is a hypothesis, not a measured cause of lost viewers.</p>
      </CardHeader>
      <CardContent>
        {audit.ai.status === "available" && audit.ai.findings.length ? <ol className="grid gap-3">
          {audit.ai.findings.map((finding, index) => <li key={finding.evidenceId} className={"rounded-xl border p-4 sm:p-5 " + (index === 0 ? "border-rose-500/50 bg-rose-500/10" : "border-orange-500/30 bg-orange-500/5")}>
            <p className={"text-xs font-bold uppercase tracking-wide " + (index === 0 ? "text-rose-500" : "text-orange-500")}>Priority {index + 1} · AI recommendation</p>
            <h4 className="mt-2 text-lg font-bold">{finding.title}</h4>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-background/70 p-3"><dt className="text-xs font-semibold uppercase text-muted-foreground">Verified Twitch detail</dt><dd className="mt-1 text-sm break-words">{finding.evidence}</dd></div>
              <div className="rounded-lg bg-background/70 p-3"><dt className="text-xs font-semibold uppercase text-muted-foreground">Possible viewer friction</dt><dd className="mt-1 text-sm">{finding.possibleImpact}</dd></div>
            </dl>
            <p className="mt-3 text-sm"><span className="font-bold">Fix:</span> {finding.fix}</p>
            <p className="mt-2 text-sm"><span className="font-bold">Check the result:</span> {finding.test}</p>
          </li>)}
        </ol> : <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">{audit.ai.reason || "AI review is unavailable. Verified Twitch facts are shown below."}</p>}
      </CardContent>
    </Card>}

    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">What viewers see · What to fix</CardTitle>
        <p className="text-sm text-muted-foreground">Red marks an observed public issue or a replay count worth reviewing. Amber marks ideas to test. Neither proves why live viewers leave or that followers are bots.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {findings.length ? <ol className="grid gap-3">
          {findings.map((finding, index) => <FindingCard key={finding.id} finding={finding} index={index} />)}
        </ol> : <div className="rounded-xl border border-border bg-muted/25 p-4 text-sm text-muted-foreground">
          This limited public checklist did not identify a presentation opportunity. It cannot establish how the channel is performing; the creator's own analytics can reveal more.
        </div>}
        {checks.length > 0 && <details className="border-t border-border pt-4">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">Verified setup checks ({completed}/{checks.length})</summary>
          <ul className="flex flex-wrap gap-2">{checks.map((check) => <li key={check.label} className={"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs " + (check.complete ? "border-primary/30 text-primary" : "border-amber-500/40 text-amber-700 dark:text-amber-300")}>
            {check.complete ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
            {check.label}: {check.complete ? "Set" : "Needs attention"}
          </li>)}</ul>
        </details>}
        <div className="rounded-xl border border-orange-500/40 bg-gradient-to-r from-rose-500/15 to-orange-500/15 p-4 sm:p-5">
          <p className="text-base font-bold">Turn the first finding into a real fix</p>
          <p className="mt-2 text-sm">{findings.length ? "First priority: " + findings[0].title + "." : "First priority: review the creator's private Stream Summary with permission."} Then compare results in Twitch Analytics instead of guessing about growth.</p>
          <p className="mt-3 text-sm font-semibold">{readOnly ? "Reply to the sender and ask for a concrete fix plan for your channel." : "Send this report with an offer to show the streamer the first concrete change."}</p>
        </div>
      </CardContent>
    </Card>

    <ChannelGrowthRoadmap audit={audit} />

    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {profile.profileImageUrl && <img src={profile.profileImageUrl} alt="" className="h-12 w-12 shrink-0 rounded-full" />}
            <div className="min-w-0">
              <CardTitle className="break-words text-xl">{profile.displayName}</CardTitle>
              <a href={`https://www.twitch.tv/${profile.login}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-primary hover:underline break-all">@{profile.login}<ExternalLink className="h-3 w-3 shrink-0" /></a>
            </div>
          </div>
          <Badge variant="outline" className={live?.isLive ? "border-primary text-primary" : "text-muted-foreground"}>
            {live?.isLive && <Radio className="mr-1 h-3 w-3" />}
            {stream.status === "unavailable" ? "Live status unavailable" : live?.isLive ? "Live at retrieval" : "Offline at retrieval"}
          </Badge>
        </div>
        <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{profile.description === null ? "Channel bio unavailable." : profile.description || "No channel bio returned by Twitch."}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Fact label="Broadcaster status" value={broadcaster} />
          <Fact label="Account created" value={formatAuditDate(profile.createdAt)} />
        </dl>
        <Source endpoint="get-users" label="Twitch profile" />
      </CardContent>
    </Card>

    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Twitch Affiliate and Partner paths</CardTitle>
          <Badge variant="outline">Requirements shown, eligibility not scored</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Current Twitch requirements are listed below. Public channel data cannot show the creator's private achievement progress or decide eligibility.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 sm:grid-cols-2">
          <Fact label="Status returned by Twitch" value={broadcaster} />
          <Fact label="Verified follower total" value={followers.data === null ? "Unavailable" : followers.data.toLocaleString()} />
        </dl>
        <section aria-labelledby="affiliate-requirements" className="space-y-3 rounded-xl border border-border p-4">
          <h3 id="affiliate-requirements" className="font-bold">Path to Affiliate</h3>
          <p className="text-xs text-muted-foreground">Twitch requires all four achievements within a 30-day period.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            <RequirementItem label="Followers" target="25 followers" progress={followers.data === null
              ? "Public total unavailable. Check the creator's Achievements page."
              : "Public total: " + followers.data.toLocaleString() + (followers.data >= 25 ? " — at or above this target by public count." : " — below this target by public count.") + " Confirm achievement status in the Creator Dashboard."} />
            <RequirementItem label="Time streamed" target="4 hours" progress="Qualifying 30-day progress is only available to the creator." />
            <RequirementItem label="Distinct stream days" target="4 days" progress="Qualifying 30-day progress is only available to the creator." />
            <RequirementItem label="Concurrent viewers" target="3 average viewers on 4 days" progress="This is a live-viewer achievement, not VOD views. Progress is only available to the creator." />
          </ul>
          <p className="text-xs text-muted-foreground">Source: Twitch Help, <a href="https://help.twitch.tv/s/article/achievements?language=en_US" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-4">Achievements <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>.</p>
        </section>
        <section aria-labelledby="partner-requirements" className="space-y-3 rounded-xl border border-border p-4">
          <h3 id="partner-requirements" className="font-bold">Path to Partner</h3>
          <p className="text-xs text-muted-foreground">Twitch describes two consecutive 30-day periods with qualifying broadcasts.</p>
          <ul className="grid gap-2">
            <RequirementItem label="Most recent 30 days" target="6 streams on 6 unique days" progress="Each qualifying stream needs at least 75 average viewers. The creator's qualifying progress is not public." />
            <RequirementItem label="Previous 30 days" target="6 streams on 6 unique days" progress="Each qualifying stream needs at least 75 average viewers. The creator's qualifying progress is not public." />
          </ul>
          <p className="text-xs text-muted-foreground">Completing the path unlocks an application, not automatic Partner status. Twitch also reviews the channel and content.</p>
          <p className="text-xs text-muted-foreground">Source: Twitch Help, <a href="https://help.twitch.tv/s/article/achievements?language=en_US" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-4">Achievements <ExternalLink className="h-3 w-3" aria-hidden="true" /></a> and <a href="https://help.twitch.tv/s/article/partner-program-overview?language=en_US" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-4">Partner Program Overview <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>.</p>
        </section>
        <p className="text-xs text-muted-foreground">Only the follower total is available from this public snapshot. Missing private metrics are not zero; the streamer should check their Twitch Creator Dashboard for actual progress.</p>
      </CardContent>
    </Card>

    <div className="grid gap-4 sm:grid-cols-2">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Followers</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-2xl font-bold">{followers.data === null ? "Unavailable" : followers.data.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{followers.reason || "Follower total returned by Twitch at retrieval."}</p>
          <Source endpoint="get-channel-followers" label="Twitch follower total" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Current live viewers</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-2xl font-bold">{live?.isLive ? (live.viewers?.toLocaleString() ?? "Unavailable") : stream.status === "unavailable" ? "Unavailable" : "Not live"}</p>
          <p className="text-xs text-muted-foreground">{stream.reason || "A snapshot of concurrent viewers, not an average."}</p>
          <Source endpoint="get-streams" label="Twitch live stream" />
        </CardContent>
      </Card>
    </div>

    {live?.isLive && <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Live broadcast at retrieval</CardTitle></CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-3">
          <Fact label="Live title" value={live.title === "" ? "No title set" : live.title ?? "Unavailable"} />
          <Fact label="Live category" value={live.category === "" ? "No category set" : live.category ?? "Unavailable"} />
          <Fact label="Started" value={formatAuditDate(live.startedAt)} />
        </dl>
      </CardContent>
    </Card>}

    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Channel details</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {channel.data ? <dl className="grid gap-3 sm:grid-cols-3">
          <Fact label="Channel title" value={channel.data.title === "" ? "No title set" : channel.data.title ?? "Unavailable"} />
          <Fact label="Channel category" value={channel.data.category === "" ? "No category set" : channel.data.category ?? "Unavailable"} />
          <Fact label="Broadcast language" value={channel.data.language || "Unavailable"} />
        </dl> : <p className="text-sm text-muted-foreground">Unavailable. {channel.reason}</p>}
        <p className="text-xs text-muted-foreground">Channel settings can remain visible while a channel is offline.</p>
        <Source endpoint="get-channel-information" label="Twitch channel details" />
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Recent broadcasts</CardTitle>
        <p className="text-xs text-muted-foreground">Up to 10 archived broadcasts returned by Twitch, newest first. VOD views are video views and do not measure average live viewers or streaming frequency.</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {videos.data === null ? <p className="text-sm text-muted-foreground">Unavailable. {videos.reason}</p> : videos.data.length === 0 ? <p className="text-sm text-muted-foreground">Twitch returned no archived broadcasts. This does not establish when or how often this channel streams.</p> :
          <ul className="divide-y divide-border">
            {videos.data.map((video) => <li key={video.id} className="py-3 first:pt-0">
              <a className="inline-flex max-w-full items-start gap-1 text-sm font-medium text-primary hover:underline" href={`https://www.twitch.tv/videos/${video.id}`} target="_blank" rel="noopener noreferrer"><span className="break-words">{video.title === "" ? "Untitled broadcast" : video.title ?? "Title unavailable"}</span><ExternalLink className="mt-0.5 h-3 w-3 shrink-0" /></a>
              <dl className="mt-2 grid grid-cols-1 gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                <div><dt className="inline">Created: </dt><dd className="inline">{formatAuditDate(video.createdAt)}</dd></div>
                <div><dt className="inline">Duration: </dt><dd className="inline">{video.duration || "Unavailable"}</dd></div>
                <div><dt className="inline">VOD views: </dt><dd className="inline">{video.views?.toLocaleString() ?? "Unavailable"}</dd></div>
              </dl>
            </li>)}
          </ul>}
        <Source endpoint="get-videos" label="Twitch archived videos" />
      </CardContent>
    </Card>

    <Card className="border-primary/20 bg-muted/20">
      <CardHeader className="pb-3"><CardTitle className="text-base">To diagnose why viewers leave, ask for the Creator Dashboard</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <p>Average viewers, follows gained per stream, minutes watched, and performance over time are private Twitch Analytics. This public link cannot prove a retention problem or a revenue loss.</p>
        <p>With the streamer's permission, those numbers can turn this public first impression into a real growth diagnosis. Missing metrics stay unavailable—not zero.</p>
      </CardContent>
    </Card>
  </div>;
}
