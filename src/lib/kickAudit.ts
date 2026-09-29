import { z } from "zod";
import { KICK_AUDIT_VERSION, parseKickChannel, type KickAudit } from "../../supabase/functions/_shared/kickAuditContract";

export { parseKickChannel };
export type { KickAudit };

const url = z.string().url().startsWith("https://").nullable();
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const schema = z.object({
  version: z.literal(KICK_AUDIT_VERSION),
  platform: z.literal("kick"),
  source: z.literal("Kick Developer Public API"),
  fetchedAt: date,
  profile: z.object({
    id: z.string().regex(/^\d+$/),
    slug: z.string().regex(/^[a-z0-9_-]{1,25}$/),
    displayName: z.string(),
    description: z.string().nullable(),
    profileImageUrl: url,
  }),
  channel: z.object({ title: z.string().nullable(), category: z.string().nullable(), bannerUrl: url }),
  stream: z.object({ isLive: z.boolean().nullable(), viewers: z.number().int().nonnegative().nullable(), startedAt: date.nullable() }),
  ai: z.object({
    status: z.enum(["available", "unavailable"]),
    reason: z.string().nullable(),
    findings: z.array(z.object({
      evidenceId: z.string(), evidence: z.string(), title: z.string(),
      possibleImpact: z.string(), fix: z.string(), test: z.string(),
    })).max(3),
  }),
});

export function readKickAudit(payload: unknown, expectedSlug: string): KickAudit {
  const result = schema.safeParse(payload);
  if (!result.success) throw new Error("Kick did not return a verified report. Deploy the updated Kick audit service first.");
  if (result.data.profile.slug !== expectedSlug) throw new Error("Kick returned a different channel. Please retry.");
  return result.data as KickAudit;
}
