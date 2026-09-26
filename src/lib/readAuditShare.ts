import { z } from "zod";
import { readChannelAudit, type ChannelAudit } from "@/lib/channelAudit";

export const SHARE_TOKEN = /^[a-f0-9]{64}$/;
const timestamp = z.string().datetime({ offset: true });
export async function readAuditShare(token: string, signal: AbortSignal): Promise<{ report: ChannelAudit; expiresAt: string }> {
  if (!SHARE_TOKEN.test(token)) throw new Error("Report unavailable or link expired.");
  // Public reading does not load the visitor's account session or use their JWT.
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-share`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ action: "read", token }), signal, cache: "no-store", referrerPolicy: "no-referrer",
  });
  if (response.status === 404) throw new Error("Report unavailable or link expired.");
  if (!response.ok) throw new Error("This report could not be loaded. Please try again later.");
  const parsed = z.object({ report: z.object({ profile: z.object({ login: z.string() }).passthrough() }).passthrough(), expiresAt: timestamp }).safeParse(await response.json());
  if (!parsed.success) throw new Error("This report could not be verified.");
  return { report: readChannelAudit(parsed.data.report, parsed.data.report.profile.login), expiresAt: parsed.data.expiresAt };
}
