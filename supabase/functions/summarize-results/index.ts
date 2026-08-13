import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are an outreach research analyst for a streamer-promoter team.
Given raw search results, return STRICT JSON of the form:
{
  "summary": "2-3 sentence overview of what these results show",
  "top_picks": [
    { "index": <0-based index into the input array>, "title": "...", "why": "1-2 sentence reason this is a strong lead", "opener": "an exact first DM/email opener (max 280 chars) tailored to the lead, friendly, no fluff" }
  ]
}
Pick at most 3 top_picks. NO prose outside JSON. NO markdown fences.`;

async function callLovable(body: Record<string, unknown>, key: string) {
  return await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callGemini(body: Record<string, unknown>, key: string) {
  return await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, model: "gemini-3.6-flash" }),
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { mode, query, results } = await req.json();
    if (!Array.isArray(results) || results.length === 0) {
      return new Response(JSON.stringify({ error: "No results to summarize" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Compact results to keep prompt small
    const compact = results.slice(0, 25).map((r: any, i: number) => ({
      i,
      title: r.title || r.name || r.displayName || r.username || r.text?.slice(0, 80) || r.url,
      url: r.url || r.link || r.webUrl || r.permalink || r.profileUrl,
      desc: (r.description || r.snippet || r.bio || r.caption || r.text || "").toString().slice(0, 300),
      followers: r.followersCount ?? r.subscribersCount ?? null,
      views: r.viewCount ?? r.playCount ?? null,
      address: r.address || null,
    }));

    const messages = [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Mode: ${mode}\nQuery: ${query || "(none)"}\nResults:\n${JSON.stringify(compact)}` },
    ];

    // Try user keys then env
    let userGemini: string | undefined;
    let userOpenAI: string | undefined;
    try {
      const auth = req.headers.get("authorization");
      if (auth) {
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        const { data: { user } } = await sb.auth.getUser(auth.replace("Bearer ", ""));
        if (user) {
          const { data } = await sb.from("user_settings").select("gemini_api_key, openai_api_key").eq("user_id", user.id).single();
          userGemini = data?.gemini_api_key || undefined;
          userOpenAI = data?.openai_api_key || undefined;
        }
      }
    } catch (_) { /* ignore */ }

    const lovable = Deno.env.get("LOVABLE_API_KEY");
    const envGemini = Deno.env.get("GEMINI_API_KEY");

    const body = { messages, model: "google/gemini-3.6-flash", response_format: { type: "json_object" } };
    let text = "";
    let r: Response | null = null;
    if (lovable) {
      const x = await callLovable(body, lovable);
      if (x.ok) r = x; else await x.body?.cancel();
    }
    if (!r && userOpenAI) {
      const x = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST", headers: { Authorization: `Bearer ${userOpenAI}`, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, model: "gpt-4o-mini" }),
      });
      if (x.ok) r = x; else await x.body?.cancel();
    }
    const gKey = userGemini || envGemini;
    if (!r && gKey) {
      const x = await callGemini(body, gKey);
      if (x.ok) r = x; else await x.body?.cancel();
    }
    if (!r) return new Response(JSON.stringify({ error: "No AI provider available. Add a Gemini or OpenAI key in Settings." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const json = await r.json();
    text = json.choices?.[0]?.message?.content || "";
    let parsed: any;
    try { parsed = JSON.parse(text); }
    catch {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : { summary: text, top_picks: [] };
    }

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
