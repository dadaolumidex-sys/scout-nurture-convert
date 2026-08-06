const DISCORD_API = "https://discord.com/api/v10";

export function botToken(): string {
  const t = Deno.env.get("DISCORD_BOT_TOKEN");
  if (!t) throw new Error("DISCORD_BOT_TOKEN is not configured. Add it in Settings → API & Connections.");
  return t;
}

export async function discordFetch(path: string, init: RequestInit = {}) {
  const resp = await fetch(`${DISCORD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${botToken()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Discord ${resp.status} on ${path}: ${text.slice(0, 400)}`);
  }
  return text ? JSON.parse(text) : null;
}

/** Open (or reuse) a DM channel with a Discord user id. */
export async function openDmChannel(userId: string): Promise<string> {
  const ch = await discordFetch("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: userId }),
  });
  return ch.id as string;
}

export async function fetchMessages(channelId: string, afterId?: string | null) {
  const q = new URLSearchParams({ limit: "50" });
  if (afterId) q.set("after", afterId);
  const msgs = await discordFetch(`/channels/${channelId}/messages?${q}`);
  // Discord returns newest-first; we want chronological
  return (msgs as any[]).slice().reverse();
}

export async function sendMessage(channelId: string, content: string) {
  return await discordFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content: content.slice(0, 1990) }),
  });
}

export async function getSelf() {
  return await discordFetch("/users/@me");
}
