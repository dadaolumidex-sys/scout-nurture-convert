import { createKickAuditHandler } from "../_shared/kickAudit.ts";

Deno.serve(createKickAuditHandler((name) => Deno.env.get(name)));
