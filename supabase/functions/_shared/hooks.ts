// Shared hook-message generator used by the streamer analyzers.
// Produces 3 opening DM angles (friendship / promoter-closer / expert-proof) from real channel stats.

export type StreamerStats = {
  displayName: string;
  platform: string;
  category: string;
  followers: string;
  avgViewers: string;
  frequency: string;
  growthStage: string;
  isLive: boolean;
  liveTitle?: string | null;
  description?: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
};

export type Hooks = {
  friendMessage: string;
  promoterMessage: string;
  streamerMessage: string;
  auditSummary: string;
};

const SYSTEM = `You write first-contact Discord DMs that promoters send to streamers.

Rules for every message:
- Sound like a real human typing on Discord, not marketing copy.
- 2-4 short sentences max. No bullet points, no markdown, no subject line.
- Reference at least ONE concrete detail from the audit (their game/category, viewer average, follower count, upload consistency, or the gap you spotted).
- End with a light question so it's easy for them to reply.
- Never promise fake numbers, never sound desperate, never use "Dear" or corporate tone.

The three angles:
1. friend  — Friendship. Warm gamer-to-gamer opener. Zero selling. Pure curiosity + genuine compliment about their content, plus a soft question about their streaming journey.
2. promoter — Promoter & Closer. Professional growth expert. Name the specific gap you found, give value, and prepare to handle objections and close when they are ready.
3. streamer — Expert Proof. A backup authority voice that offers authentic peer-to-peer proof of what the Promoter & Closer can help with. Keep it calm and never make fake claims.`;

function templateHooks(s: StreamerStats): Hooks {
  const gap = s.weaknesses[0] || "getting discovered by new viewers";
  const game = s.category && s.category !== "Variety" ? s.category : "your streams";
  const live = s.isLive ? " I caught you live earlier" : "";
  return {
    friendMessage: `Yo ${s.displayName}!${live} been watching your ${game} content and the vibe is genuinely good 🔥 How long have you been streaming? Feels like you're right at the point where things start clicking.`,
    promoterMessage: `Hey ${s.displayName} — I went through your ${s.platform} channel properly. ${s.followers} followers, averaging ${s.avgViewers} viewers on ${game}. The content is solid; the thing holding you back is ${gap.toLowerCase()}. I help streamers at exactly your stage fix that. Open to a quick chat about it?`,
    streamerMessage: `${s.displayName} — straight up, your ${game} streams deserve more eyes than ${s.avgViewers}. I push traffic to channels like yours and yours would convert well. Want me to show you what that looks like?`,
    auditSummary: `${s.displayName} is a ${s.growthStage.toLowerCase()} on ${s.platform} doing ${game} with ${s.followers} followers and roughly ${s.avgViewers} viewers, streaming ${s.frequency.toLowerCase()}. Biggest gap: ${gap.toLowerCase()}.`,
  };
}

async function callModel(body: Record<string, unknown>): Promise<Response | null> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (lovableKey) {
    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (r.ok) return r;
      await r.body?.cancel();
    } catch (_) { /* fall through */ }
  }
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (geminiKey) {
    for (const model of ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-flash-latest", "gemini-2.5-flash"]) {
      try {
        const r = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${geminiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, model }),
        });
        if (r.ok) return r;
        await r.body?.cancel();
      } catch (_) { /* try next */ }
    }
  }
  return null;
}

export async function generateHooks(stats: StreamerStats): Promise<Hooks> {
  const fallback = templateHooks(stats);
  const audit = `Channel: ${stats.displayName} (${stats.platform})
Category / game: ${stats.category}
Followers: ${stats.followers}
Average viewers: ${stats.avgViewers}
Streaming frequency: ${stats.frequency}
Growth stage: ${stats.growthStage}
Currently live: ${stats.isLive ? `yes — "${stats.liveTitle || "untitled"}"` : "no"}
Bio: ${stats.description || "(none)"}
Strengths: ${stats.strengths.join("; ") || "none noted"}
Weaknesses / gaps: ${stats.weaknesses.join("; ") || "none noted"}
Opportunities: ${stats.opportunities.join("; ") || "none noted"}`;

  try {
    const response = await callModel({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: `Here is a real audit of a streamer I already have on Discord:\n\n${audit}\n\nWrite the three opening DMs and a one-paragraph plain-English audit summary. Use the write_hooks tool.`,
        },
      ],
      tools: [{
        type: "function",
        function: {
          name: "write_hooks",
          description: "Return the three opening DMs and an audit summary",
          parameters: {
            type: "object",
            properties: {
              friendMessage: { type: "string" },
              promoterMessage: { type: "string" },
              streamerMessage: { type: "string" },
              auditSummary: { type: "string" },
            },
            required: ["friendMessage", "promoterMessage", "streamerMessage", "auditSummary"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "write_hooks" } },
    });

    if (!response) return fallback;
    const data = await response.json();
    const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return fallback;
    const parsed = JSON.parse(args);
    return {
      friendMessage: parsed.friendMessage?.trim() || fallback.friendMessage,
      promoterMessage: parsed.promoterMessage?.trim() || fallback.promoterMessage,
      streamerMessage: parsed.streamerMessage?.trim() || fallback.streamerMessage,
      auditSummary: parsed.auditSummary?.trim() || fallback.auditSummary,
    };
  } catch (e) {
    console.error("generateHooks failed, using templates:", e);
    return fallback;
  }
}
