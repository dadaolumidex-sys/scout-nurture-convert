import { useRef, useState, type FormEvent } from "react";
import { ClipboardCheck, Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ChannelAuditReport } from "@/components/analyzer/ChannelAuditReport";
import { KickAuditReport } from "@/components/analyzer/KickAuditReport";
import { KickAuditShareControls } from "@/components/analyzer/KickAuditShareControls";
import { AuditShareControls } from "@/components/analyzer/AuditShareControls";
import { callEdgeFunction } from "@/lib/edgeFunction";
import { parseTwitchChannel, readChannelAudit, type ChannelAudit } from "@/lib/channelAudit";
import { parseKickChannel, readKickAudit, type KickAudit } from "@/lib/kickAudit";

const AnalyzerPage = () => {
  const [input, setInput] = useState("");
  const [platform, setPlatform] = useState<"twitch" | "kick">("twitch");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChannelAudit | KickAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const handleAudit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    setResult(null);
    setError(null);
    const username = platform === "twitch" ? parseTwitchChannel(input) : parseKickChannel(input);
    if (!username) {
      setError(platform === "twitch"
        ? "Enter a Twitch username or a Twitch channel URL. Links to other platforms, videos, and directories are not supported."
        : "Enter a Kick username or a kick.com channel URL. Links to other platforms, videos, and directories are not supported.");
      return;
    }
    inFlight.current = true;
    setLoading(true);
    try {
      const data = await callEdgeFunction<unknown>(platform === "twitch" ? "analyze-twitch" : "analyze-kick", { username, includeAi: true }, 65_000);
      setResult(platform === "twitch" ? readChannelAudit(data, username) : readKickAudit(data, username));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not complete the channel audit. Please try again.";
      setError(message === "The AI request took too long. Please try again." ? "The channel audit took too long. Please try again." : message);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 animate-slide-in">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary"><ShieldCheck className="h-4 w-4" />Twitch + Kick</div>
          <h1 className="text-xl sm:text-2xl font-bold text-foreground">Channel Audit</h1>
          <p className="text-sm text-muted-foreground mt-1">Verify a real Twitch or Kick channel, then get AI-assisted fixes based on its public details. Suggestions are tests, not measured causes of lost viewers.</p>
        </div>

        <Card>
          <CardContent className="p-4 sm:p-5">
            <form onSubmit={handleAudit} className="space-y-2">
              <div className="flex items-center gap-3">
                <label htmlFor="audit-platform" className="text-sm font-medium">Platform</label>
                <select id="audit-platform" value={platform} disabled={loading} onChange={(event) => { setPlatform(event.target.value as "twitch" | "kick"); setResult(null); setError(null); }} className="rounded-md border border-border bg-background px-3 py-2 text-sm">
                  <option value="twitch">Twitch</option>
                  <option value="kick">Kick</option>
                </select>
              </div>
              <label htmlFor="twitch-channel" className="text-sm font-medium">{platform === "twitch" ? "Twitch" : "Kick"} channel</label>
              <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                <Input id="twitch-channel" placeholder={platform === "twitch" ? "https://www.twitch.tv/username or username" : "https://kick.com/username or username"} value={input}
                  onChange={(event) => { setInput(event.target.value); if (/^https:\/\/(?:www\.)?kick\.com\//i.test(event.target.value)) setPlatform("kick"); else if (/^https:\/\/(?:www\.)?twitch\.tv\//i.test(event.target.value)) setPlatform("twitch"); setError(null); setResult(null); }}
                  disabled={loading} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                  aria-describedby={error ? "audit-help audit-error" : "audit-help"} aria-invalid={!!error}
                  className="bg-muted border-border" />
                <Button type="submit" disabled={loading || !input.trim()} className="gradient-primary text-primary-foreground font-semibold hover:opacity-90 w-full sm:w-auto sm:min-w-[140px]">
                  {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Auditing...</> : <><ClipboardCheck className="mr-2 h-4 w-4" />Run audit</>}
                </Button>
              </div>
              <p id="audit-help" className="text-xs text-muted-foreground">Each audit fetches a fresh snapshot. Missing data is labeled unavailable.</p>
              {platform === "kick" && <p className="text-xs text-muted-foreground">Kick audits need a one-time developer app connection. Save its Client ID and Client Secret as Supabase Edge Function secrets; never put the secret in this form.</p>}
            </form>
          </CardContent>
        </Card>

        {error && <div id="audit-error" role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground">{error}</div>}
        {loading && <div role="status" className="flex items-center gap-2 rounded-lg border border-border p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Verifying {platform === "twitch" ? "Twitch" : "Kick"} details and preparing tailored fixes...</div>}
        {result?.platform === "twitch" && <><AuditShareControls key={result.profile.login} audit={result} onShared={setResult} /><ChannelAuditReport audit={result} /></>}
        {result?.platform === "kick" && <><KickAuditShareControls key={result.profile.slug} audit={result} onShared={setResult} /><KickAuditReport audit={result} /></>}
        {!loading && !result && !error && <Card className="border-dashed bg-muted/10">
          <CardContent className="p-6 sm:p-8">
            <ClipboardCheck className="mb-3 h-7 w-7 text-primary" />
            <h2 className="font-semibold">A verified channel with a tailored action plan</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">Twitch or Kick supplies the real channel details. AI reviews that public snapshot for presentation gaps and specific fixes to test.</p>
            <p className="mt-3 text-xs text-muted-foreground">Public data cannot reveal why an individual viewer left; private Creator Dashboard analytics are needed to measure results.</p>
          </CardContent>
        </Card>}
      </div>
    </DashboardLayout>
  );
};

export default AnalyzerPage;
