import { useRef, useState, type FormEvent } from "react";
import { ClipboardCheck, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ChannelAuditReport } from "@/components/analyzer/ChannelAuditReport";
import { AuditShareControls } from "@/components/analyzer/AuditShareControls";
import { callEdgeFunction } from "@/lib/edgeFunction";
import { parseTwitchChannel, readChannelAudit, type ChannelAudit } from "@/lib/channelAudit";

const AnalyzerPage = () => {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChannelAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const handleAudit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    setResult(null);
    setError(null);
    const username = parseTwitchChannel(input);
    if (!username) {
      setError("Enter a Twitch username or a Twitch channel URL. Links to other platforms, videos, and directories are not supported.");
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      const data = await callEdgeFunction<unknown>("analyze-twitch", { username });
      setResult(readChannelAudit(data, username));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not complete the Twitch audit. Please try again.";
      setError(message === "The AI request took too long. Please try again." ? "The Twitch audit took too long. Please try again." : message);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 animate-slide-in">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary"><ShieldCheck className="h-4 w-4" />Twitch only</div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Channel Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">Check a channel using facts returned by Twitch. No estimates or AI-generated metrics.</p>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={handleAudit} className="space-y-2">
              <label htmlFor="twitch-channel" className="text-sm font-medium">Twitch channel</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <Input id="twitch-channel" placeholder="https://www.twitch.tv/username or username" value={input}
                  onChange={(event) => { setInput(event.target.value); setError(null); setResult(null); }}
                  disabled={loading} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  aria-describedby={error ? "audit-help audit-error" : "audit-help"} aria-invalid={!!error}
                  className="bg-muted border-border" />
                <Button type="submit" disabled={loading || !input.trim()} className="gradient-primary text-primary-foreground font-semibold hover:opacity-90 w-full sm:w-auto sm:min-w-[140px]">
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Auditing...</> : <><ClipboardCheck className="mr-2 h-4 w-4" />Run audit</>}
                </Button>
              </div>
              <p id="audit-help" className="text-xs text-muted-foreground">Each audit fetches a fresh snapshot. Missing data is labeled unavailable.</p>
            </form>
          </CardContent>
        </Card>

        {error && <div id="audit-error" role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">{error}</div>}
        {loading && <div role="status" className="flex items-center gap-2 rounded-lg border border-border p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Fetching channel facts from Twitch...</div>}
        {result && <><AuditShareControls key={result.profile.login} audit={result} onShared={setResult} /><ChannelAuditReport audit={result} /></>}
        {!loading && !result && !error && <Card className="border-dashed bg-muted/10">
          <CardContent className="p-6 sm:p-8">
            <ClipboardCheck className="mb-3 h-7 w-7 text-primary" />
            <h2 className="font-semibold">A factual channel snapshot</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">View the channel profile, follower total when available, current live status, and recent archived broadcasts. Every section includes its Twitch source.</p>
            <p className="mt-3 text-xs text-muted-foreground">Average viewers, growth, and streaming frequency are not inferred from VOD views.</p>
          </CardContent>
        </Card>}
      </div>
    </DashboardLayout>
  );
};

export default AnalyzerPage;
