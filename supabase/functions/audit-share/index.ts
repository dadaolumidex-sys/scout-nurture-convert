import { createAuditShareHandler } from "../_shared/auditShare.ts";

Deno.serve(createAuditShareHandler((name) => Deno.env.get(name)));
