import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Globe, Search, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/web-search`;

type Mode = "search" | "scrape";

const SearchPage = () => {
  const [mode, setMode] = useState<Mode>("search");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[]>([]);

  const run = async () => {
    if (!input.trim()) { toast.error("Enter a query or URL"); return; }
    setLoading(true);
    setResults([]);
    try {
      const body = mode === "search" ? { mode, query: input.trim() } : { mode, url: input.trim() };
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Search failed");

      // Normalize results
      let items: any[] = [];
      if (mode === "search") {
        const first = json.results?.[0];
        items = first?.organicResults || first?.results || json.results || [];
      } else {
        items = json.results || [];
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
      <div className="max-w-3xl mx-auto space-y-4 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" /> Web Search Agent
          </h1>
          <p className="text-sm text-muted-foreground">Real-time web results powered by Apify.</p>
        </div>

        <div className="flex gap-2">
          <Button
            variant={mode === "search" ? "default" : "outline"}
            onClick={() => setMode("search")}
            className="flex-1"
          >
            Google Search
          </Button>
          <Button
            variant={mode === "scrape" ? "default" : "outline"}
            onClick={() => setMode("scrape")}
            className="flex-1"
          >
            Scrape URL
          </Button>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder={mode === "search" ? "What do you want to find?" : "https://example.com"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="bg-muted border-border text-foreground h-11"
            />
            <Button onClick={run} disabled={loading} className="w-full gradient-primary text-primary-foreground gap-2 h-11">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Searching..." : "Run"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {results.map((r, i) => {
            const title = r.title || r.metadata?.title || r.url || `Result ${i + 1}`;
            const url = r.url || r.link || r.metadata?.url;
            const snippet = r.description || r.snippet || r.text || r.markdown || r.metadata?.description;
            return (
              <Card key={i} className="bg-card border-border">
                <CardContent className="p-4 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-foreground line-clamp-2">{title}</p>
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" className="text-primary shrink-0">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                  {url && <p className="text-xs text-primary/80 truncate">{url}</p>}
                  {snippet && <p className="text-xs text-muted-foreground line-clamp-4 whitespace-pre-wrap">{String(snippet).slice(0, 600)}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default SearchPage;
