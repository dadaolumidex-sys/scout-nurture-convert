import { z } from "zod";
import { readChannelAudit, type ChannelAudit } from "@/lib/channelAudit";
import { readKickAudit, type KickAudit } from "@/lib/kickAudit";
import { expandAuditToken } from "@/lib/auditShareToken";

const timestamp = z.string().datetime({ offset: true });
export async function readAuditShare(token: string, signal: AbortSignal): Promise<{ report: ChannelAudit | KickAudit; expiresAt: string }> {
  const rawToken = expandAuditToken(token);
  // Public reading does not load the visitor's account session or use their JWT.
  const apiKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-share`, {
    method: "POST", headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify({ action: "read", token: rawToken }), signal, cache: "no-store", referrerPolicy: "no-referrer",
  });
  if (response.status === 404) throw new Error("Report unavailable or link expired.");
  if (!response.ok) throw new Error("This report could not be loaded. Please try again later.");
  const parsed = z.object({ report: z.object({ platform: z.enum(["twitch", "kick"]), profile: z.object({}).passthrough() }).passthrough(), expiresAt: timestamp }).safeParse(await response.json());
  if (!parsed.success) throw new Error("This report could not be verified.");
  const profile = parsed.data.report.profile as Record<string, unknown>;
  const report = parsed.data.report.platform === "kick"
    ? readKickAudit(parsed.data.report, String(profile.slug || ""))
    : readChannelAudit(parsed.data.report, String(profile.login || ""));
  return { report, expiresAt: parsed.data.expiresAt };
}
