import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, Search, Loader2, ExternalLink, Sparkles, MapPin, Mail, Youtube, Music2, Instagram, Twitter, MessageSquare, ShoppingBag, Camera, Tv, Network, FileText, Lightbulb, Bookmark, BookmarkCheck, Trash2, History, Wand2, Send, Tag, X, Inbox, Star } from "lucide-react";
import { toast } from "sonner";
import { recordFailure, recordSuccess } from "@/lib/apiKeys";
import { notify } from "@/lib/notifications";
import { supabase } from "@/integrations/supabase/client";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-search`;
const SUMMARIZE_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/summarize-results`;
const DISCOVER_ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-discover`;

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
  examples: string[];
}

const MODES: ModeConfig[] = [
  { id: "search", label: "Google Search", icon: Search, group: "Web", needs: "query", placeholder: "e.g. 'top kick streamers 2025'", desc: "Full Google SERP results — best for general research.",
    examples: ["best twitch promoters 2025", "kick streamer sponsorship deals", "social media marketing trends Nigeria"] },
  { id: "scrape", label: "Scrape Page", icon: FileText, group: "Web", needs: "url", placeholder: "https://example.com", desc: "Extract clean text/markdown from one URL.",
    examples: ["https://twitch.tv/about", "https://kick.com/community-guidelines"] },
  { id: "crawl", label: "Crawl Site", icon: Network, group: "Web", needs: "url", placeholder: "https://example.com", desc: "Crawl multiple pages of a website (up to 15).",
    examples: ["https://streamerinfo.com", "https://yourcompetitor.com/blog"] },
  { id: "screenshot", label: "Screenshot", icon: Camera, group: "Web", needs: "url", placeholder: "https://example.com", desc: "Capture a full-page screenshot.",
    examples: ["https://kick.com/westcol", "https://twitch.tv/xqc"] },

  { id: "youtube", label: "YouTube", icon: Youtube, group: "Social", needs: "query", placeholder: "e.g. 'fortnite highlights'", desc: "Find channels & videos by keyword.",
    examples: ["gaming setup tour 2025", "small streamer growth tips", "fortnite highlights"] },
  { id: "tiktok", label: "TikTok", icon: Music2, group: "Social", needs: "query", placeholder: "e.g. 'gaming setup'", desc: "Search videos & creators.",
    examples: ["streamer life", "gaming setup tour", "kick streamer clips"] },
  { id: "instagram", label: "Instagram", icon: Instagram, group: "Social", needs: "query", placeholder: "hashtag, e.g. 'gamer'", desc: "Search Instagram by hashtag.",
    examples: ["streamer", "gamergirl", "twitchstreamer"] },
  { id: "twitter", label: "Twitter/X", icon: Twitter, group: "Social", needs: "query", placeholder: "e.g. 'twitch sponsorships'", desc: "Latest tweets matching a query.",
    examples: ["twitch sponsorships", "kick streamer deal", "looking for streamer to promote"] },
  { id: "reddit", label: "Reddit", icon: MessageSquare, group: "Social", needs: "query", placeholder: "e.g. 'streamer marketing'", desc: "Search posts across all subreddits.",
    examples: ["streamer marketing", "how to grow on kick", "best stream overlays"] },
  { id: "twitch", label: "Twitch Channel", icon: Tv, group: "Social", needs: "url", placeholder: "https://twitch.tv/username", desc: "Pull a specific Twitch channel's data.",
    examples: ["https://twitch.tv/xqc", "https://twitch.tv/pokimane"] },

  { id: "google_maps", label: "Google Maps", icon: MapPin, group: "Leads", needs: "query", placeholder: "e.g. 'gaming cafes Lagos'", desc: "Find local businesses with phone, address & website.",
    examples: ["gaming cafes Lagos", "marketing agencies New York", "esports bars Berlin"] },
  { id: "emails", label: "Email Finder", icon: Mail, group: "Leads", needs: "url", placeholder: "https://creatorsite.com", desc: "Extract emails & contacts from any website.",
    examples: ["https://creatorsite.com", "https://agencywebsite.com/contact"] },

  { id: "amazon", label: "Amazon", icon: ShoppingBag, group: "Commerce", needs: "query", placeholder: "e.g. 'gaming chair'", desc: "Search products with prices & reviews.",
    examples: ["gaming chair", "ring light streaming", "shure sm7b microphone"] },
];

const GROUPS: Array<"Web" | "Social" | "Leads" | "Commerce"> = ["Web", "Social", "Leads", "Commerce"];

type Tab = "discover" | "search" | "saved";

const SearchPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("discover");
  const [mode, setMode] = useState<Mode>("search");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [saved, setSaved] = useState<any[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkSending, setBulkSending] = useState(false);

  // AI summary state
  const [summary, setSummary] = useState<{ summary: string; top_picks: { index: number; title: string; why: string; opener: string }[] } | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  // Auto-discover state
  const [discoverInput, setDiscoverInput] = useState("");
  const [discoverPlatforms, setDiscoverPlatforms] = useState<string[]>(["youtube", "tiktok", "twitter"]);
  const [discoverLoading, setDiscoverLoading] = useState(false);
  const [discoverResults, setDiscoverResults] = useState<any[]>([]);

  // Saved filters
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  const cfg = MODES.find(m => m.id === mode)!;

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const s of saved) for (const t of (s.tags || [])) set.add(t);
    return Array.from(set);
  }, [saved]);

  const filteredSaved = useMemo(
    () => tagFilter ? saved.filter(s => (s.tags || []).includes(tagFilter)) : saved,
    [saved, tagFilter]
  );

  const loadSaved = async () => {
    setLoadingSaved(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoadingSaved(false); return; }
    const { data } = await (supabase.from("saved_searches" as any).select("*").order("created_at", { ascending: false }) as any);
    setSaved(data || []);
    const keys = new Set<string>((data || []).map((s: any) => `${s.mode}::${s.url || s.title}`));
    setSavedIds(keys);
    setLoadingSaved(false);
  };

  useEffect(() => { loadSaved(); }, []);

  const saveResult = async (r: any, modeOverride?: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Sign in to save results."); return; }
    const m = modeOverride || mode;
    const title = r.title || r.name || r.displayName || r.username || r.text?.slice(0, 80) || r.url || "Saved item";
    const url = r.url || r.link || r.webUrl || r.permalink || r.profileUrl || null;
    const snippet = r.description || r.snippet || r.text || r.caption || r.bio || r.address || null;
    const image = r.thumbnailUrl || r.image || r.imageUrl || r.profilePicUrl || r.screenshotUrl || null;
    const key = `${m}::${url || title}`;
    if (savedIds.has(key)) { toast.message("Already saved"); return; }
    const { error } = await (supabase.from("saved_searches" as any).insert({
      user_id: session.user.id, mode: m, query: modeOverride ? discoverInput : input, title: String(title).slice(0, 300),
      url, snippet: snippet ? String(snippet).slice(0, 1000) : null, image, data: r,
    }) as any);
    if (error) { toast.error("Could not save"); return; }
    toast.success("Saved");
    setSavedIds(new Set([...savedIds, key]));
    loadSaved();
  };

  const deleteSaved = async (id: string) => {
    const { error } = await (supabase.from("saved_searches" as any).delete().eq("id", id) as any);
    if (error) { toast.error("Could not remove"); return; }
    toast.success("Removed");
    loadSaved();
  };

  const addTag = async (item: any) => {
    const tag = window.prompt("Tag (e.g. hot lead, follow up, competitor):", "")?.trim();
    if (!tag) return;
    const tags = Array.from(new Set([...(item.tags || []), tag]));
    const { error } = await (supabase.from("saved_searches" as any).update({ tags }).eq("id", item.id) as any);
    if (error) toast.error("Could not tag"); else { toast.success("Tagged"); loadSaved(); }
  };

  const removeTag = async (item: any, tag: string) => {
    const tags = (item.tags || []).filter((t: string) => t !== tag);
    await (supabase.from("saved_searches" as any).update({ tags }).eq("id", item.id) as any);
    loadSaved();
  };

  // Core: add one normalized item to the Inbox with duplicate detection.
  // Returns a status so callers (single + bulk) can report results consistently.
  const addItemToInbox = async (
    session: any,
    item: any
  ): Promise<{ status: "added" | "duplicate" | "error"; username: string; id?: string }> => {
    let platform = "twitch";
    let username = item.title || item.name || item.username || "lead";
    if (item.url) {
      try {
        const u = new URL(item.url);
        if (u.hostname.includes("kick.com")) { platform = "kick"; username = u.pathname.split("/").filter(Boolean)[0] || username; }
        else if (u.hostname.includes("twitch.tv")) { platform = "twitch"; username = u.pathname.split("/").filter(Boolean)[0] || username; }
        else if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) { platform = "youtube"; username = u.pathname.split("/").filter(Boolean)[0] || username; }
        else if (u.hostname.includes("tiktok.com")) { platform = "tiktok"; username = u.pathname.split("/").filter(Boolean)[0]?.replace("@", "") || username; }
        else if (u.hostname.includes("instagram.com")) { platform = "instagram"; username = u.pathname.split("/").filter(Boolean)[0] || username; }
        else if (u.hostname.includes("twitter.com") || u.hostname.includes("x.com")) { platform = "twitter"; username = u.pathname.split("/").filter(Boolean)[0] || username; }
      } catch {/**/}
    }
    username = String(username).slice(0, 80).toLowerCase().replace(/\s+/g, "");
    // Duplicate detection
    const { data: existing } = await (supabase.from("streamer_contacts" as any)
      .select("id, username").eq("user_id", session.user.id).eq("platform", platform).eq("username", username).maybeSingle() as any);
    if (existing?.id) return { status: "duplicate", username, id: existing.id };
    const { data, error } = await (supabase.from("streamer_contacts" as any).insert({
      user_id: session.user.id, platform, username,
      display_name: item.title?.slice(0, 120) || username,
      channel_url: item.url, profile_image_url: item.image || item.thumbnailUrl || item.profilePicUrl,
      description: (item.snippet || item.description || item.bio)?.slice(0, 500),
      status: "new", conversation_type: "new",
    }).select("id").single() as any);
    if (error) return { status: "error", username };
    return { status: "added", username, id: data.id };
  };

  const sendToInbox = async (item: any) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Sign in first"); return; }
    const res = await addItemToInbox(session, item);
    if (res.status === "duplicate") {
      toast.info(`${res.username} is already in your Inbox`, {
        action: { label: "Open", onClick: () => navigate(`/inbox/${res.id}`) },
      });
      return;
    }
    if (res.status === "error") { toast.error("Could not add to Inbox"); return; }
    toast.success(`Added ${res.username} to Inbox`, {
      action: { label: "Open", onClick: () => navigate(`/inbox/${res.id}`) },
    });
    notify("info", "New contact", `${res.username} added from research`).catch(() => {});
  };

  // Normalize a raw search result into the shape addItemToInbox expects.
  const normalizeForInbox = (r: any) => ({
    title: r.title || r.name || r.username || r.displayName,
    url: r.url || r.link || r.profileUrl || r.webUrl || r.permalink,
    image: r.thumbnailUrl || r.image || r.profilePicUrl,
    snippet: r.description || r.snippet || r.bio,
  });

  const bulkSendToInbox = async () => {
    if (bulkSending) return;
    const items = results.filter((_, i) => selected.has(i));
    if (items.length === 0) { toast.error("Select at least one result"); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Sign in first"); return; }
    setBulkSending(true);
    let added = 0, dupes = 0, failed = 0;
    for (const r of items) {
      const res = await addItemToInbox(session, normalizeForInbox(r));
      if (res.status === "added") added++;
      else if (res.status === "duplicate") dupes++;
      else failed++;
    }
    setBulkSending(false);
    setSelected(new Set());
    const parts = [] as string[];
    if (added) parts.push(`${added} added`);
    if (dupes) parts.push(`${dupes} already in Inbox`);
    if (failed) parts.push(`${failed} failed`);
    toast.success(parts.join(" · ") || "Done", {
      action: added ? { label: "Open Inbox", onClick: () => navigate("/inbox") } : undefined,
    });
    if (added) notify("info", "Leads added", `${added} lead(s) added from research`).catch(() => {});
  };

  const toggleSelect = (i: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i); else next.add(i);
      return next;
    });
  };

  const summarizeResults = async () => {
    if (!results.length) { toast.error("Run a search first"); return; }
    setSummarizing(true);
    setSummary(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(SUMMARIZE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ mode, query: input, results }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSummary(json);
    } catch (e: any) {
      toast.error(e.message || "AI summary failed");
    } finally {
      setSummarizing(false);
    }
  };

  const runDiscover = async () => {
    if (!discoverInput.trim()) { toast.error("Enter a game, niche, or keyword"); return; }
    if (discoverPlatforms.length === 0) { toast.error("Pick at least one platform"); return; }
    setDiscoverLoading(true);
    setDiscoverResults([]);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("Sign in first"); navigate("/auth"); return; }
      const res = await fetch(DISCOVER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ query: discoverInput.trim(), platforms: discoverPlatforms, limit: 10 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Discover failed");
      setDiscoverResults(json.results || []);
      if ((json.results || []).length === 0) toast.message("No leads found — try a broader keyword");
    } catch (e: any) {
      toast.error(e.message || "Failed");
    } finally {
      setDiscoverLoading(false);
    }
  };

  const run = async () => {
    if (!input.trim()) { toast.error(`Enter a ${cfg.needs === "url" ? "URL" : "query"}`); return; }
    setLoading(true);
    setResults([]);
    setSummary(null);
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

  const isSaved = (r: any, m?: string) => {
    const url = r.url || r.link || r.webUrl || r.permalink || r.profileUrl;
    const title = r.title || r.name || r.displayName || r.username || r.text?.slice(0, 80) || url;
    return savedIds.has(`${m || mode}::${url || title}`);
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

        <div className="flex gap-2">
          <button onClick={() => setTab("discover")} className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition ${tab === "discover" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
            <Wand2 className="h-3.5 w-3.5" /> Auto-Discover
          </button>
          <button onClick={() => setTab("search")} className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition ${tab === "search" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
            <Search className="h-3.5 w-3.5" /> Search
          </button>
          <button onClick={() => setTab("saved")} className={`flex-1 flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition ${tab === "saved" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:text-foreground"}`}>
            <Bookmark className="h-3.5 w-3.5" /> Saved {saved.length > 0 && <span className="ml-1 rounded-full bg-primary/20 text-primary text-[10px] px-1.5">{saved.length}</span>}
          </button>
        </div>

        {tab === "discover" && (
          <>
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Wand2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">Auto-Discover Streamers</p>
                    <p className="text-xs text-muted-foreground">Enter a game, niche, or keyword. We scan multiple platforms in parallel and rank creators by reach.</p>
                  </div>
                </div>
                <Input
                  placeholder="e.g. 'fortnite small streamer', 'kick gaming spanish', 'crypto trading'"
                  value={discoverInput}
                  onChange={(e) => setDiscoverInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runDiscover()}
                  className="bg-muted border-border text-foreground h-11"
                />
                <div className="space-y-1.5">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Platforms</p>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { id: "youtube", label: "YouTube", icon: Youtube },
                      { id: "tiktok", label: "TikTok", icon: Music2 },
                      { id: "twitter", label: "Twitter/X", icon: Twitter },
                      { id: "instagram", label: "Instagram", icon: Instagram },
                      { id: "reddit", label: "Reddit", icon: MessageSquare },
                    ].map(p => {
                      const Icon = p.icon;
                      const on = discoverPlatforms.includes(p.id);
                      return (
                        <button key={p.id}
                          onClick={() => setDiscoverPlatforms(on ? discoverPlatforms.filter(x => x !== p.id) : [...discoverPlatforms, p.id])}
                          className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] transition ${on ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/50 text-muted-foreground hover:border-primary/50"}`}>
                          <Icon className="h-3 w-3" /> {p.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <Button onClick={runDiscover} disabled={discoverLoading} className="w-full gradient-primary text-primary-foreground gap-2 h-11">
                  {discoverLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                  {discoverLoading ? "Scanning platforms..." : "Discover Streamers"}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-3">
              {discoverResults.map((r, i) => (
                <Card key={i} className="bg-card border-border">
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-start gap-3">
                      {r.image && <img src={r.image} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0 border border-border" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[10px] font-bold rounded-md bg-primary/10 text-primary px-1.5 py-0.5 uppercase shrink-0">{r.platform}</span>
                            <p className="text-sm font-semibold text-foreground line-clamp-2">{r.title}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <span className="text-[10px] font-bold rounded-md bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 flex items-center gap-0.5"><Star className="h-2.5 w-2.5" />{r.score}</span>
                            <button onClick={() => saveResult(r.raw, r.platform)} className={isSaved(r.raw, r.platform) ? "text-primary p-1" : "text-muted-foreground hover:text-primary p-1"}>
                              {isSaved(r.raw, r.platform) ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                            </button>
                            {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-primary p-1"><ExternalLink className="h-4 w-4" /></a>}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {r.followers != null && <span className="text-[10px] font-semibold rounded-md bg-primary/10 text-primary px-1.5 py-0.5">Followers: {fmt(r.followers)}</span>}
                          {r.views != null && <span className="text-[10px] font-semibold rounded-md bg-primary/10 text-primary px-1.5 py-0.5">Views: {fmt(r.views)}</span>}
                        </div>
                      </div>
                    </div>
                    {r.description && <p className="text-xs text-muted-foreground line-clamp-3">{r.description}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {tab === "search" && (
          <>
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
                        onClick={() => { setMode(m.id); setResults([]); setInput(""); setSummary(null); }}
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
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1"><Lightbulb className="h-3 w-3" /> Try:</span>
                  {cfg.examples.map(ex => (
                    <button
                      key={ex}
                      onClick={() => setInput(ex)}
                      className="text-[11px] rounded-full border border-border bg-muted/50 hover:border-primary hover:bg-primary/10 hover:text-primary text-muted-foreground px-2.5 py-1 transition"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
                <Button onClick={run} disabled={loading} className="w-full gradient-primary text-primary-foreground gap-2 h-11">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  {loading ? "Researching..." : `Run ${cfg.label}`}
                </Button>
              </CardContent>
            </Card>

            {results.length > 0 && (
              <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/30">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">AI Insights</p>
                        <p className="text-xs text-muted-foreground">Top picks + ready-to-send opener for each lead.</p>
                      </div>
                    </div>
                    <Button size="sm" onClick={summarizeResults} disabled={summarizing} variant="outline" className="border-primary/40 text-primary gap-1.5">
                      {summarizing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      {summary ? "Re-run" : "Analyze"}
                    </Button>
                  </div>
                  {summary && (
                    <>
                      <p className="text-xs text-foreground whitespace-pre-wrap">{summary.summary}</p>
                      <div className="space-y-2">
                        {summary.top_picks?.map((p, idx) => (
                          <div key={idx} className="rounded-lg border border-primary/20 bg-card p-3 space-y-1.5">
                            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Star className="h-3 w-3 text-yellow-500" />{p.title}</p>
                            <p className="text-[11px] text-muted-foreground">{p.why}</p>
                            <div className="rounded-md bg-muted p-2">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Suggested opener</p>
                              <p className="text-xs text-foreground italic">"{p.opener}"</p>
                              <button onClick={() => { navigator.clipboard.writeText(p.opener); toast.success("Opener copied"); }} className="text-[10px] text-primary mt-1 hover:underline">Copy</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="space-y-3">
              {results.map((r, i) => <ResultCard key={i} mode={mode} r={r} i={i} onSave={() => saveResult(r)} saved={isSaved(r)} onSendToInbox={() => sendToInbox({ title: r.title || r.name || r.username, url: r.url || r.link || r.profileUrl, image: r.thumbnailUrl || r.image || r.profilePicUrl, snippet: r.description || r.snippet || r.bio })} />)}
            </div>
          </>
        )}

        {tab === "saved" && (
          <div className="space-y-3">
            {loadingSaved && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
            {!loadingSaved && saved.length === 0 && (
              <Card className="bg-card border-border">
                <CardContent className="p-8 text-center space-y-2">
                  <History className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm font-medium text-foreground">No saved results yet</p>
                  <p className="text-xs text-muted-foreground">Tap the bookmark icon on any search result to save it for later.</p>
                </CardContent>
              </Card>
            )}
            {allTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 px-1">
                <button onClick={() => setTagFilter(null)} className={`text-[11px] rounded-full px-2.5 py-1 border transition ${!tagFilter ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/50 text-muted-foreground"}`}>All</button>
                {allTags.map(t => (
                  <button key={t} onClick={() => setTagFilter(t === tagFilter ? null : t)} className={`text-[11px] rounded-full px-2.5 py-1 border transition flex items-center gap-1 ${t === tagFilter ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/50 text-muted-foreground"}`}>
                    <Tag className="h-2.5 w-2.5" />{t}
                  </button>
                ))}
              </div>
            )}
            {filteredSaved.map((s) => (
              <Card key={s.id} className="bg-card border-border">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-3">
                    {s.image && <img src={s.image} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0 border border-border" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground line-clamp-2">{s.title}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          {s.url && <a href={s.url} target="_blank" rel="noreferrer" className="text-primary p-1"><ExternalLink className="h-4 w-4" /></a>}
                          <button onClick={() => deleteSaved(s.id)} className="text-destructive p-1"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-semibold rounded-md bg-primary/10 text-primary px-1.5 py-0.5 uppercase">{s.mode}</span>
                        {s.query && <span className="text-[10px] text-muted-foreground truncate">"{s.query}"</span>}
                      </div>
                      {s.url && <p className="text-xs text-primary/80 truncate mt-0.5">{s.url}</p>}
                    </div>
                  </div>
                  {s.snippet && <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{s.snippet}</p>}
                  {(s.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {(s.tags || []).map((t: string) => (
                        <span key={t} className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5 flex items-center gap-1">
                          {t}
                          <button onClick={() => removeTag(s, t)} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <p className="text-[10px] text-muted-foreground">Saved {new Date(s.created_at).toLocaleDateString()}</p>
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => addTag(s)} className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1"><Tag className="h-3 w-3" />Tag</button>
                      <button onClick={() => sendToInbox(s)} className="text-[11px] text-primary font-medium flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 hover:bg-primary/10">
                        <Inbox className="h-3 w-3" /> Send to Inbox
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

function ResultCard({ mode, r, i, onSave, saved, onSendToInbox }: { mode: Mode; r: any; i: number; onSave: () => void; saved: boolean; onSendToInbox?: () => void }) {
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

  // Show inbox button if it looks like a streamer/creator
  const isCreator = ["youtube","tiktok","instagram","twitter","reddit","twitch"].includes(mode) || /twitch\.tv|kick\.com|youtube\.com|tiktok\.com|instagram\.com/.test(url || "");

  return (
    <Card className="bg-card border-border overflow-hidden">
      <CardContent className="p-4 space-y-2">
        <div className="flex items-start gap-3">
          {image && <img src={image} alt="" className="h-14 w-14 rounded-lg object-cover shrink-0 border border-border" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold text-foreground line-clamp-2">{title}</p>
              <div className="flex items-center gap-1 shrink-0">
                {onSendToInbox && isCreator && (
                  <button onClick={onSendToInbox} className="text-muted-foreground hover:text-primary p-1" title="Add to Inbox">
                    <Inbox className="h-4 w-4" />
                  </button>
                )}
                <button onClick={onSave} className={saved ? "text-primary p-1" : "text-muted-foreground hover:text-primary p-1"} title={saved ? "Saved" : "Save"}>
                  {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
                </button>
                {url && (
                  <a href={url} target="_blank" rel="noreferrer" className="text-primary p-1">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
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
