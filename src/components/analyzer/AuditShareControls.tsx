import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { createAuditShare, listAuditShares, revokeAuditShare, type AuditShareListItem, type CreatedAuditShare } from "@/lib/auditShare";
import { formatAuditDate, type ChannelAudit } from "@/lib/channelAudit";

export function AuditShareControls({ audit, onShared }: { audit: ChannelAudit; onShared: (report: ChannelAudit) => void }) {
  const { user } = useAuth();
  const userId = user?.is_anonymous ? undefined : user?.id;
  const [shared, setShared] = useState<CreatedAuditShare | null>(null);
  const [shares, setShares] = useState<AuditShareListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingLinks, setLoadingLinks] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const locked = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setShared(null); setShares([]); setError(""); setNotice("");
    setLoadingLinks(!!userId);
    if (userId) void listAuditShares().then((rows) => {
      if (generation.current === current) setShares(rows);
    }).catch(() => {
      if (generation.current === current) setError("Could not load existing share links. Sharing may need server setup.");
    }).finally(() => { if (generation.current === current) setLoadingLinks(false); });
    return () => { generation.current = current + 1; };
  }, [userId, audit.profile.login]);

  const run = async (work: () => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(); }
    catch (err) { setError(err instanceof Error ? err.message : "Sharing failed. Please try again."); }
    finally { locked.current = false; setBusy(false); }
  };

  if (!userId) return <Card><CardContent className="p-4 text-sm text-muted-foreground"><Link to="/auth" className="text-primary underline">Sign in</Link> to create and revoke report links. Viewing a shared report does not require an account.</CardContent></Card>;

  return <Card><CardContent className="space-y-3 p-4 sm:p-5">
    <h2 className="font-semibold">Share a public report</h2>
    <p className="text-sm text-muted-foreground">Create a fresh Twitch snapshot that anyone with the link can view for 30 days. It contains public Twitch facts only. Private conversations, account details, and AI data are excluded.</p>
    {!shared ? <Button disabled={busy || loadingLinks} onClick={() => void run(async () => {
      const current = generation.current;
      const created = await createAuditShare(audit.profile.login);
      if (generation.current !== current) return;
      setShared(created); onShared(created.report);
      setShares((rows) => [{ id: created.id, channel_login: created.report.profile.login, created_at: new Date().toISOString(), expires_at: created.expiresAt }, ...rows]);
      setNotice("Link created. The audit below now shows the saved snapshot.");
    })}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}Create share link</Button> : <div className="space-y-2">
      <label htmlFor="audit-share-url" className="text-sm font-medium">Report link</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input id="audit-share-url" readOnly value={shared.url} onFocus={(event) => event.target.select()} />
        <Button variant="outline" onClick={() => void navigator.clipboard.writeText(shared.url).then(() => setNotice("Link copied.")).catch(() => setNotice("Select the report link above and copy it manually."))}><Copy className="mr-2 h-4 w-4" />Copy link</Button>
      </div>
      <p className="text-xs text-muted-foreground">Expires {formatAuditDate(shared.expiresAt)}. Save this link now; it cannot be recovered after leaving this page.</p>
      {(window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") && <p className="text-xs text-muted-foreground">This preview link opens only on this computer. Use the hosted app when sharing with someone else.</p>}
    </div>}
    {notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {shares.length > 0 && <details>
      <summary className="cursor-pointer text-sm font-medium">Manage your active links ({shares.length})</summary>
      <p className="mt-2 text-xs text-muted-foreground">Revoking stops future access. It cannot erase copies someone already saved.</p>
      <ul className="mt-2 divide-y divide-border">{shares.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
        <span className="text-xs">@{item.channel_login} · Created {formatAuditDate(item.created_at)} · Expires {formatAuditDate(item.expires_at)}</span>
        <Button size="sm" variant="outline" disabled={busy} aria-label={`Revoke link for ${item.channel_login} created ${item.created_at}`} onClick={() => void run(async () => {
          await revokeAuditShare(item.id);
          setShares((rows) => rows.filter((row) => row.id !== item.id));
          if (shared?.id === item.id) setShared(null);
          setNotice("Link revoked.");
        })}>Revoke link</Button>
      </li>)}</ul>
    </details>}
  </CardContent></Card>;
}
