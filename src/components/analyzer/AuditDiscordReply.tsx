import { useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ChannelAudit } from "@/lib/channelAudit";
import type { KickAudit } from "@/lib/kickAudit";
import { buildAuditDiscordReply } from "@/lib/auditDiscordReply";

export function AuditDiscordReply({ audit, compact = false }: { audit: ChannelAudit | KickAudit; compact?: boolean }) {
  const [notice, setNotice] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);
  const message = buildAuditDiscordReply(audit);

  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopyFailed(false);
      setNotice("Copied. Go back to the Discord conversation where you received this report and paste the message.");
    } catch {
      setCopyFailed(true);
      setNotice("Copy the suggested message below, then paste it into the Discord conversation where you received this report.");
    }
  };

  return <Card className="border-primary/50 bg-gradient-to-r from-primary/10 to-orange-500/10">
    <CardContent className="space-y-3 p-5 sm:p-6">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-primary"><MessageCircle className="h-4 w-4" aria-hidden="true" />Your next step</p>
      <h2 className="text-xl font-bold">Ask the person who sent this report how to fix the first priority</h2>
      <p className="text-sm text-muted-foreground">Reply in the same Discord conversation where you received this audit. Ask for a walkthrough of the first change and, if useful, a short call to plan the setup. You do not need to connect your streaming account or share a password.</p>
      {(!compact || copyFailed) && <div>
        <label htmlFor={compact ? "audit-discord-message-bottom" : "audit-discord-message-top"} className="text-sm font-semibold">Suggested message to send</label>
        <textarea id={compact ? "audit-discord-message-bottom" : "audit-discord-message-top"} readOnly value={message} onFocus={(event) => event.currentTarget.select()} rows={5} className="mt-2 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
      </div>}
      <Button type="button" onClick={() => void copyMessage()}><Copy className="mr-2 h-4 w-4" aria-hidden="true" />Copy question for Discord</Button>
      {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
      <p className="text-xs text-muted-foreground">This copies a message; it does not send anything or open a new Discord chat.</p>
    </CardContent>
  </Card>;
}
