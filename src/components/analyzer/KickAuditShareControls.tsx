import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Link2, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { createKickAuditShare, listKickAuditShares, revokeKickAuditShare, type AuditShareListItem } from "@/lib/auditShare";
import type { KickAudit } from "@/lib/kickAudit";
import { formatAuditDate } from "@/lib/channelAudit";

export function KickAuditShareControls({ audit, onShared }: { audit: KickAudit; onShared: (report: KickAudit) => void }) {
  const { user } = useAuth();
  const userId = user?.is_anonymous ? undefined : user?.id;
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [links, setLinks] = useState<AuditShareListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    setUrl(""); setMessage(""); setLinks([]); setError("");
    if (userId) void listKickAuditShares().then((rows) => { if (active) setLinks(rows); }).catch(() => {
      if (active) setError("Could not load Kick share links. The sharing backend may need deployment.");
    });
    return () => { active = false; };
  }, [userId, audit.profile.slug]);
  const copy = (value: string) => void navigator.clipboard.writeText(value)
    .then(() => setNotice("Copied."))
    .catch(() => setNotice("Select the text above and copy it manually."));
  if (!userId) return <Card><CardContent className="p-4 text-sm text-muted-foreground"><Link to="/auth" className="text-primary underline">Sign in</Link> to create a shareable Kick report. Recipients do not need an account.</CardContent></Card>;
  return <Card><CardContent className="space-y-3 p-4 sm:p-5">
    <h2 className="font-semibold">Share a Kick channel report</h2>
    <p className="text-sm text-muted-foreground">Create a fresh, read-only Kick snapshot and action plan. The link works for 30 days; no private account details or keys are shared.</p>
    {!url ? <Button disabled={busy} onClick={() => void (async () => {
      setBusy(true); setError(""); setNotice("");
      try {
        const created = await createKickAuditShare(audit.profile.slug);
        setUrl(created.url); setExpiresAt(created.expiresAt);
        setMessage("Hi @" + created.report.profile.slug + ", I reviewed the public presentation of your Kick channel and put together a short action plan with specific changes to test. You can check the facts and all 10 steps here: " + created.url + " No sign-in is needed. If you'd like, we can review your own audience analytics and decide what to improve first.");
        setLinks((current) => [{ id: created.id, channel_login: created.report.profile.slug, created_at: new Date().toISOString(), expires_at: created.expiresAt }, ...current]);
        onShared(created.report);
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the Kick report link."); }
      finally { setBusy(false); }
    })()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Create share link</Button> : <>
      <label htmlFor="kick-share-url" className="text-sm font-medium">Report link</label>
      <div className="flex flex-col gap-2 sm:flex-row"><Input id="kick-share-url" readOnly value={url} onFocus={(event) => event.target.select()} /><Button variant="outline" onClick={() => copy(url)}><Copy className="mr-2 h-4 w-4" />Copy link</Button></div>
      <p className="text-xs text-muted-foreground">Expires {formatAuditDate(expiresAt)}. Save this link now; it cannot be recovered later.</p>
      <label htmlFor="kick-invite" className="text-sm font-medium">Message to send</label>
      <Textarea id="kick-invite" rows={5} value={message} onChange={(event) => setMessage(event.target.value)} />
      <Button variant="outline" onClick={() => copy(message)}><Copy className="mr-2 h-4 w-4" />Copy message</Button>
    </>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {links.length > 0 && <details><summary className="cursor-pointer text-sm font-medium">Manage Kick links ({links.length})</summary>
      <ul className="mt-2 divide-y divide-border">{links.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
        <span>@{item.channel_login} · Expires {formatAuditDate(item.expires_at)}</span>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void (async () => {
          setBusy(true); setError("");
          try { await revokeKickAuditShare(item.id); setLinks((current) => current.filter((link) => link.id !== item.id)); setNotice("Link revoked."); }
          catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke link."); }
          finally { setBusy(false); }
        })()}>Revoke</Button>
      </li>)}</ul>
    </details>}
  </CardContent></Card>;
}
