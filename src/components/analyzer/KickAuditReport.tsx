import { ExternalLink, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelGrowthRoadmap } from "./ChannelGrowthRoadmap";
import { KickScoreSummary } from "./KickScoreSummary";
import { buildKickRoadmap } from "@/lib/kickRoadmap";
import type { KickAudit } from "@/lib/kickAudit";
import { formatAuditDate } from "@/lib/channelAudit";

export function KickAuditReport({ audit, readOnly = false }: { audit: KickAudit; readOnly?: boolean }) {
  const profileUrl = "https://kick.com/" + audit.profile.slug;
  const checks = [
    { label: "Channel description", value: audit.profile.description, fix: "Check the About tab before suggesting a change." },
    { label: "Stream title", value: audit.channel.title, fix: "Review whether the title explains the broadcast and invites relevant viewers." },
    { label: "Category", value: audit.channel.category, fix: "Check that the selected category matches the live content." },
  ];
  const returned = checks.filter((item) => Boolean(item.value?.trim())).length;
  return <div className="space-y-4">
    <KickScoreSummary audit={audit} />
    <Card className="border-orange-500/40">
      <CardHeader className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-orange-500">Kick public-channel audit</p>
        <CardTitle className="text-2xl">Verified channel profile</CardTitle>
        <p className="text-sm text-muted-foreground">Verified Kick profile details plus an action plan. This snapshot cannot identify a hidden backend error or explain why a viewer left.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {audit.channel.bannerUrl && <img src={audit.channel.bannerUrl} alt={audit.profile.displayName + " channel banner"} loading="lazy" className="max-h-40 w-full rounded-xl border border-border object-cover" />}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/60 p-4">
          {audit.profile.profileImageUrl && <img src={audit.profile.profileImageUrl} alt={audit.profile.displayName + " profile picture"} loading="lazy" className="h-14 w-14 rounded-full border border-border object-cover" />}
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{audit.profile.displayName}</h2>
            <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-orange-500 hover:underline">@{audit.profile.slug}<ExternalLink className="h-3 w-3" /></a>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs">{audit.stream.isLive === null ? "Live status unavailable" : audit.stream.isLive ? "Live at retrieval" : "Offline at retrieval"}</span>
        </div>
        <div className="rounded-xl border border-border bg-background/60 p-4">
          <h3 className="text-sm font-bold">About this channel</h3>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm">{audit.profile.description || "Kick's Developer API did not return the About text. This does not mean the channel has no bio."}</p>
          <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-orange-500 hover:underline">View the public About tab on Kick<ExternalLink className="h-3 w-3" /></a>
        </div>
        <div className="rounded-xl border border-border bg-background/60 p-4">
          <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-orange-500" />Presentation fields returned by Kick API: {returned}/{checks.length}</p>
          <p className="mt-2 text-xs text-muted-foreground">This measures API data completeness, not channel health. A field Kick did not return is not proof the channel is missing it.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">Live viewers (snapshot)</p><p className="mt-1 font-bold">{audit.stream.isLive ? audit.stream.viewers?.toLocaleString() ?? "Unavailable" : audit.stream.isLive === false ? "Not live" : "Unavailable"}</p><p className="mt-1 text-xs text-muted-foreground">Captured {formatAuditDate(audit.fetchedAt)}</p></div>
          <div className="rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">Follower total</p><p className="mt-1 font-bold">Shown on Kick, not supplied by its Developer API</p><a href={profileUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-orange-500 hover:underline">Check the channel's current followers<ExternalLink className="h-3 w-3" /></a></div>
          <div className="rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">Average viewers and VOD views</p><p className="mt-1 font-bold">Not supplied by this API</p><a href={profileUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-orange-500 hover:underline">View the channel's Videos tab<ExternalLink className="h-3 w-3" /></a></div>
        </div>
        <p className="text-sm text-muted-foreground">A live viewer count is a momentary snapshot, not an average. The creator's own analytics are needed to diagnose reach, retention, follows, and subscription progress.</p>
        <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-orange-500 hover:underline">Source: Kick channel<ExternalLink className="h-3 w-3" /></a>
        <p className="text-xs text-muted-foreground">Retrieved {formatAuditDate(audit.fetchedAt)} via Kick Developer Public API. This report is independent and is not an official Kick notice.</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-lg">Live broadcast at retrieval</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {audit.stream.isLive ? <>
          {audit.stream.thumbnailUrl && <img src={audit.stream.thumbnailUrl} alt={audit.profile.displayName + " live-stream thumbnail"} loading="lazy" className="max-h-72 w-full rounded-xl border border-border object-cover" />}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">Stream title</p><p className="mt-1 break-words text-sm font-semibold">{audit.channel.title || "Not returned by Kick API"}</p></div>
            <div className="rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">Category</p><p className="mt-1 text-sm font-semibold">{audit.channel.category || "Not returned by Kick API"}</p></div>
            <div className="rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">Language</p><p className="mt-1 text-sm font-semibold">{audit.stream.language || "Not returned by Kick API"}</p></div>
            <div className="rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">Started</p><p className="mt-1 text-sm font-semibold">{audit.stream.startedAt ? formatAuditDate(audit.stream.startedAt) : "Not returned by Kick API"}</p></div>
          </div>
          {audit.stream.tags && audit.stream.tags.length > 0 && <p className="text-xs text-muted-foreground">Tags: {audit.stream.tags.join(", ")}</p>}
          <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-orange-500 hover:underline">Watch this channel on Kick<ExternalLink className="h-3 w-3" /></a>
        </> : <p className="text-sm text-muted-foreground">{audit.stream.isLive === false ? "The channel was offline at retrieval. A previous broadcast cannot be inferred from an offline snapshot." : "Kick did not return a live-status result."}</p>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-lg">Recent videos and replays</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">Kick's documented Developer API does not provide this channel's archived-video list or VOD view counts. This report will not call missing API data zero views or claim there are no videos.</p>
        <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-orange-500 hover:underline">Open the Videos tab on the Kick channel<ExternalLink className="h-3 w-3" /></a>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-lg">What Kick returned - What to verify</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {checks.map((item) => <div key={item.label} className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className="mt-1 break-words text-sm font-medium">{item.value?.trim() || "Not returned by Kick API; check the channel page"}</p>
          <p className="mt-1 text-sm text-muted-foreground">{item.fix}</p>
        </div>)}
        {audit.ai.status === "available" && audit.ai.findings.length > 0 && <>
          <h3 className="pt-2 font-bold">AI-assisted channel review</h3>
          <p className="text-xs text-muted-foreground">Each suggestion is a hypothesis based on a public fact, not a measured cause of lost viewers.</p>
          {audit.ai.findings.map((finding) => <div key={finding.evidenceId} className="rounded-lg border border-orange-500/30 p-3">
            <p className="font-semibold">{finding.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">Evidence: {finding.evidence}</p>
            <p className="mt-2 text-sm">Possible impact: {finding.possibleImpact}</p>
            <p className="mt-1 text-sm">Fix: {finding.fix}</p>
            <p className="mt-1 text-sm">Test: {finding.test}</p>
          </div>)}
        </>}
        {audit.ai.status === "unavailable" && <p className="text-xs text-muted-foreground">AI review unavailable: {audit.ai.reason}</p>}
      </CardContent>
    </Card>
    <ChannelGrowthRoadmap providedRoadmap={buildKickRoadmap(audit)} platform="kick" />
    {readOnly && <p className="text-xs text-muted-foreground">Want help prioritizing these tests? Ask for a review of your own channel analytics before paying for promotion.</p>}
  </div>;
}
