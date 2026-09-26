import { z } from "zod";
import { callEdgeFunction } from "@/lib/edgeFunction";
import { readChannelAudit, type ChannelAudit } from "@/lib/channelAudit";

import { SHARE_TOKEN } from "@/lib/readAuditShare";
const timestamp = z.string().datetime({ offset: true });
const createdSchema = z.object({ id: z.string().uuid(), token: z.string().regex(SHARE_TOKEN), createdAt: timestamp, expiresAt: timestamp, report: z.unknown() });
const listSchema = z.object({ shares: z.array(z.object({ id: z.string().uuid(), channel_login: z.string().regex(/^[a-z0-9_]{1,25}$/), created_at: timestamp, expires_at: timestamp })) });
export type AuditShareListItem = z.infer<typeof listSchema>["shares"][number];
export type CreatedAuditShare = { id: string; url: string; expiresAt: string; report: ChannelAudit };

export function auditShareUrl(token: string, origin = window.location.origin): string {
  if (!SHARE_TOKEN.test(token)) throw new Error("Invalid report link.");
  // Fragments are never sent to the hosting server or as HTTP referrers.
  return `${origin}/audit-report#${token}`;
}

export async function createAuditShare(username: string): Promise<CreatedAuditShare> {
  const parsed = createdSchema.safeParse(await callEdgeFunction("audit-share", { action: "create", username }, 60_000));
  if (!parsed.success) throw new Error("Could not confirm the shared report. Please refresh your share links.");
  return { id: parsed.data.id, url: auditShareUrl(parsed.data.token), expiresAt: parsed.data.expiresAt, report: readChannelAudit(parsed.data.report, username) };
}

export async function listAuditShares(): Promise<AuditShareListItem[]> {
  const parsed = listSchema.safeParse(await callEdgeFunction("audit-share", { action: "list" }));
  if (!parsed.success) throw new Error("Could not read your share links.");
  return parsed.data.shares;
}

export async function revokeAuditShare(id: string): Promise<void> {
  z.string().uuid().parse(id);
  const result = await callEdgeFunction<{ revoked?: boolean }>("audit-share", { action: "revoke", id });
  if (result?.revoked !== true) throw new Error("Could not revoke this link. Please try again.");
}
