import { useState, useEffect, useRef } from "react";
import { Upload, FileUp, Link2, Type, Trash2, Loader2, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { guestStorage } from "@/lib/guestStorage";
import { callEdgeFunction } from "@/lib/edgeFunction";

type TrainingConvo = {
  id: string;
  title: string;
  persona: string;
  source_type: string;
  content: string;
  style_analysis: string | null;
  status: string;
  created_at: string;
};

export function TrainingMemory() {
  const { user } = useAuth();
  const [convos, setConvos] = useState<TrainingConvo[]>([]);
  const [loading, setLoading] = useState(true);
  const [personaTab, setPersonaTab] = useState("nifimas");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceMode, setSourceMode] = useState<"text" | "file" | "url">("text");
  const [url, setUrl] = useState("");
  const [fileData, setFileData] = useState("");
  const [fileName, setFileName] = useState("");
  const [fileMime, setFileMime] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    fetchConvos();
  }, [user?.id]);

  const fetchConvos = async () => {
    if (!user) {
      setConvos(guestStorage.training.list());
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("training_conversations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load training data");
    } else {
      setConvos(data || []);
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
    const hasSource = sourceMode === "url" ? url.trim() : (content.trim() || fileData);
    if (!title.trim() || !hasSource) {
      toast.error(sourceMode === "url" ? "Title and URL are required" : "Title and conversation content are required");
      return;
    }

    setAnalyzing(true);
    let styleAnalysis: string | null = null;

    try {
      const data = await callEdgeFunction<{ result?: string; extractedContent?: string }>("analyze-knowledge", {
        content: sourceMode === "url" ? "" : content,
        url: sourceMode === "url" ? url : undefined,
        fileData: sourceMode === "file" && fileData ? fileData : undefined,
        fileName: sourceMode === "file" && fileData ? fileName : undefined,
        fileMime: sourceMode === "file" && fileData ? fileMime : undefined,
        type: "training",
        persona: personaTab,
      });
      styleAnalysis = data.result?.trim() || null;
      if (!styleAnalysis) throw new Error("The AI returned no style analysis. Please try again.");
    } catch (e) {
      console.error("Analysis error:", e);
      toast.error(e instanceof Error ? e.message : "Couldn't analyze this conversation");
      setAnalyzing(false);
      return;
    }

    const nextStatus = "ready";
    const { error } = user
      ? await supabase.from("training_conversations").insert({
          title,
          persona: personaTab,
          source_type: sourceMode,
          content: data.extractedContent || content || `Uploaded file: ${fileName}`,
          style_analysis: styleAnalysis,
          status: nextStatus,
          user_id: user.id,
        })
      : { error: null as null | Error };

    if (!user) {
      guestStorage.training.insert({
        title,
        persona: personaTab,
        source_type: sourceMode,
        content: data.extractedContent || content || `Uploaded file: ${fileName}`,
        style_analysis: styleAnalysis,
        status: nextStatus,
      });
    }

    if (error) {
      toast.error("Failed to save training data");
    } else {
      toast.success("Training data added!");
      setTitle("");
      setContent("");
      setUrl(""); setFileData(""); setFileName(""); setFileMime("");
      if (fileRef.current) fileRef.current.value = "";
      fetchConvos();
    }
    setAnalyzing(false);
  };

  const handleDelete = async (id: string) => {
    const { error } = user
      ? await supabase.from("training_conversations").delete().eq("id", id)
      : { error: null as null | Error };

    if (!user) {
      guestStorage.training.remove(id);
    }

    if (error) toast.error("Failed to delete");
    else {
      toast.success("Deleted");
      setConvos((prev) => prev.filter((c) => c.id !== id));
    }
  };

  const filtered = convos.filter((c) => c.persona === personaTab);

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
        <CardContent className="p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Upload past conversations, PDFs, or screenshots. The AI will extract your style fingerprint and match it in every reply.
          </p>
          <Tabs value={sourceMode} onValueChange={(value) => setSourceMode(value as typeof sourceMode)}>
            <TabsList className="bg-muted border border-border flex-wrap h-auto">
              <TabsTrigger value="text"><Type className="h-3.5 w-3.5 mr-1" /> Paste Text</TabsTrigger>
              <TabsTrigger value="file"><FileUp className="h-3.5 w-3.5 mr-1" /> Upload File</TabsTrigger>
              <TabsTrigger value="url"><Link2 className="h-3.5 w-3.5 mr-1" /> From Link</TabsTrigger>
            </TabsList>
          </Tabs>
          <div>
            <Label className="text-foreground">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., 'Winning DM with Sarah'"
              className="bg-muted border-border text-foreground"
            />
          </div>
          {sourceMode === "url" ? (
            <div>
              <Label className="text-foreground">Link to a conversation, article, or video</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="bg-muted border-border text-foreground" />
              <p className="text-xs text-muted-foreground mt-1">YouTube links use one of your active Apify keys to retrieve a transcript.</p>
            </div>
          ) : sourceMode === "file" ? (
            <div>
              <Label className="text-foreground">Upload a conversation, PDF, Word file, or screenshot (up to 20MB)</Label>
              <Input ref={fileRef} type="file" accept=".txt,.md,.csv,.text,.json,.log,.pdf,.doc,.docx,text/*,application/pdf,image/*" onChange={handleFile} className="bg-muted border-border text-foreground" />
              {content && <p className="text-xs text-muted-foreground mt-1">{content.length} characters loaded.</p>}
              {fileData && <p className="text-xs text-muted-foreground mt-1">📎 {fileName} attached — the AI will read it.</p>}
            </div>
          ) : (
            <div>
              <Label className="text-foreground">Paste conversation logs here...</Label>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder={"You: Hey! I saw your post about...\nThem: Thanks! Yeah I've been struggling with...\nYou: I totally get that, I was in the same spot..."} className="bg-muted border-border text-foreground min-h-[120px]" />
            </div>
          )}
          <Button
            onClick={handleAdd}
            disabled={analyzing}
            className="gradient-primary text-primary-foreground"
          >
            {analyzing ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analyzing Conversation...</>
            ) : (
              <><Upload className="h-4 w-4 mr-2" /> Analyze Conversation</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Persona tabs */}
      <Tabs value={personaTab} onValueChange={setPersonaTab}>
         <TabsList className="bg-muted border border-border flex-wrap h-auto">
          <TabsTrigger value="nifimas" className="data-[state=active]:bg-secondary/10 data-[state=active]:text-secondary">
            🤝 Nifimas (Friend)
          </TabsTrigger>
          <TabsTrigger value="brozeen" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            💼 Brozeen (Promoter)
          </TabsTrigger>
          <TabsTrigger value="bigstreamer" className="data-[state=active]:bg-info/10 data-[state=active]:text-info">
            🎤 Big Streamer
          </TabsTrigger>
        </TabsList>

        <div className="mt-3">
          <p className="text-sm text-muted-foreground mb-3">
            Training Data ({filtered.length})
          </p>

          {filtered.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No training data for {personaTab === "nifimas" ? "Nifimas" : personaTab === "bigstreamer" ? "Big Streamer" : "Brozeen"} yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtered.map((convo) => (
                <Card key={convo.id} className="bg-card border-border">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-foreground">{convo.title}</h3>
                          <Badge variant="outline" className="text-xs border-border text-muted-foreground">
                            {convo.source_type}
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              convo.status === "ready"
                                ? "border-success text-success"
                                : "border-warning text-warning"
                            }`}
                          >
                            ⊙ {convo.status}
                          </Badge>
                        </div>
                        {convo.style_analysis && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {convo.style_analysis}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive/80"
                        onClick={() => handleDelete(convo.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </Tabs>
    </div>
  );
}
