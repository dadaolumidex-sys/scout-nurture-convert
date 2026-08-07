import { useState, useEffect, useRef } from "react";
import { Loader2, Trash2, ShieldCheck, FileUp, Link2, Type, Plus, ChevronDown } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { guestStorage } from "@/lib/guestStorage";
import { DEFAULT_OBJECTION_PAIRS } from "@/lib/defaultObjections";


type Insight = { category: string; insight: string };
type Entry = {
  id: string;
  title: string;
  source_type: string;
  source_url: string | null;
  content: string;
  persona: string;
  category: string;
  insights: Insight[];
  created_at: string;
};

const personas = [
  { value: "shared", label: "Both Personas" },
  { value: "nifimas", label: "🤝 Nifimas (Friend)" },
  { value: "brozeen", label: "💼 Brozeen (Promoter)" },
];

const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-knowledge`;

export function ObjectionHandling() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"text" | "file" | "url" | "manual">("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [persona, setPersona] = useState("shared");
  const [objection, setObjection] = useState("");
  const [response, setResponse] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [fileData, setFileData] = useState("");      // base64 data URL for non-text files (PDF, docx, images)
  const [fileName, setFileName] = useState("");
  const [fileMime, setFileMime] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchEntries();
  }, [user?.id]);

  const fetchEntries = async () => {
    setLoading(true);
    if (!user) {
      const all = guestStorage.knowledge.list() as Entry[];
      setEntries(all.filter((e) => (e.category || "").toLowerCase().includes("objection")));
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("knowledge_entries")
      .select("*")
      .eq("category", "Objection Handling")
      .order("created_at", { ascending: false });
    if (error) toast.error("Failed to load objections");
    else setEntries((data || []).map((d: any) => ({ ...d, insights: Array.isArray(d.insights) ? d.insights : [] })));
    setLoading(false);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("File must be under 20MB"); return; }

    // reset any previous file selection
    setContent(""); setFileData(""); setFileName(""); setFileMime("");
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));

    const name = file.name.toLowerCase();
    const isText =
      file.type.startsWith("text/") ||
      /\.(txt|md|csv|text|json|log)$/.test(name);

    const reader = new FileReader();
    if (isText) {
      reader.onload = () => {
        setContent(String(reader.result || ""));
        toast.success("File loaded — now click Analyze & Save");
      };
      reader.onerror = () => toast.error("Couldn't read that file");
      reader.readAsText(file);
    } else {
      // PDFs, Word docs, images → send the raw file to the AI for text extraction
      reader.onload = () => {
        setFileData(String(reader.result || ""));
        setFileName(file.name);
        setFileMime(file.type || "application/octet-stream");
        toast.success("File attached — now click Analyze & Save");
      };
      reader.onerror = () => toast.error("Couldn't read that file");
      reader.readAsDataURL(file);
    }
  };

  const saveEntry = async (payload: {
    title: string; content: string; source_type: string; source_url: string | null; insights: Insight[];
  }) => {
    if (user) {
      const { error } = await supabase.from("knowledge_entries").insert({
        ...payload, persona, category: "Objection Handling", user_id: user.id,
      });
      if (error) { toast.error("Failed to save"); return false; }
    } else {
      guestStorage.knowledge.insert({ ...payload, persona, category: "Objection Handling" });
    }
    return true;
  };

  const handleManualAdd = async () => {
    if (!objection.trim() || !response.trim()) {
      toast.error("Enter both the objection and how to handle it");
      return;
    }
    setSaving(true);
    const insight = `Objection: ${objection.trim()} → Response: ${response.trim()}`;
    const ok = await saveEntry({
      title: objection.trim().slice(0, 60),
      content: insight,
      source_type: "manual",
      source_url: null,
      insights: [{ category: "Objection Handling", insight }],
    });
    if (ok) {
      toast.success("Objection saved to your playbook!");
      setObjection(""); setResponse("");
      fetchEntries();
    }
    setSaving(false);
  };

  const handleAnalyze = async () => {
    const hasSource = mode === "url" ? url.trim() : (content.trim() || fileData);
    if (!title.trim() || !hasSource) {
      toast.error(mode === "url" ? "Add a title and URL" : "Add a title and content");
      return;
    }
    setSaving(true);
    let insights: Insight[] = [];
    let extracted = content;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const resp = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          content: mode === "url" ? "" : content,
          url: mode === "url" ? url : undefined,
          fileData: mode === "file" && fileData ? fileData : undefined,
          fileName: mode === "file" && fileData ? fileName : undefined,
          fileMime: mode === "file" && fileData ? fileMime : undefined,
          type: "objection",
          persona,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.error(data.error || "Couldn't analyze that source");
        setSaving(false);
        return;
      }
      if (data.extractedContent) extracted = data.extractedContent;
      try {
        const cleaned = String(data.result || "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) {
          insights = parsed
            .filter((p: any) => p && p.insight)
            .map((p: any) => ({ category: "Objection Handling", insight: String(p.insight) }));
        }
      } catch {
        console.warn("Could not parse objection insights:", data.result);
      }
    } catch (e) {
      console.error(e);
      toast.error("Analysis failed");
      setSaving(false);
      return;
    }

    if (insights.length === 0) {
      toast.error("No objections found in that source. Try adding them manually.");
      setSaving(false);
      return;
    }

    const ok = await saveEntry({
      title: title.trim(),
      content: extracted || content,
      source_type: mode,
      source_url: mode === "url" ? url : null,
      insights,
    });
    if (ok) {
      toast.success(`Saved ${insights.length} objection responses to your playbook!`);
      setTitle(""); setContent(""); setUrl("");
      setFileData(""); setFileName(""); setFileMime("");
      if (fileRef.current) fileRef.current.value = "";
      fetchEntries();
    }
    setSaving(false);
  };

  const handleSeedDefaults = async () => {
    setSaving(true);
    const insights = DEFAULT_OBJECTION_PAIRS.map((p) => ({
      category: "Objection Handling",
      insight: `Objection: ${p.objection} → Response: ${p.response}`,
    }));
    const ok = await saveEntry({
      title: "Starter playbook — common streamer objections",
      content: insights.map((i) => i.insight).join("\n\n"),
      source_type: "manual",
      source_url: null,
      insights,
    });
    if (ok) {
      toast.success("Starter playbook added");
      fetchEntries();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {

    if (user) {
      const { error } = await supabase.from("knowledge_entries").delete().eq("id", id);
      if (error) { toast.error("Failed to delete"); return; }
    } else {
      guestStorage.knowledge.remove(id);
    }
    setEntries((prev) => prev.filter((e) => e.id !== id));
    toast.success("Removed");
  };

  const totalObjections = entries.reduce((n, e) => n + (e.insights?.length || 0), 0);

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Build your <span className="text-foreground font-medium">Objection Handling playbook</span>. Paste sales/psychology content,
              upload a text file, or drop a link (YouTube description, article, social post). The AI extracts the objections and the best
              responses — then uses them automatically when helping you reply in AI Chat and the Inbox.
            </p>
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList className="bg-muted border border-border flex-wrap h-auto">
              <TabsTrigger value="text"><Type className="h-3.5 w-3.5 mr-1" /> Paste Text</TabsTrigger>
              <TabsTrigger value="file"><FileUp className="h-3.5 w-3.5 mr-1" /> Upload File</TabsTrigger>
              <TabsTrigger value="url"><Link2 className="h-3.5 w-3.5 mr-1" /> From Link</TabsTrigger>
              <TabsTrigger value="manual"><Plus className="h-3.5 w-3.5 mr-1" /> Manual</TabsTrigger>
            </TabsList>
          </Tabs>

          {mode === "manual" ? (
            <div className="space-y-3">
              <div>
                <Label className="text-foreground">The objection (buyer's words)</Label>
                <Input value={objection} onChange={(e) => setObjection(e.target.value)}
                  placeholder="e.g., It's too expensive / I need to think about it"
                  className="bg-muted border-border text-foreground" />
              </div>
              <div>
                <Label className="text-foreground">How to handle it</Label>
                <Textarea value={response} onChange={(e) => setResponse(e.target.value)}
                  placeholder="Your best response / reframe to overcome it..."
                  className="bg-muted border-border text-foreground min-h-[90px]" />
              </div>
              <PersonaSelect persona={persona} setPersona={setPersona} />
              <Button onClick={handleManualAdd} disabled={saving} className="gradient-primary text-primary-foreground">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</> : <><Plus className="h-4 w-4 mr-2" /> Add to Playbook</>}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label className="text-foreground">Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., 'Price objections masterclass'"
                  className="bg-muted border-border text-foreground" />
              </div>

              {mode === "url" ? (
                <div>
                  <Label className="text-foreground">Link (YouTube, article, social post)</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="bg-muted border-border text-foreground" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Tip: some sites (like YouTube video pages) block bots. If a link can't be read, paste the transcript/text instead.
                  </p>
                </div>
              ) : mode === "file" ? (
                <div>
                  <Label className="text-foreground">Upload a file (PDF, Word, text, image — up to 20MB)</Label>
                  <Input ref={fileRef} type="file"
                    accept=".txt,.md,.csv,.text,.json,.log,.pdf,.doc,.docx,text/*,application/pdf,image/*"
                    onChange={handleFile}
                    className="bg-muted border-border text-foreground" />
                  {content && <p className="text-xs text-muted-foreground mt-1">{content.length} characters loaded.</p>}
                  {fileData && <p className="text-xs text-muted-foreground mt-1">📎 {fileName} attached — the AI will read it.</p>}
                </div>
              ) : (
                <div>
                  <Label className="text-foreground">Paste content</Label>
                  <Textarea value={content} onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste a sales script, transcript, or objection-handling notes..."
                    className="bg-muted border-border text-foreground min-h-[120px]" />
                </div>
              )}

              <PersonaSelect persona={persona} setPersona={setPersona} />
              <Button onClick={handleAnalyze} disabled={saving} className="gradient-primary text-primary-foreground">
                {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing & Saving...</> : <><ShieldCheck className="h-4 w-4 mr-2" /> Analyze & Save</>}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Your Playbook — <span className="text-foreground font-medium">{totalObjections}</span> objection responses
        </p>
        <Button variant="outline" size="sm" onClick={handleSeedDefaults} disabled={saving}
          className="border-primary/30 text-primary hover:bg-primary/10">
          <Plus className="h-3.5 w-3.5 mr-1" /> Add starter playbook
        </Button>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        The AI already uses a built-in baseline for "is this a bot?", "no budget" and "send me proof" — your own saved responses always take priority.
      </p>


      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : entries.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center text-muted-foreground">
            <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No objections saved yet. Add content above to start building your playbook.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <Card key={entry.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-medium text-foreground">{entry.title}</h3>
                      <Badge variant="outline" className="text-xs border-primary text-primary">
                        {entry.insights?.length || 0} responses
                      </Badge>
                      {entry.source_url && (
                        <Badge variant="outline" className="text-xs border-border text-muted-foreground">link</Badge>
                      )}
                    </div>
                    <Collapsible open={expanded[entry.id]} onOpenChange={() => setExpanded((p) => ({ ...p, [entry.id]: !p[entry.id] }))}>
                      <CollapsibleTrigger className="flex items-center gap-1 text-xs text-primary hover:underline">
                        <ChevronDown className={`h-3 w-3 transition-transform ${expanded[entry.id] ? "rotate-180" : ""}`} />
                        {expanded[entry.id] ? "Hide" : "View"} responses
                      </CollapsibleTrigger>
                      <CollapsibleContent className="mt-2 space-y-2">
                        {(entry.insights || []).map((ins, i) => {
                          const [obj, res] = ins.insight.split("→ Response:");
                          return (
                            <div key={i} className="rounded-lg bg-muted/50 border border-border p-2.5 text-xs">
                              <p className="text-foreground font-medium">{obj.replace(/^Objection:\s*/i, "🗣️ ").trim()}</p>
                              {res && <p className="text-muted-foreground mt-1">💬 {res.trim()}</p>}
                            </div>
                          );
                        })}
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive/80 shrink-0"
                    onClick={() => handleDelete(entry.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PersonaSelect({ persona, setPersona }: { persona: string; setPersona: (v: string) => void }) {
  return (
    <div>
      <Label className="text-foreground">Use with</Label>
      <Select value={persona} onValueChange={setPersona}>
        <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
        <SelectContent className="bg-card border-border">
          {personas.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
