import { useState } from "react";
import { ChevronDown, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChannelAudit } from "@/lib/channelAudit";
import { buildAuditRoadmap } from "@/lib/auditRoadmap";

export function ChannelGrowthRoadmap({ audit }: { audit: ChannelAudit }) {
  const roadmap = buildAuditRoadmap(audit);
  const [openSteps, setOpenSteps] = useState<number[]>([]);
  const allOpen = openSteps.length === roadmap.steps.length;

  const toggleStep = (number: number) => {
    setOpenSteps((current) => current.includes(number)
      ? current.filter((item) => item !== number)
      : [...current, number]);
  };

  return <Card className="border-orange-500/40 bg-gradient-to-br from-orange-500/5 via-card to-card" aria-label="Streamer channel growth roadmap">
    <CardHeader className="space-y-3">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-orange-500">Your channel growth plan</p>
      <CardTitle className="text-2xl">Streamer channel growth roadmap</CardTitle>
      <p className="text-sm text-muted-foreground">Ten connected steps, from getting the channel ready to measuring what works. Open each step to see the work and the outcome it is designed to support.</p>
      <p className="rounded-lg border border-border/70 bg-background/60 p-3 text-sm">{roadmap.stageMessage}</p>
    </CardHeader>
    <CardContent className="space-y-5">
      <div className="rounded-xl border border-orange-500/50 bg-orange-500/10 p-4">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-orange-500"><Target className="h-4 w-4" aria-hidden="true" /> Recommended place to start</p>
        <h3 className="mt-2 text-lg font-bold">Step {roadmap.recommendedStart}: {roadmap.steps[roadmap.recommendedStart - 1].title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{roadmap.recommendedReason}</p>
        <button type="button" className="mt-3 rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500" onClick={() => setOpenSteps([roadmap.recommendedStart])}>Read this step first</button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">Follow the full path, or open the step you need now.</p>
        <button type="button" className="rounded-md border border-orange-500/50 px-4 py-2 text-sm font-semibold text-orange-500 hover:bg-orange-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500" onClick={() => setOpenSteps(allOpen ? [] : roadmap.steps.map((step) => step.number))}>{allOpen ? "Collapse all steps" : "Show all 10 steps"}</button>
      </div>
      <ol className="space-y-2">
        {roadmap.steps.map((step) => {
          const open = openSteps.includes(step.number);
          return <li key={step.number} className={"overflow-hidden rounded-xl border " + (step.number === roadmap.recommendedStart ? "border-orange-500/50 bg-orange-500/5" : "border-border/70 bg-background/60")}>
            <button type="button" className="flex w-full items-center gap-3 p-4 text-left hover:bg-muted/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500" aria-expanded={open} aria-controls={"roadmap-step-" + step.number} onClick={() => toggleStep(step.number)}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-sm font-bold text-orange-500">{step.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold sm:text-base">{step.title}</span>
                <span className="block text-xs text-muted-foreground">{step.number === roadmap.recommendedStart ? "Recommended first for this channel" : "Tap to see the action and outcome"}</span>
              </span>
              <ChevronDown className={"h-5 w-5 shrink-0 transition-transform " + (open ? "rotate-180" : "")} aria-hidden="true" />
            </button>
            {open && <div id={"roadmap-step-" + step.number} className="space-y-4 border-t border-border/70 p-4">
              <p className="text-base font-semibold leading-relaxed">{step.hook}</p>
              <p className="rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 text-sm"><span className="font-bold">For this channel:</span> {step.channelNote}</p>
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  ["What needs to be done", step.needsDoing],
                  ["What we do for you", step.whatWeDo],
                  ["Why this matters", step.whyItMatters],
                  ["Growth outcome this supports", step.outcome],
                ].map(([label, value]) => <div key={label} className="rounded-lg bg-muted/35 p-3"><dt className="text-xs font-bold uppercase tracking-wide text-orange-500">{label}</dt><dd className="mt-1 text-sm leading-relaxed">{value}</dd></div>)}
              </dl>
            </div>}
          </li>;
        })}
      </ol>
      <p className="text-xs text-muted-foreground">These steps are a plan to test, not a promise of viewers, followers, Affiliate or Partner approval, subscribers, or earnings. Private analytics and the creator's participation are needed to measure results.</p>
    </CardContent>
  </Card>;
}
