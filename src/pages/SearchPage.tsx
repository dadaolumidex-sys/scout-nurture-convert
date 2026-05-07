import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, Search, Loader2, ExternalLink, Sparkles, MapPin, Mail, Youtube, Music2, Instagram, Twitter, MessageSquare, ShoppingBag, Camera, Tv, Network, FileText, Lightbulb } from "lucide-react";
import { toast } from "sonner";
import { recordFailure, recordSuccess } from "@/lib/apiKeys";
import { notify } from "@/lib/notifications";
import { supabase } from "@/integrations/supabase/client";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-search`;

type Mode =
  | "search" | "scrape" | "crawl" | "screenshot"
  | "google_maps" | "emails"
  | "youtube" | "tiktok" | "instagram" | "twitter" | "reddit" | "twitch"
  | "amazon";

interface ModeConfig {
  id: Mode;
  label: string;
  icon: any;
  group: "Web" | "Social" | "Leads" | "Commerce";
  needs: "query" | "url";
  placeholder: string;
  desc: string;
}

const MODES: ModeConfig[] = [
  { id: "search", label: "Google Search", icon: Search, group: "Web", needs: "query", placeholder: "e.g. 'top kick streamers 2025'", desc: "Full Google SERP results." },
  { id: "scrape", label: "Scrape Page", icon: FileText, group: "Web", needs: "url", placeholder: "https://example.com", desc: "Extract clean content from one page." },
  { id: "crawl", label: "Crawl Site", icon: Network, group: "Web", needs: "url", placeholder: "https://example.com", desc: "Crawl multiple pages of a website." },
  { id: "screenshot", label: "Screenshot", icon: Camera, group: "Web", needs: "url", placeholder: "https://example.com", desc: "Capture a full-page screenshot." },

  { id: "youtube", label: "YouTube", icon: Youtube, group: "Social", needs: "query", placeholder: "e.g. 'fortnite highlights'", desc: "Find channels & videos." },
  { id: "tiktok", label: "TikTok", icon: Music2, group: "Social", needs: "query", placeholder: "e.g. 'gaming setup tour'", desc: "Search videos & creators." },
  { id: "instagram", label: "Instagram", icon: Instagram, group: "Social", needs: "query", placeholder: "hashtag, e.g. 'gamer'", desc: "Search hashtags & posts." },
  { id: "twitter", label: "Twitter/X", icon: Twitter, group: "Social", needs: "query", placeholder: "e.g. 'twitch sponsorships'", desc: "Latest tweets matching query." },
  { id: "reddit", label: "Reddit", icon: MessageSquare, group: "Social", needs: "query", placeholder: "e.g. 'streamer marketing'", desc: "Search posts across Reddit." },
  { id: "twitch", label: "Twitch Channel", icon: Tv, group: "Social", needs: "url", placeholder: "https://twitch.tv/username", desc: "Pull a Twitch channel's data." },

  { id: "google_maps", label: "Google Maps", icon: MapPin, group: "Leads", needs: "query", placeholder: "e.g. 'gaming cafes Lagos'", desc: "Find local businesses + contact info." },
  { id: "emails", label: "Email Finder", icon: Mail, group: "Leads", needs: "url", placeholder: "https://creatorsite.com", desc: "Extract emails & contacts from a site." },

  { id: "amazon", label: "Amazon", icon: ShoppingBag, group: "Commerce", needs: "query", placeholder: "e.g. 'gaming chair'", desc: "Search products with prices & reviews." },
];

const GROUPS: Array<"Web" | "Social" | "Leads" | "Commerce"> = ["Web", "Social", "Leads", "Commerce"];

const SearchPage = () => {
  const [mode, setMode] = useState<Mode>("search");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const cfg = MODES.find(m => m.id === mode)!;

  const run = async () => {
    if (!input.trim()) { toast.error(`Enter a ${cfg.needs === "url" ? "URL" : "query"}`); return; }
    setLoading(true);
    setResults([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Sign in first, then add your Apify key.");
        window.location.href = "/auth";
        return;
      }
      const body: any = { mode };
      if (cfg.needs === "url") body.url = input.trim(); else body.query = input.trim();

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (Array.isArray(json.failedKeyIds)) {
        for (const id of json.failedKeyIds) await recordFailure(id, json.error || "failed").catch(() => {});
        if (json.failedKeyIds.length) await notify("warning", "Apify key issue", `${json.failedKeyIds.length} key(s) failed and were rotated.`).catch(() => {});
      }
      if (json.usedKeyId) await recordSuccess(json.usedKeyId).catch(() => {});
      if (!res.ok) throw new Error(json.error || "Request failed");

      let items: any[] = [];
      if (mode === "search") {
        const first = json.results?.[0];
        items = first?.organicResults || first?.results || json.results || [];
      } else {
        items = Array.isArray(json.results) ? json.results : [json.results];
      }
      setResults(items);
      if (items.length === 0) toast.message("No results returned");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-4 animate-slide-in">
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" /> Deep Web Search
          </h1>
          <p className="text-sm text-muted-foreground">Powered by your Apify key — search Google, social platforms, maps, emails, and more.</p>
        </div>

        {GROUPS.map(group => (
          <div key={group} className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-1">{group}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {MODES.filter(m => m.group === group).map(m => {
                const Icon = m.icon;
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => { setMode(m.id); setResults([]); setInput(""); }}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-primary bg-primary/10 glow-primary"
                        : "border-border bg-card hover:border-primary/50"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-muted-foreground"}`} />
                    <span className={`text-xs font-semibold ${active ? "text-primary" : "text-foreground"}`}>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <p className="text-xs text-muted-foreground flex items-start gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <span><b className="text-foreground">{cfg.label}:</b> {cfg.desc}</span>
            </p>
            <Input
              placeholder={cfg.placeholder}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="bg-muted border-border text-foreground h-11"
            />
            <Button onClick={run} disabled={loading} className="w-full gradient-primary text-primary-foreground gap-2 h-11">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Researching..." : `Run ${cfg.label}`}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {results.map((r, i) => <ResultCard key={i} mode={mode} r={r} i={i} />)}
        </div>
      </div>
    </DashboardLayout>
  );
};

function ResultCard({ mode, r, i }: { mode: Mode; r: any; i: number }) {
  // Universal field extraction
  const title =
    r.title || r.name || r.displayName || r.username || r.channelName || r.text?.slice(0, 80) ||
    r.metadata?.title || r.url || `Result ${i + 1}`;
  const url = r.url || r.link || r.webUrl || r.permalink || r.metadata?.url || r.profileUrl;
  const snippet =
    r.description || r.snippet || r.text || r.caption || r.bio || r.address ||
    r.markdown || r.metadata?.description;
  const image = r.thumbnailUrl || r.image || r.imageUrl || r.profilePicUrl || r.screenshotUrl;

  // Mode-specific stats
  const stats: Array<[string, string | number]> = [];
  if (r.followersCount != null) stats.push(["Followers", fmt(r.followersCount)]);
  if (r.subscribersCount != null) stats.push(["Subs", fmt(r.subscribersCount)]);
  if (r.viewCount != null) stats.push(["Views", fmt(r.viewCount)]);
  if (r.playCount != null) stats.push(["Plays", fmt(r.playCount)]);
  if (r.likesCount != null) stats.push(["Likes", fmt(r.likesCount)]);
  if (r.commentsCount != null) stats.push(["Comments", fmt(r.commentsCount)]);
  if (r.score != null) stats.push(["Score", fmt(r.score)]);
  if (r.totalScore != null) stats.push(["Rating", `${r.totalScore}★`]);
  if (r.reviewsCount != null) stats.push(["Reviews", fmt(r.reviewsCount)]);
  if (r.price != null) stats.push(["Price", typeof r.price === "object" ? r.price.value : r.price]);

  const emails: string[] = r.emails || r.contactDetails?.emails || [];
  const phones: string[] = r.phones || r.phoneUnformatted ? [r.phoneUnformatted] : [];

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-3">
          {image && <img src={image} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0 border border-border" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-foreground line-clamp-2">{title}</p>
              {url && (
                <a href={url} target="_blank" rel="noreferrer" className="text-primary shrink-0">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            {url && <p className="text-xs text-primary/80 truncate">{url}</p>}
          </div>
        </div>
        {snippet && <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">{String(snippet).slice(0, 600)}</p>}
        {stats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {stats.map(([k, v]) => (
              <span key={k} className="text-[10px] font-semibold rounded-md bg-primary/10 text-primary px-2 py-0.5 border border-primary/20">
                {k}: {v}
              </span>
            ))}
          </div>
        )}
        {(emails.length > 0 || phones.length > 0) && (
          <div className="rounded-md bg-success/5 border border-success/30 p-2 space-y-0.5">
            {emails.slice(0, 5).map((e, idx) => (
              <p key={idx} className="text-xs text-foreground flex items-center gap-1.5"><Mail className="h-3 w-3 text-success" /> {e}</p>
            ))}
            {phones.filter(Boolean).slice(0, 3).map((p, idx) => (
              <p key={idx} className="text-xs text-foreground">📞 {p}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function fmt(n: any): string {
  const num = Number(n);
  if (isNaN(num)) return String(n);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return String(num);
}

export default SearchPage;
