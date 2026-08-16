import { useState, useEffect, useRef } from "react";
import { Plus, Link2, FileText, FileUp, Trash2, ChevronDown, Loader2, BookOpen } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { guestStorage } from "@/lib/guestStorage";
import { callEdgeFunction } from "@/lib/edgeFunction";

type Insight = { category: string; insight: string };
type KnowledgeEntry = {
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
  { value: "nifimas", label: "🤝 Friendship" },
  { value: "brozeen", label: "💼 Promoter & Closer" },
  { value: "bigstreamer", label: "🎤 Expert Proof (Backup)" },
];

export function KnowledgeBase() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"text" | "url" | "file">("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [url, setUrl] = useState("");
  const [persona, setPersona] = useState("shared");
  const [analyzing, setAnalyzing] = useState(false);
  const [expandedInsights, setExpandedInsights] = useState<Record<string, boolean>>({});
  const [fileData, setFileData] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileMime, setFileMime] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchEntries();
  }, [user?.id]);

  const fetchEntries = async () => {
    if (!user) {
      setEntries(guestStorage.knowledge.list());
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("knowledge_entries")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load knowledge entries");
      console.error(error);
    } else {
      setEntries((data || []).map((d: any) => ({
        ...d,
        insights: Array.isArray(d.insights) ? d.insights : [],
      })));
    }
    setLoading(false);
  };

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { toast.error("File must be under 20MB"); return; }
    if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
    const isText = file.type.startsWith("text/") || /\.(txt|md|csv|text|json|log)$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => toast.error("Couldn't read that file");
    if (isText) {
      reader.onload = () => { setContent(String(reader.result || "")); setFileData(""); setFileName(""); setFileMime(""); };
      reader.readAsText(file);
    } else {
      reader.onload = () => { setContent(""); setFileData(String(reader.result || "")); setFileName(file.name); setFileMime(file.type || "application/octet-stream"); };
      reader.readAsDataURL(file);
    }
  };

  const handleAdd = async () => {
    const hasSource = dialogMode === "url" ? url.trim() : (content.trim() || fileData);
    if (!title.trim() || !hasSource) {
      toast.error(dialogMode === "url" ? "Title and URL are required" : "Title and content or file are required");
      return;
    }

    setAnalyzing(true);
    let insights: Insight[] = [];
    let entryContent = dialogMode === "url" ? `URL: ${url}` : content;

    try {
      const data = await callEdgeFunction<{ result?: string; extractedContent?: string }>("analyze-knowledge", {
        content: dialogMode === "url" ? "" : content,
        url: dialogMode === "url" ? url : undefined,
        fileData: dialogMode === "file" && fileData ? fileData : undefined,
        fileName: dialogMode === "file" && fileData ? fileName : undefined,
        fileMime: dialogMode === "file" && fileData ? fileMime : undefined,
        type: "knowledge",
        persona,
      });
      if (data.extractedContent) entryContent = data.extractedContent;
      try {
        const cleaned = String(data.result || "").replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        insights = JSON.parse(cleaned);
      } catch {
        console.warn("Could not parse insights:", data.result);
      }
      if (insights.length === 0) {
        throw new Error("The AI returned no usable insights. Please try again or paste more detailed text.");
      }
    } catch (e) {
      console.error("Analysis error:", e);
      toast.error(e instanceof Error ? e.message : "Couldn't analyze that source");
      setAnalyzing(false);
      return;
    }


    const { error } = user
      ? await supabase.from("knowledge_entries").insert({
          title,
          source_type: dialogMode,
          source_url: dialogMode === "url" ? url : null,
          content: entryContent,
          persona,
          category: "General",
          insights,
          user_id: user.id,
        })
      : { error: null as null | Error };

    if (!user) {
      guestStorage.knowledge.insert({
        title,
        source_type: dialogMode,
        source_url: dialogMode === "url" ? url : null,
        content: entryContent,
        persona,
        category: "General",
        insights,
      });
    }

    if (error) {
      toast.error("Failed to save entry");
    } else {
      toast.success(`Knowledge added with ${insights.length} insights!`);
      setTitle("");
      setContent("");
      setUrl("");
      setFileData(""); setFileName(""); setFileMime("");
      if (fileRef.current) fileRef.current.value = "";
      setDialogOpen(false);
      fetchEntries();
    }
    setAnalyzing(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = user
      ? await supabase.from("knowledge_entries").delete().eq("id", id)
      : { error: null as null | Error };

    if (!user) {
      guestStorage.knowledge.remove(id);
    }

    if (error) toast.error("Failed to delete");
    else {
      toast.success("Deleted");
      setEntries((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const toggleInsights = (id: string) => {
    setExpandedInsights((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-2">
          <h2 className="text-sm font-bold text-foreground">What is the Knowledge Base for?</h2>
          <p className="text-sm text-muted-foreground">
            This is your AI's brain for <span className="text-foreground font-medium">what to say and why it works</span>. Every reply
            generated in the Conversation Inbox is checked against what you put here first.
          </p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-5">
            <li><span className="text-foreground font-medium">Sales psychology & closing frameworks</span> — paste articles, notes, or a YouTube/blog link.</li>
            <li><span className="text-foreground font-medium">Objection handling</span> — "is this a bot?", "no budget", "send proof" (use the Objection Handling tab for pairs).</li>
            <li><span className="text-foreground font-medium">Your offer details</span> — what promotion you sell, packages, pricing, turnaround, proof/results.</li>
            <li><span className="text-foreground font-medium">Winning DMs & hooks</span> — messages that actually got replies or payments.</li>
            <li><span className="text-foreground font-medium">Niche facts</span> — Twitch/Kick growth tips, retention, overlays, clip strategy.</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            Assign each entry to a role so it only affects that voice: Friendship (rapport), Promoter & Closer (value, objections, and conversion), Expert Proof
            (proposal + pricing), or Both. Use <span className="text-foreground font-medium">Training Memory</span> instead when you want to
            teach the AI <em>how you type</em>, not what to say.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-2 flex-wrap">

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              className="border-border text-foreground"
              onClick={() => { setDialogMode("text"); setDialogOpen(true); }}
            >
              <FileText className="h-4 w-4 mr-2" /> Add Text
            </Button>
          </DialogTrigger>
          <Button
            variant="outline"
            className="border-border text-foreground"
            onClick={() => { setDialogMode("url"); setDialogOpen(true); }}
          >
            <Link2 className="h-4 w-4 mr-2" /> Add URL
          </Button>
          <Button variant="outline" className="border-border text-foreground" onClick={() => { setDialogMode("file"); setDialogOpen(true); }}>
            <FileUp className="h-4 w-4 mr-2" /> Upload File
          </Button>
          <DialogContent className="bg-card border-border">
            <DialogHeader>
              <DialogTitle className="text-foreground">
                {dialogMode === "url" ? "Add URL Source" : dialogMode === "file" ? "Upload Knowledge File" : "Add Text Content"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div>
                <Label className="text-foreground">Title</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Sales Psychology Techniques"
                  className="bg-muted border-border text-foreground"
                />
              </div>
              {dialogMode === "url" ? (
                <div>
                  <Label className="text-foreground">URL</Label>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://youtube.com/watch?v=..."
                    className="bg-muted border-border text-foreground"
                  />
                </div>
              ) : dialogMode === "file" ? (
                <div>
                  <Label className="text-foreground">Upload a file (PDF, Word, text, image — up to 20MB)</Label>
                  <Input ref={fileRef} type="file" accept=".txt,.md,.csv,.text,.json,.log,.pdf,.doc,.docx,text/*,application/pdf,image/*" onChange={handleFile} className="bg-muted border-border text-foreground" />
                  {content && <p className="text-xs text-muted-foreground mt-1">{content.length} characters loaded.</p>}
                  {fileData && <p className="text-xs text-muted-foreground mt-1">📎 {fileName} attached — the AI will read it.</p>}
                </div>
              ) : (
                <div>
                  <Label className="text-foreground">Content</Label>
                  <Textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste sales content, scripts, strategies..."
                    className="bg-muted border-border text-foreground min-h-[120px]"
                  />
                </div>
              )}
              <div>
                <Label className="text-foreground">Assign to Persona</Label>
                <Select value={persona} onValueChange={setPersona}>
                  <SelectTrigger className="bg-muted border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border">
                    {personas.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleAdd}
                disabled={analyzing}
                className="w-full gradient-primary text-primary-foreground"
              >
                {analyzing ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing & Saving...</>
                ) : (
                  <><Plus className="h-4 w-4 mr-2" /> Add & Extract Insights</>
                )}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Entries list */}
      <div className="space-y-3">
        {entries.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="p-8 text-center text-muted-foreground">
              <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p>No knowledge entries yet. Add content to make your AI smarter!</p>
            </CardContent>
          </Card>
        ) : (
          entries.map((entry) => (
            <Card key={entry.id} className="bg-card border-border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-foreground">{entry.title}</h3>
                      {entry.source_url && (
                        <Badge variant="outline" className="text-xs border-primary text-primary">URL</Badge>
                      )}
                      <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                        {entry.persona === "shared" ? "both" : entry.persona}
                      </Badge>
                    </div>
                    {entry.source_url && (
                      <p className="text-xs text-muted-foreground truncate max-w-md">{entry.source_url}</p>
                    )}

                    {entry.insights.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() => toggleInsights(entry.id)}
                          className="text-xs text-primary hover:underline cursor-pointer"
                        >
                          ✨ Learned {entry.insights.length} insights
                          {expandedInsights[entry.id] ? " ▲" : " ▼"}
                        </button>
                        {expandedInsights[entry.id] && (
                          <div className="mt-2 space-y-1.5">
                            {entry.insights.map((ins, i) => (
                              <div key={i} className="flex gap-2 items-start">
                                <Badge variant="outline" className="text-xs border-secondary text-secondary shrink-0">
                                  {ins.category}
                                </Badge>
                                <span className="text-xs text-muted-foreground">{ins.insight}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive/80"
                    onClick={() => handleDelete(entry.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
