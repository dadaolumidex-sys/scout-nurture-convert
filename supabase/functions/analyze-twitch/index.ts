import { createTwitchAuditHandler } from "../_shared/twitchAudit.ts";

Deno.serve(createTwitchAuditHandler((name) => Deno.env.get(name)));
