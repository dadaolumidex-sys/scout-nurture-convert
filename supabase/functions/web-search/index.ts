import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Preset Apify actors keyed by mode. Each builds the input payload from { query, url, limit }.
type PresetCtx = { query?: string; url?: string; limit?: number };
const PRESETS: Record<string, { actor: string; build: (c: PresetCtx) => Record<string, unknown> }> = {
  // Generic search & scraping
  search: {
    actor: "apify~google-search-scraper",
    build: ({ query, limit }) => ({ queries: query, maxPagesPerQuery: 1, resultsPerPage: limit ?? 10, mobileResults: false }),
  },
  scrape: {
    actor: "apify~website-content-crawler",
    build: ({ url }) => ({ startUrls: [{ url }], maxCrawlPages: 1, maxCrawlDepth: 0, crawlerType: "cheerio", saveMarkdown: true }),
  },
  crawl: {
    actor: "apify~website-content-crawler",
    build: ({ url, limit }) => ({ startUrls: [{ url }], maxCrawlPages: limit ?? 15, maxCrawlDepth: 2, crawlerType: "cheerio", saveMarkdown: true }),
  },
  screenshot: {
    actor: "apify~screenshot-url",
    build: ({ url }) => ({ urls: [{ url }], waitUntil: "networkidle2" }),
  },

  // Local / business research
  google_maps: {
    actor: "compass~crawler-google-places",
    build: ({ query, limit }) => ({ searchStringsArray: [query], maxCrawledPlacesPerSearch: limit ?? 20, language: "en" }),
  },

  // Contact / lead extraction
  emails: {
    actor: "lukaskrivka~email-and-contacts-scraper",
    build: ({ url, limit }) => ({ startUrls: [{ url }], maxRequestsPerStartUrl: limit ?? 20, maxDepth: 2 }),
  },

  // Social platforms
  youtube: {
    actor: "streamers~youtube-scraper",
    build: ({ query, limit }) => ({ searchKeywords: query, maxResults: limit ?? 25, maxResultsShorts: 0, maxResultStreams: 0 }),
  },
  tiktok: {
    actor: "clockworks~tiktok-scraper",
    build: ({ query, limit }) => ({ searchQueries: [query], resultsPerPage: limit ?? 20, shouldDownloadVideos: false }),
  },
  instagram: {
    actor: "apify~instagram-search-scraper",
    build: ({ query, limit }) => ({ search: query, searchType: "hashtag", searchLimit: limit ?? 20 }),
  },
  twitter: {
    actor: "apidojo~tweet-scraper",
    build: ({ query, limit }) => ({ searchTerms: [query], maxItems: limit ?? 25, sort: "Latest" }),
  },
  reddit: {
    actor: "trudax~reddit-scraper-lite",
    build: ({ query, limit }) => ({ searches: [query], maxItems: limit ?? 25, type: "posts", sort: "relevance" }),
  },

  // Streamer-specific
  twitch: {
    actor: "shu8hvrXbJbY3Eb9W", // Twitch streamer/channel scraper
    build: ({ url }) => ({ startUrls: [{ url }], maxItems: 1 }),
  },

  // Commerce
  amazon: {
    actor: "junglee~amazon-crawler",
    build: ({ query, limit }) => ({ keywords: [query], maxItemsPerKeyword: limit ?? 20, country: "US" }),
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url, query, mode, limit } = await req.json();
    const preset = PRESETS[mode];
    if (!preset) {
      return new Response(JSON.stringify({ error: `Unsupported mode: ${mode}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate inputs based on what the preset needs
    const needsQuery = ["search", "google_maps", "youtube", "tiktok", "instagram", "twitter", "reddit", "amazon"].includes(mode);
    const needsUrl = ["scrape", "crawl", "screenshot", "emails", "twitch"].includes(mode);
    if (needsQuery && !query?.trim()) {
      return new Response(JSON.stringify({ error: "Enter a search query." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (needsUrl && !url?.trim()) {
      return new Response(JSON.stringify({ error: "Enter a valid URL." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load user's saved Apify keys + env fallback
    const candidates: { id: string | null; key: string }[] = [];
    try {
      const authHeader = req.headers.get("authorization");
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (authHeader && supabaseUrl && serviceKey) {
        const sb = createClient(supabaseUrl, serviceKey);
        const token = authHeader.replace("Bearer ", "");
        const { data: { user } } = await sb.auth.getUser(token);
        if (user) {
          const { data: rows } = await sb
            .from("api_keys")
            .select("id, api_key")
            .eq("user_id", user.id)
            .eq("provider", "apify")
            .eq("is_active", true)
            .order("failure_count", { ascending: true })
            .order("last_used_at", { ascending: true, nullsFirst: true });
          for (const k of rows || []) {
            if (k.api_key?.trim()) candidates.push({ id: k.id, key: k.api_key.trim() });
          }
        }
      }
    } catch (e) { console.error("Could not load user Apify keys", e); }
    const envKey = Deno.env.get("APIFY_API_KEY");
    if (envKey) candidates.push({ id: null, key: envKey });

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ error: "No Apify key found. Sign in, then add your Apify key in Settings → API & Connections." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const input = preset.build({ query, url, limit });
    const actorId = preset.actor;

    const failed: { id: string | null; status: number; detail: string }[] = [];
    for (const cand of candidates) {
      const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${cand.key}&timeout=180`;
      try {
        const r = await fetch(runUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (r.ok) {
          const data = await r.json();
          return new Response(JSON.stringify({ results: data, mode, usedKeyId: cand.id, failedKeyIds: failed.map(f => f.id).filter(Boolean) }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await r.text();
        failed.push({ id: cand.id, status: r.status, detail: t.slice(0, 200) });
        console.error("Apify failed", actorId, cand.id, r.status);
        if (![401, 402, 403, 429, 500, 502, 503].includes(r.status)) {
          return new Response(JSON.stringify({ error: `Apify failed (${r.status})`, detail: t.slice(0, 500), failedKeyIds: failed.map(f => f.id).filter(Boolean) }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      } catch (e) {
        failed.push({ id: cand.id, status: 0, detail: String(e) });
      }
    }

    return new Response(JSON.stringify({
      error: "All Apify keys failed. Add a new one in Settings → API & Connections.",
      failedKeyIds: failed.map(f => f.id).filter(Boolean),
      failures: failed,
    }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
