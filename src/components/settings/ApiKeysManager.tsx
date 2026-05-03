import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, CheckCircle2, XCircle, Power, Sparkles, Layers, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { ApiKeyRow, Provider, addKey, bulkAddKeys, deleteKey, listKeys, testApifyKey, toggleKey } from "@/lib/apiKeys";

const PROVIDERS: { id: Provider; name: string; placeholder: string; help: string; getUrl: string }[] = [
  { id: "apify", name: "Apify", placeholder: "apify_api_xxx", help: "Used for web search & scraping. Add multiple — auto-rotates on failure.", getUrl: "https://console.apify.com/account/integrations" },
  { id: "gemini", name: "Google Gemini", placeholder: "AIzaSy...", help: "Optional fallback for AI chat.", getUrl: "https://aistudio.google.com/app/apikey" },
  { id: "openai", name: "OpenAI", placeholder: "sk-...", help: "Optional fallback for AI chat.", getUrl: "https://platform.openai.com/api-keys" },
];

export function ApiKeysManager() {
  const [tab, setTab] = useState<Provider>("apify");
  const [keys, setKeys] = useState<Record<Provider, ApiKeyRow[]>>({ apify: [], gemini: [], openai: [] });
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const all = await listKeys();
      const grouped: Record<Provider, ApiKeyRow[]> = { apify: [], gemini: [], openai: [] };
      all.forEach(k => { if (grouped[k.provider as Provider]) grouped[k.provider as Provider].push(k); });
      setKeys(grouped);
    } catch (e: any) { toast.error(e.message || "Failed to load keys"); }
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">API & Connections</h1>
        <p className="text-sm text-muted-foreground">Add multiple keys per provider. The app auto-rotates when one fails or runs out.</p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Provider)}>
        <TabsList className="grid grid-cols-3 w-full">
          {PROVIDERS.map(p => (
            <TabsTrigger key={p.id} value={p.id} className="text-xs sm:text-sm">
              {p.name}
              {keys[p.id].length > 0 && <Badge variant="secondary" className="ml-1.5 h-5 text-[10px]">{keys[p.id].length}</Badge>}
            </TabsTrigger>
          ))}
        </TabsList>

        {PROVIDERS.map(p => (
          <TabsContent key={p.id} value={p.id} className="space-y-3 mt-4">
            <Card className="bg-card border-border">
              <CardContent className="p-4 space-y-1.5">
                <p className="text-xs text-muted-foreground">{p.help}</p>
                <a href={p.getUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">Get a {p.name} key →</a>
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <AddKeyDialog provider={p.id} placeholder={p.placeholder} onAdded={refresh} />
              <BulkAddDialog provider={p.id} onAdded={refresh} />
            </div>

            {loading ? <p className="text-sm text-muted-foreground">Loading...</p> : (
              keys[p.id].length === 0 ? (
                <Card className="bg-card border-border border-dashed">
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    No {p.name} keys yet. Add one to get started.
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {keys[p.id].map(k => <KeyRow key={k.id} k={k} onChange={refresh} />)}
                </div>
              )
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function KeyRow({ k, onChange }: { k: ApiKeyRow; onChange: () => void }) {
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const masked = k.api_key.length > 10 ? `${k.api_key.slice(0, 6)}••••${k.api_key.slice(-4)}` : "••••";
  const handleTest = async () => {
    if (k.provider !== "apify") { toast.message("Test only available for Apify"); return; }
    setTesting(true);
    const ok = await testApifyKey(k.api_key);
    setTesting(false);
    ok ? toast.success(`${k.label} works`) : toast.error(`${k.label} is invalid`);
  };
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3 flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full shrink-0 ${k.is_active ? (k.failure_count > 0 ? "bg-yellow-500" : "bg-green-500") : "bg-destructive"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate">{k.label}</p>
            {k.failure_count > 0 && <Badge variant="outline" className="text-[10px] border-yellow-500/50 text-yellow-500">{k.failure_count} fails</Badge>}
            {!k.is_active && <Badge variant="destructive" className="text-[10px]">Disabled</Badge>}
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate">{show ? k.api_key : masked}</p>
          {k.last_error && <p className="text-[10px] text-destructive truncate">{k.last_error}</p>}
        </div>
        <button onClick={() => setShow(!show)} className="text-muted-foreground hover:text-foreground p-1.5">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
        <Button size="sm" variant="ghost" onClick={handleTest} disabled={testing} className="h-8 px-2 text-xs">
          {testing ? "..." : "Test"}
        </Button>
        <button onClick={async () => { await toggleKey(k.id, !k.is_active); onChange(); }} className="text-muted-foreground hover:text-foreground p-1.5" title={k.is_active ? "Disable" : "Enable"}>
          <Power className="h-4 w-4" />
        </button>
        <button onClick={async () => { if (confirm(`Delete ${k.label}?`)) { await deleteKey(k.id); onChange(); toast.success("Deleted"); } }} className="text-destructive hover:text-destructive/80 p-1.5">
          <Trash2 className="h-4 w-4" />
        </button>
      </CardContent>
    </Card>
  );
}

function AddKeyDialog({ provider, placeholder, onAdded }: { provider: Provider; placeholder: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!key.trim()) { toast.error("Enter a key"); return; }
    setSaving(true);
    try { await addKey(provider, label || `Key ${Date.now() % 1000}`, key); toast.success("Key added"); setOpen(false); setLabel(""); setKey(""); onAdded(); }
    catch (e: any) { toast.error(e.message || "Failed"); }
    setSaving(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex-1 gradient-primary text-primary-foreground gap-1.5"><Plus className="h-4 w-4" /> Add Key</Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">Add API Key</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Label (e.g. Main, Backup)" value={label} onChange={e => setLabel(e.target.value)} className="bg-muted border-border text-foreground" />
          <Input placeholder={placeholder} value={key} onChange={e => setKey(e.target.value)} className="bg-muted border-border text-foreground font-mono" />
          <Button onClick={save} disabled={saving} className="w-full gradient-primary text-primary-foreground">{saving ? "Saving..." : "Save Key"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function BulkAddDialog({ provider, onAdded }: { provider: Provider; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!text.trim()) { toast.error("Paste some keys"); return; }
    setSaving(true);
    try { const n = await bulkAddKeys(provider, text); toast.success(`Added ${n} keys`); setOpen(false); setText(""); onAdded(); }
    catch (e: any) { toast.error(e.message || "Failed"); }
    setSaving(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex-1 border-border gap-1.5"><Layers className="h-4 w-4" /> Bulk Add</Button>
      </DialogTrigger>
      <DialogContent className="bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">Bulk Add Keys</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">One per line. Use <span className="font-mono text-foreground">label:key</span> to name them, or just paste keys.</p>
          <Textarea placeholder={"Main:apify_xxx\nBackup:apify_yyy\napify_zzz"} value={text} onChange={e => setText(e.target.value)} className="bg-muted border-border text-foreground font-mono min-h-[160px]" />
          <Button onClick={save} disabled={saving} className="w-full gradient-primary text-primary-foreground">{saving ? "Adding..." : "Add All"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
