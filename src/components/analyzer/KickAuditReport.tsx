import { AlertTriangle, ExternalLink, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChannelGrowthRoadmap } from "./ChannelGrowthRoadmap";
import { buildKickRoadmap } from "@/lib/kickRoadmap";
import type { KickAudit } from "@/lib/kickAudit";
import { formatAuditDate } from "@/lib/channelAudit";

export function KickAuditReport({ audit, readOnly = false }: { audit: KickAudit; readOnly?: boolean }) {
  const profileUrl = "https://kick.com/" + audit.profile.slug;
  const checks = [
    { label: "Channel description", value: audit.profile.description, fix: "Write a concise content promise and reason to return." },
    { label: "Stream title", value: audit.channel.title, fix: "Lead with what viewers will see, not only a follow request." },
    { label: "Category", value: audit.channel.category, fix: "Choose the category that accurately fits the broadcast." },
  ];
  const gaps = checks.filter((item) => item.value !== null && !item.value.trim());
  const available = checks.filter((item) => item.value !== null).length;
  return <div className="space-y-4">
    <Card className={gaps.length ? "border-rose-500/50 bg-rose-500/5" : "border-orange-500/40"}>
      <CardHeader className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-orange-500">Kick public-channel audit</p>
        <CardTitle className="text-2xl">{gaps.length ? "Channel presentation needs attention" : "Review the audience path with the creator"}</CardTitle>
        <p className="text-sm text-muted-foreground">Verified Kick profile details plus an action plan. This snapshot cannot identify a hidden backend error or explain why a viewer left.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-background/60 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold">{audit.profile.displayName}</h2>
            <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-orange-500 hover:underline">@{audit.profile.slug}<ExternalLink className="h-3 w-3" /></a>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-xs">{audit.stream.isLive === null ? "Live status unavailable" : audit.stream.isLive ? "Live at retrieval" : "Offline at retrieval"}</span>
        </div>
        <div className="rounded-xl border border-border bg-background/60 p-4">
          <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="h-4 w-4 text-orange-500" />Public presentation checks: {checks.filter((item) => item.value?.trim()).length}/{available} available fields filled</p>
          <p className="mt-2 text-xs text-muted-foreground">This is a visible-field checklist, not an overall health score or a measurement of growth. Missing fields are not scored as zero.</p>
        </div>
        {gaps.length > 0 && <div className="space-y-2">
          <p className="flex items-center gap-2 font-bold text-rose-500"><AlertTriangle className="h-5 w-5" />Priority fixes to test</p>
          {gaps.map((item) => <div key={item.label} className="rounded-lg border border-rose-500/40 bg-rose-500/10 p-3">
            <p className="font-semibold">{item.label} is empty in the public snapshot</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.fix}</p>
          </div>)}
        </div>}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">Live viewers at retrieval</p><p className="mt-1 font-bold">{audit.stream.isLive ? audit.stream.viewers?.toLocaleString() ?? "Unavailable" : audit.stream.isLive === false ? "Not live" : "Unavailable"}</p></div>
          <div className="rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">Follower total</p><p className="mt-1 font-bold">Not publicly available</p></div>
          <div className="rounded-lg bg-muted/35 p-3"><p className="text-xs text-muted-foreground">Average viewers and replay views</p><p className="mt-1 font-bold">Not publicly available</p></div>
        </div>
        <p className="text-sm text-muted-foreground">A live viewer count is a momentary snapshot, not an average. The creator's own analytics are needed to diagnose reach, retention, follows, and subscription progress.</p>
        <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-orange-500 hover:underline">Source: Kick channel<ExternalLink className="h-3 w-3" /></a>
        <p className="text-xs text-muted-foreground">Retrieved {formatAuditDate(audit.fetchedAt)} via Kick Developer Public API. This report is independent and is not an official Kick notice.</p>
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle className="text-lg">What viewers see · What to fix</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {checks.map((item) => <div key={item.label} className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">{item.label}</p>
          <p className="mt-1 break-words text-sm font-medium">{item.value === null ? "Unavailable" : item.value || "Empty"}</p>
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
