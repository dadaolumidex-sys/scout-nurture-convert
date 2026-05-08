import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Cand = { id: string | null; key: string };

async function loadKeys(req: Request): Promise<Cand[]> {
  const out: Cand[] = [];
  try {
    const auth = req.headers.get("authorization");
    if (auth) {
      const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
      if (user) {
        const { data } = await sb.from("api_keys").select("id, api_key")
          .eq("user_id", user.id).eq("provider", "apify").eq("is_active", true)
          .order("failure_count", { ascending: true });
        for (const k of data || []) if (k.api_key?.trim()) out.push({ id: k.id, key: k.api_key.trim() });
      }
    }
  } catch (_) {/**/}
  const env = Deno.env.get("APIFY_API_KEY");
  if (env) out.push({ id: null, key: env });
  return out;
}

async function runApify(actor: string, input: unknown, keys: Cand[]) {
  for (const k of keys) {
    try {
      const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${k.key}&timeout=120`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
      });
      if (r.ok) return await r.json();
      await r.body?.cancel();
    } catch (_) {/**/}
  }
  return [];
}

function score(item: any, platform: string) {
  const followers = Number(item.followersCount || item.subscribersCount || item.followers || 0);
  const views = Number(item.viewCount || item.playCount || item.totalViews || 0);
  const likes = Number(item.likesCount || item.likes || 0);
  // Simple weighted score, normalized
  const f = Math.log10(followers + 1) * 30;
  const v = Math.log10(views + 1) * 10;
  const l = Math.log10(likes + 1) * 5;
  return Math.round(f + v + l);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { query, platforms = ["youtube", "tiktok", "twitter"], limit = 15 } = await req.json();
    if (!query?.trim()) return new Response(JSON.stringify({ error: "Enter a game/category/keyword" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const keys = await loadKeys(req);
    if (keys.length === 0) return new Response(JSON.stringify({ error: "Add an Apify key in Settings → API & Connections." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const tasks: Array<Promise<{ platform: string; items: any[] }>> = [];

    if (platforms.includes("youtube")) tasks.push(runApify("streamers~youtube-scraper", { searchKeywords: query, maxResults: limit, maxResultsShorts: 0, maxResultStreams: 0 }, keys).then(items => ({ platform: "youtube", items })));
    if (platforms.includes("tiktok")) tasks.push(runApify("clockworks~tiktok-scraper", { searchQueries: [query], resultsPerPage: limit, shouldDownloadVideos: false }, keys).then(items => ({ platform: "tiktok", items })));
    if (platforms.includes("twitter")) tasks.push(runApify("apidojo~tweet-scraper", { searchTerms: [query], maxItems: limit, sort: "Top" }, keys).then(items => ({ platform: "twitter", items })));
    if (platforms.includes("instagram")) tasks.push(runApify("apify~instagram-search-scraper", { search: query, searchType: "hashtag", searchLimit: limit }, keys).then(items => ({ platform: "instagram", items })));
    if (platforms.includes("reddit")) tasks.push(runApify("trudax~reddit-scraper-lite", { searches: [query], maxItems: limit, type: "posts", sort: "relevance" }, keys).then(items => ({ platform: "reddit", items })));

    const results = await Promise.all(tasks);

    const all: any[] = [];
    for (const { platform, items } of results) {
      for (const it of items.slice(0, limit)) {
        all.push({
          platform,
          title: it.title || it.name || it.displayName || it.username || it.channelName || it.text?.slice(0, 80) || "Untitled",
          url: it.url || it.webUrl || it.permalink || it.profileUrl || it.link,
          image: it.thumbnailUrl || it.profilePicUrl || it.imageUrl,
          followers: it.followersCount || it.subscribersCount || null,
          views: it.viewCount || it.playCount || null,
          description: (it.description || it.bio || it.caption || it.text || "").toString().slice(0, 400),
          score: score(it, platform),
          raw: it,
        });
      }
    }
    all.sort((a, b) => b.score - a.score);

    return new Response(JSON.stringify({ query, count: all.length, results: all }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
