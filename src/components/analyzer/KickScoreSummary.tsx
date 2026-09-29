import { AlertTriangle, ExternalLink, ShieldCheck, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatAuditDate } from "@/lib/channelAudit";
import type { KickAudit } from "@/lib/kickAudit";
import { buildKickInsights } from "@/lib/kickInsights";
import { presentationScoreBand } from "@/lib/auditInsights";

export function KickScoreSummary({ audit }: { audit: KickAudit }) {
  const { value, covered, criteria, findings } = buildKickInsights(audit);
  const band = presentationScoreBand(value);
  const criticalCount = findings.filter((finding) => finding.severity === "critical").length;
  const critical = criticalCount > 0;
  const lowLive = findings.some((finding) => finding.id === "live-snapshot");
  const urgent = critical || band === "danger";
  const headline = critical
    ? "Critical channel presentation issue to fix"
    : band === "danger"
      ? "Priority: review live reach and viewer-facing setup"
      : lowLive
        ? "Live reach needs a closer look"
        : value === null
          ? "Live opportunity score needs more data"
          : findings.length
            ? "Channel opportunities to test"
            : "Public setup reviewed; measure the audience next";

  return <Card className={"overflow-hidden border bg-gradient-to-br via-card to-card " + (urgent ? "border-rose-500/50 from-rose-500/15" : "border-amber-500/30 from-amber-500/10")}>
    <CardContent className="space-y-5 p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className={"text-xs font-bold uppercase tracking-[0.16em] " + (urgent ? "text-rose-500" : "text-amber-500")}>{critical ? criticalCount + " critical public issue detected" : "Kick public-channel opportunities"}</p>
          <h2 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">{headline}</h2>
          <p className="mt-3 text-sm text-muted-foreground">
            {critical
              ? "Kick returned a title that asks for engagement before explaining the stream. Fix that first, then test whether the next broadcasts perform differently."
              : lowLive
                ? "Kick returned a small live-viewer snapshot. Investigate the audience path with the creator; one count cannot identify a hidden channel problem."
                : value === null
                  ? "Kick did not return enough live public signals for a fair score. Verified presentation details and useful next steps are still shown below."
                  : "Use these public signals to choose a first test, then measure the result with the creator's own analytics."}
          </p>
        </div>
        <Badge variant="outline" className={urgent ? "border-rose-500/60 text-rose-500" : "border-amber-500/50 text-amber-500"}>
          <ShieldCheck className="mr-1 h-3 w-3" />
          {critical ? criticalCount + " critical issue to test" : band === "danger" ? "Priority: needs work" : value === null ? "Score unavailable" : findings.length + " to test"}
        </Badge>
      </div>

      <div className={"rounded-xl border bg-background/80 p-4 sm:p-5 " + (band === "danger" ? "border-rose-500/70" : "border-border/70")}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Public opportunity score</p>
            <p className={"mt-1 text-3xl font-extrabold " + (band === "danger" ? "text-rose-500" : band === "review" ? "text-amber-500" : band === "strong" ? "text-emerald-500" : "text-foreground")}>
              {value === null ? "Not enough live data" : value + "/100"}
            </p>
          </div>
          <Badge variant="outline" className={band === "danger" ? "border-rose-500/70 text-rose-500" : band === "review" ? "border-amber-500/60 text-amber-500" : "border-border"}>
            {band === "danger" ? "Priority: needs work" : band === "review" ? "Opportunities to test" : band === "strong" ? "Stronger public signals" : "Unscored"}
          </Badge>
        </div>
        {value !== null && <div role="meter" aria-label="Kick public opportunity score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
          <div className={"h-full rounded-full " + (band === "danger" ? "bg-rose-500" : band === "review" ? "bg-amber-500" : "bg-emerald-500")} style={{ width: value + "%" }} />
        </div>}
        <p className="mt-3 text-sm text-muted-foreground">
          {audit.stream.isLive && audit.stream.viewers !== null
            ? "Kick showed " + audit.stream.viewers.toLocaleString() + " live viewers at " + formatAuditDate(audit.fetchedAt) + ". That is one moment, not an average or proof of lost viewers."
            : "No live-viewer count was available. Offline time is never treated as zero viewers."}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">This is an editorial snapshot score, not a Kick health score, search ranking, follower-quality test, or explanation of why viewers leave. Red is below 50; amber is 50-79; green is 80-100. Missing API fields are excluded, not scored as zero.</p>
        <details className="mt-4 border-t border-border/70 pt-3">
          <summary className="cursor-pointer text-sm font-semibold">How this score is calculated</summary>
          <p className="mt-2 text-xs text-muted-foreground">A score requires both a live-viewer snapshot and a returned stream title. {covered} of 100 possible points had data; unavailable criteria are excluded from the calculation.</p>
          <ul className="mt-3 space-y-3">{criteria.map((criterion) => <li key={criterion.label} className="rounded-lg border border-border/70 p-3">
            <div className="flex justify-between gap-3 text-sm font-semibold"><span>{criterion.label}</span><span className="shrink-0">{criterion.earned === null ? "Unavailable" : criterion.earned + "/" + criterion.possible}</span></div>
            <p className="mt-1 text-xs text-muted-foreground">{criterion.basis}</p>
          </li>)}</ul>
        </details>
      </div>

      {findings.length > 0 ? <div>
        <h3 className="mb-3 text-lg font-bold">What needs attention - and what to do</h3>
        <ol className="grid gap-3">{findings.map((finding, index) => <li key={finding.id} className={"rounded-xl border p-4 sm:p-5 " + (finding.severity === "critical" || (finding.id === "live-snapshot" && band === "danger") ? "border-rose-500/55 bg-rose-500/10" : "border-amber-500/35 bg-amber-500/5")}>
          <p className={"flex items-center gap-2 text-xs font-bold uppercase tracking-wide " + (finding.severity === "critical" || (finding.id === "live-snapshot" && band === "danger") ? "text-rose-500" : "text-amber-500")}>
            {finding.severity === "critical" ? <AlertTriangle className="h-4 w-4" /> : <Target className="h-4 w-4" />}
            {finding.severity === "critical" ? "Critical presentation issue" : finding.id === "live-snapshot" ? "Public live-viewer signal" : "Opportunity to test"} - {index + 1}
          </p>
          <h4 className="mt-2 text-lg font-bold">{finding.title}</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg bg-background/70 p-3"><p className="text-xs font-bold uppercase text-muted-foreground">Evidence</p><p className="mt-1 text-sm">{finding.evidence}</p></div>
            <div className="rounded-lg bg-background/70 p-3"><p className="text-xs font-bold uppercase text-muted-foreground">Why it matters</p><p className="mt-1 text-sm">{finding.whyItMatters}</p></div>
          </div>
          <p className="mt-3 rounded-lg border border-border/70 p-3 text-sm"><span className="font-bold">Fix to test:</span> {finding.fix}</p>
          <a href={"https://kick.com/" + audit.profile.slug} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-4">Source: Kick channel<ExternalLink className="h-3 w-3" /></a>
        </li>)}</ol>
      </div> : <p className="text-sm text-muted-foreground">No specific public issue was confirmed by these limited signals. The creator's own analytics can show what to investigate next.</p>}
    </CardContent>
  </Card>;
}
