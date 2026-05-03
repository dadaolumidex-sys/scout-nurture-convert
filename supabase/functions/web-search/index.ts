import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const APIFY_API_KEY = Deno.env.get("APIFY_API_KEY");
    if (!APIFY_API_KEY) {
      return new Response(JSON.stringify({ error: "Apify not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { url, query, mode } = await req.json();

    // mode: "scrape" => scrape a specific URL; "search" => google search via apify
    let actorId = "";
    let input: Record<string, unknown> = {};

    if (mode === "search") {
      if (!query || typeof query !== "string") {
        return new Response(JSON.stringify({ error: "Missing query" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      actorId = "apify~google-search-scraper";
      input = { queries: query, maxPagesPerQuery: 1, resultsPerPage: 10, mobileResults: false };
    } else {
      if (!url || typeof url !== "string") {
        return new Response(JSON.stringify({ error: "Missing url" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      actorId = "apify~website-content-crawler";
      input = {
        startUrls: [{ url }],
        maxCrawlPages: 1,
        maxCrawlDepth: 0,
        crawlerType: "cheerio",
        saveMarkdown: true,
      };
    }

    // Run sync and get dataset items
    const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${APIFY_API_KEY}&timeout=120`;
    const r = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!r.ok) {
      const t = await r.text();
      console.error("Apify error", r.status, t);
      return new Response(JSON.stringify({ error: `Apify failed (${r.status})`, detail: t.slice(0, 500) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    return new Response(JSON.stringify({ results: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
