import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { ChannelAuditReport } from "@/components/analyzer/ChannelAuditReport";
import { readAuditShare } from "@/lib/readAuditShare";
import { formatAuditDate } from "@/lib/channelAudit";

// Intentionally no DashboardLayout, auth hook, Inbox, or AI context.
export default function SharedAuditPage() {
  const { hash } = useLocation();
  const [result, setResult] = useState<Awaited<ReturnType<typeof readAuditShare>> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots"; robots.content = "noindex, nofollow, noarchive";
    const referrer = document.createElement("meta");
    referrer.name = "referrer"; referrer.content = "no-referrer";
    document.head.append(robots, referrer);
    return () => { robots.remove(); referrer.remove(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = window.setTimeout(() => controller.abort(), 20_000);
    setResult(null); setError(""); setLoading(true);
    void readAuditShare(hash.slice(1), controller.signal).then((data) => {
      if (active) setResult(data);
    }).catch((err) => {
      if (active) setError(controller.signal.aborted ? "The report took too long to load. Please refresh to retry." : err instanceof Error ? err.message : "Report unavailable.");
    }).finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [hash]);

  return <main className="mx-auto max-w-4xl space-y-4 p-4 sm:p-6">
    <header className="space-y-2">
      <p className="text-sm text-muted-foreground">StreamScout · Public Twitch report</p>
      <h1 className="text-2xl font-bold">Channel Audit</h1>
      <p className="text-sm text-muted-foreground">This is a saved snapshot, not a live dashboard. Facts and live status reflect the retrieval time shown below.</p>
    </header>
    {loading && <p role="status">Loading shared report...</p>}
    {error && <p role="alert" className="rounded-lg border border-border p-4">{error}</p>}
    {result && <><p className="text-xs text-muted-foreground">Link expires {formatAuditDate(result.expiresAt)}.</p><ChannelAuditReport audit={result.report} readOnly /></>}
  </main>;
}
