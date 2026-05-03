import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { url, query, mode, userKeys } = await req.json();

    // Build candidate keys: user-provided (in order) + env fallback
    const candidates: { id: string | null; key: string }[] = [];
    if (Array.isArray(userKeys)) {
      for (const k of userKeys) {
        if (k && typeof k.api_key === "string" && k.api_key.trim()) {
          candidates.push({ id: k.id ?? null, key: k.api_key.trim() });
        }
      }
    }
    const envKey = Deno.env.get("APIFY_API_KEY");
    if (envKey) candidates.push({ id: null, key: envKey });

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ error: "No Apify API keys configured. Add one in Settings → API & Connections." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
      input = { startUrls: [{ url }], maxCrawlPages: 1, maxCrawlDepth: 0, crawlerType: "cheerio", saveMarkdown: true };
    }

    const failed: { id: string | null; status: number; detail: string }[] = [];
    for (const cand of candidates) {
      const runUrl = `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${cand.key}&timeout=120`;
      try {
        const r = await fetch(runUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (r.ok) {
          const data = await r.json();
          return new Response(JSON.stringify({ results: data, usedKeyId: cand.id, failedKeyIds: failed.map(f => f.id).filter(Boolean) }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const t = await r.text();
        failed.push({ id: cand.id, status: r.status, detail: t.slice(0, 200) });
        console.error("Apify key failed", cand.id, r.status);
        // Only rotate on auth/quota/server errors
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
