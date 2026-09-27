import { AlertTriangle, CheckCircle2, ExternalLink, Radio, ShieldCheck, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatAuditDate, type ChannelAudit } from "@/lib/channelAudit";
import { buildAuditInsights, type AuditFinding } from "@/lib/auditInsights";

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

function FindingCard({ finding, index }: { finding: AuditFinding; index: number }) {
  const first = finding.priority === "first";
  return <li className={"rounded-xl border p-4 " + (first ? "border-amber-500/35 bg-amber-500/5" : "border-border bg-muted/25")}>
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
      {first ? <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" /> : <Target className="h-4 w-4 text-primary" aria-hidden="true" />}
      <span>{first ? "Confirmed setup gap" : "Review opportunity"} · Step {index + 1}</span>
    </div>
    <h4 className="mt-2 text-base font-semibold">{finding.title}</h4>
    <p className="mt-2 text-sm text-muted-foreground"><span className="font-medium text-foreground">What Twitch showed:</span> {finding.observation}</p>
    <p className="mt-2 text-sm"><span className="font-medium">First action:</span> {finding.action}</p>
    <div className="mt-3"><Source endpoint={finding.sourceEndpoint} label={finding.sourceLabel} /></div>
  </li>;
}

export function ChannelAuditReport({ audit, readOnly = false }: { audit: ChannelAudit; readOnly?: boolean }) {
  const { profile, stream, followers, channel, videos } = audit;
  const live = stream.data;
  const partial = [stream, followers, channel, videos].some((part) => part.status === "unavailable");
  const broadcaster = profile.broadcasterType === "" ? "Neither Affiliate nor Partner" : profile.broadcasterType === null ? "Unavailable" : profile.broadcasterType === "partner" ? "Partner" : "Affiliate";
  const { findings, checks } = buildAuditInsights(audit);
  const completed = checks.filter((check) => check.complete).length;
  const confirmed = findings.filter((finding) => finding.priority === "first").length;
  const headline = confirmed > 0
    ? String(confirmed) + " public setup " + (confirmed === 1 ? "gap" : "gaps") + " worth fixing"
    : findings.length > 0 ? "A public-content opportunity to review" : "No public setup gaps confirmed";

  return <div className="space-y-4 animate-slide-in" aria-label={`Audit for ${profile.displayName}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" />{audit.source}</span>
      <span>Retrieved {formatAuditDate(audit.fetchedAt)}</span>
    </div>
    {partial && <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Partial report: some Twitch data could not be retrieved. Available facts are shown below.{!readOnly && " Run the audit again to retry."}</p>}

    <Card className="overflow-hidden border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-card to-card">
      <CardContent className="space-y-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-amber-600 dark:text-amber-400">Public-channel review</p>
            <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">{headline}</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {findings.length ? "Start here: " + findings[0].action : "The public fields checked here did not show a clear setup gap. Private Creator Dashboard data is still needed to judge performance."}
            </p>
          </div>
          <Badge variant="outline" className="border-primary/40 text-primary"><ShieldCheck className="mr-1 h-3 w-3" />Twitch-sourced</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Actionable observations</p>
            <p className="mt-1 text-2xl font-bold">{findings.length}</p>
            <p className="text-xs text-muted-foreground">Based on fields Twitch actually returned.</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/70 p-4">
            <div className="flex items-center justify-between gap-2 text-xs uppercase tracking-wide text-muted-foreground">
              <span>Public setup checks</span><span>{checks.length ? String(completed) + " of " + String(checks.length) : "Unavailable"}</span>
            </div>
            {checks.length > 0 && <div role="progressbar" aria-label="Public setup checks completed" aria-valuemin={0} aria-valuemax={checks.length} aria-valuenow={completed} className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: String((completed / checks.length) * 100) + "%" }} />
            </div>}
            <p className="mt-2 text-xs text-muted-foreground">A checklist of visible fields, not an overall channel health score.</p>
          </div>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">What to work on next</CardTitle>
        <p className="text-sm text-muted-foreground">Each suggestion below is tied to a visible Twitch field. A missing or private metric is never treated as zero.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {findings.length ? <ol className="grid gap-3">
          {findings.map((finding, index) => <FindingCard key={finding.id} finding={finding} index={index} />)}
        </ol> : <div className="rounded-xl border border-border bg-muted/25 p-4 text-sm text-muted-foreground">
          No gap was confirmed in the public fields this audit could check. That does not establish how the channel is performing; the creator's own analytics can reveal more.
        </div>}
        {checks.length > 0 && <div className="border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Visible setup checklist</p>
          <ul className="flex flex-wrap gap-2">{checks.map((check) => <li key={check.label} className={"inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs " + (check.complete ? "border-primary/30 text-primary" : "border-amber-500/40 text-amber-700 dark:text-amber-300")}>
            {check.complete ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
            {check.label}: {check.complete ? "Set" : "Needs attention"}
          </li>)}</ul>
        </div>}
        <p className="rounded-xl bg-primary/10 p-4 text-sm">
          {readOnly ? "Want a practical plan for these findings? Ask the person who shared this report to walk through the first step with you." : "Share this source-linked report with the streamer so they can verify the observations and discuss a first step with you."}
        </p>
      </CardContent>
    </Card>

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
          <CardTitle className="text-base">Path to Affiliate / Partner</CardTitle>
          <Badge variant="outline">Eligibility not scored</Badge>
        </div>
        <p className="text-xs text-muted-foreground">A public report cannot see the creator's achievement progress or decide monetization eligibility.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid gap-2 sm:grid-cols-2">
          <Fact label="Status returned by Twitch" value={broadcaster} />
          <Fact label="Verified follower total" value={followers.data === null ? "Unavailable" : followers.data.toLocaleString()} />
          <Fact label="Qualifying stream hours and days" value="Not publicly available" />
          <Fact label="Average live viewers" value="Not publicly available" note="Current live viewers and VOD views are different metrics." />
        </dl>
        <p className="text-xs text-muted-foreground">For actual progress, the streamer should check Achievements in their Twitch Creator Dashboard. An unavailable metric does not mean zero.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">
          <a href="https://help.twitch.tv/s/article/joining-the-affiliate-program?language=en_US" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-4">Current Affiliate requirements <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>
          <a href="https://help.twitch.tv/s/article/partner-program-overview?language=en_US" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline underline-offset-4">Partner criteria <ExternalLink className="h-3 w-3" aria-hidden="true" /></a>
        </div>
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

    <Card className="bg-muted/20">
      <CardHeader className="pb-3"><CardTitle className="text-base">Not available from this audit</CardTitle></CardHeader>
      <CardContent className="text-sm text-muted-foreground space-y-2">
        <p>Average live viewers, historical growth, streaming frequency, and engagement are unavailable from these snapshots.</p>
        <p>No estimates, growth scores, or promotion claims are generated. A missing metric stays unavailable.</p>
      </CardContent>
    </Card>
  </div>;
}
