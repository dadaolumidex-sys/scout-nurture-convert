import { z } from "zod";
import { AUDIT_VERSION } from "../../supabase/functions/_shared/twitchAuditContract";
import type { ChannelAudit } from "../../supabase/functions/_shared/twitchAuditContract";

export { parseTwitchChannel } from "../../supabase/functions/_shared/twitchAuditContract";
export type { ChannelAudit } from "../../supabase/functions/_shared/twitchAuditContract";

const timestamp = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const section = <T extends z.ZodTypeAny>(data: T) => z.union([
  z.object({ status: z.literal("available"), data, reason: z.null() }),
  z.object({ status: z.literal("unavailable"), data: z.null(), reason: z.string().min(1) }),
]);

const auditSchema = z.object({
  version: z.literal(AUDIT_VERSION),
  platform: z.literal("twitch"),
  source: z.literal("Twitch Helix API"),
  fetchedAt: timestamp,
  profile: z.object({
    id: z.string().regex(/^\d+$/),
    login: z.string().regex(/^[a-z0-9_]{1,25}$/),
    displayName: z.string(),
    description: z.string().nullable(),
    profileImageUrl: z.string().url().startsWith("https://").nullable(),
    broadcasterType: z.enum(["partner", "affiliate", ""]).nullable(),
    createdAt: timestamp.nullable(),
  }),
  followers: section(count),
  stream: section(z.object({
    isLive: z.boolean(), title: z.string().nullable(), category: z.string().nullable(),
    viewers: count.nullable(), startedAt: timestamp.nullable(),
  })),
  channel: section(z.object({
    title: z.string().nullable(), category: z.string().nullable(), language: z.string().nullable(),
  })),
  videos: section(z.array(z.object({
    id: z.string().regex(/^\d+$/), title: z.string().nullable(), createdAt: timestamp.nullable(),
    duration: z.string().nullable(), views: count.nullable(),
  })).max(10)),
});

/** Reject the old analyzer payload instead of rendering its estimates as facts. */
export function readChannelAudit(payload: unknown, expectedLogin: string): ChannelAudit {
  const parsed = auditSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error("The audit service did not return a verified Twitch report. It may need the Channel Audit backend update.");
  }
  if (parsed.data.profile.login !== expectedLogin) {
    throw new Error("Twitch returned a different channel. Please try again.");
  }
  return parsed.data as ChannelAudit;
}

export function formatAuditDate(value: string | null): string {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Unavailable";
}
