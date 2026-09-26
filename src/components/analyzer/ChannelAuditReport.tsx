import { ExternalLink, Radio, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatAuditDate, type ChannelAudit } from "@/lib/channelAudit";

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

export function ChannelAuditReport({ audit, readOnly = false }: { audit: ChannelAudit; readOnly?: boolean }) {
  const { profile, stream, followers, channel, videos } = audit;
  const live = stream.data;
  const partial = [stream, followers, channel, videos].some((part) => part.status === "unavailable");
  const broadcaster = profile.broadcasterType === "" ? "Neither Affiliate nor Partner" : profile.broadcasterType === null ? "Unavailable" : profile.broadcasterType === "partner" ? "Partner" : "Affiliate";

  return <div className="space-y-4 animate-slide-in" aria-label={`Audit for ${profile.displayName}`}>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-primary" />{audit.source}</span>
      <span>Retrieved {formatAuditDate(audit.fetchedAt)}</span>
    </div>
    {partial && <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">Partial report: some Twitch data could not be retrieved. Available facts are shown below.{!readOnly && " Run the audit again to retry."}</p>}

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
