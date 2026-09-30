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
  stream: z.object({
    isLive: z.boolean().nullable(),
    viewers: z.number().int().nonnegative().nullable(),
    startedAt: date.nullable(),
    thumbnailUrl: url.optional(),
    language: z.string().nullable().optional(),
    tags: z.array(z.string()).max(8).optional(),
  }),
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
  // Older shared reports may contain blank API fields and AI findings that
  // incorrectly describe those fields as empty on the actual channel.
  const audit = result.data as KickAudit;
  const description = audit.profile.description?.trim() || null;
  const title = audit.channel.title?.trim() || null;
  const category = audit.channel.category?.trim() || null;
  const findings = audit.ai.findings.filter((finding) =>
    (finding.evidenceId !== "bio" || description !== null) &&
    (finding.evidenceId !== "title" || title !== null) &&
    (finding.evidenceId !== "category" || category !== null)
  );
  return {
    ...audit,
    profile: { ...audit.profile, description },
    channel: { ...audit.channel, title, category },
    ai: { ...audit.ai, findings },
  };
}
