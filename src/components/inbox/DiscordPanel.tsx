import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Link2, ClipboardPaste, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export type DiscordContactFields = {
  discord_channel_id: string | null;
  discord_user_id: string | null;
  discord_sync_enabled: boolean | null;
  discord_persona: string | null;
  discord_last_synced_at: string | null;
};

type Props = {
  contactId: string;
  persona: string;
  discord: DiscordContactFields;
  signedIn: boolean;
  onChanged: () => void;
};

const SYNC_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/discord-sync`;

/** Parses a pasted Discord DM transcript into ordered messages. */
export function parseDiscordTranscript(raw: string, theirName: string) {
  const lines = raw.replace(/\r/g, "").split("\n");
  const headerRe = /^(.{1,60}?)\s*(?:—|-|·)?\s*(?:Today at|Yesterday at|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}:\d{2}\s?(?:AM|PM))/i;
  const out: { role: "user" | "assistant"; content: string }[] = [];
  let current: { role: "user" | "assistant"; content: string } | null = null;
  const theirs = theirName.trim().toLowerCase();

  for (const line of lines) {
    const m = line.match(headerRe);
    if (m) {
      if (current && current.content.trim()) out.push({ ...current, content: current.content.trim() });
      const author = m[1].trim().toLowerCase();
      const isThem = theirs ? author.includes(theirs) || theirs.includes(author) : true;
      current = { role: isThem ? "user" : "assistant", content: "" };
      continue;
    }
    if (!line.trim()) { if (current) current.content += "\n"; continue; }
    if (!current) current = { role: "user", content: "" };
    current.content += (current.content ? "\n" : "") + line;
  }
  if (current && current.content.trim()) out.push({ ...current, content: current.content.trim() });

  if (out.length === 0 && raw.trim()) return [{ role: "user" as const, content: raw.trim() }];
  return out;
}

export const DiscordPanel = ({ contactId, persona, discord, signedIn, onChanged }: Props) => {
  const [linkOpen, setLinkOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [channelId, setChannelId] = useState(discord.discord_channel_id || "");
  const [userId, setUserId] = useState(discord.discord_user_id || "");
  const [enabled, setEnabled] = useState(!!discord.discord_sync_enabled);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [raw, setRaw] = useState("");
  const [theirName, setTheirName] = useState("");
  const [importing, setImporting] = useState(false);

  const linked = !!(discord.discord_channel_id || discord.discord_user_id);

  const saveLink = async () => {
    if (!signedIn) { toast.error("Sign in to link Discord"); return; }
    setSaving(true);
    const { error } = await (supabase.from("streamer_contacts" as any).update({
      discord_channel_id: channelId.trim() || null,
      discord_user_id: userId.trim() || null,
      discord_sync_enabled: enabled && !!(channelId.trim() || userId.trim()),
      discord_persona: persona,
    }).eq("id", contactId) as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Discord link saved");
    setLinkOpen(false);
    onChanged();
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(SYNC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ contactId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || `Error ${resp.status}`);
      toast.success(data.imported ? `Imported ${data.imported} Discord message(s)` : "No new Discord messages");
      onChanged();
    } catch (e: any) {
      toast.error(e.message || "Sync failed");
    }
    setSyncing(false);
  };

  const importPaste = async () => {
    const parsed = parseDiscordTranscript(raw, theirName);
    if (!parsed.length) { toast.error("Nothing to import"); return; }
    if (!signedIn) { toast.error("Sign in to import"); return; }
    setImporting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const rows = parsed.map((p) => ({
      contact_id: contactId,
      user_id: user?.id,
      role: p.role,
      content: p.content,
      persona,
      source: "discord_paste",
      selected: false,
    }));
    const { error } = await (supabase.from("contact_messages" as any).insert(rows) as any);
    setImporting(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Imported ${rows.length} message(s)`);
    setRaw("");
    setPasteOpen(false);
    onChanged();
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="border-border text-muted-foreground">
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            {linked ? "Discord linked" : "Link Discord"}
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Link this streamer to Discord</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Turn on Developer Mode in Discord (Settings → Advanced), then right-click the DM or channel → Copy Channel ID.
              Only conversations the bot is part of can be auto-synced — for your own personal DMs use the Paste bridge instead.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Channel / DM ID</Label>
              <Input value={channelId} onChange={(e) => setChannelId(e.target.value)} placeholder="123456789012345678" className="bg-muted border-border text-foreground font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Their Discord user ID (optional)</Label>
              <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Used to open a bot DM" className="bg-muted border-border text-foreground font-mono" />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Auto-sync replies</p>
                <p className="text-xs text-muted-foreground">Checks for new messages every minute.</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>
            <Button onClick={saveLink} disabled={saving} className="w-full gradient-primary text-primary-foreground">
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="border-border text-muted-foreground">
            <ClipboardPaste className="h-3.5 w-3.5 mr-1.5" /> Paste DM
          </Button>
        </DialogTrigger>
        <DialogContent className="bg-card border-border">
          <DialogHeader><DialogTitle className="text-foreground">Paste your Discord DM</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Select the messages in Discord, copy, and paste here. Names and timestamps are detected automatically and split into the right sides of the conversation.
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs text-foreground">Their Discord name</Label>
              <Input value={theirName} onChange={(e) => setTheirName(e.target.value)} placeholder="e.g. ninjaquake" className="bg-muted border-border text-foreground" />
            </div>
            <Textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"ninjaquake — Today at 5:12 PM\nyo whats up\nyou — Today at 5:14 PM\nhey! loved your last stream"} className="bg-muted border-border text-foreground min-h-[180px] font-mono text-xs" />
            {raw.trim() && (
              <p className="text-xs text-muted-foreground">{parseDiscordTranscript(raw, theirName).length} message(s) detected</p>
            )}
            <Button onClick={importPaste} disabled={importing || !raw.trim()} className="w-full gradient-primary text-primary-foreground">
              {importing ? "Importing..." : "Import into conversation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {linked && (
        <Button variant="ghost" size="sm" onClick={syncNow} disabled={syncing} className="text-muted-foreground">
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} /> Sync now
        </Button>
      )}
      {discord.discord_sync_enabled && <Badge variant="outline" className="text-[10px] border-secondary/40 text-secondary">Auto-sync on</Badge>}
    </div>
  );
};
