import { useState, useEffect } from "react";
import { Upload, Trash2, Loader2, MessageSquare } from "lucide-react";
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

const ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-knowledge`;

export function TrainingMemory() {
  const { user } = useAuth();
  const [convos, setConvos] = useState<TrainingConvo[]>([]);
  const [loading, setLoading] = useState(true);
  const [personaTab, setPersonaTab] = useState("nifimas");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
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

  const handleAdd = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and conversation content are required");
      return;
    }

    setAnalyzing(true);
    let styleAnalysis: string | null = null;

    try {
      const resp = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ content, type: "training", persona: personaTab }),
      });

      if (resp.ok) {
        const data = await resp.json();
        styleAnalysis = data.result || null;
      }
    } catch (e) {
      console.error("Analysis error:", e);
    }

    const nextStatus = styleAnalysis ? "ready" : "pending";
    const { error } = user
      ? await supabase.from("training_conversations").insert({
          title,
          persona: personaTab,
          source_type: "text",
          content,
          style_analysis: styleAnalysis,
          status: nextStatus,
          user_id: user.id,
        })
      : { error: null as null | Error };

    if (!user) {
      guestStorage.training.insert({
        title,
        persona: personaTab,
        source_type: "text",
        content,
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
          <div>
            <Label className="text-foreground">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., 'Winning DM with Sarah'"
              className="bg-muted border-border text-foreground"
            />
          </div>
          <div>
            <Label className="text-foreground">Paste conversation logs here...</Label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={"You: Hey! I saw your post about...\nThem: Thanks! Yeah I've been struggling with...\nYou: I totally get that, I was in the same spot..."}
              className="bg-muted border-border text-foreground min-h-[120px]"
            />
          </div>
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
         <TabsList className="bg-muted border border-border">
          <TabsTrigger value="nifimas" className="data-[state=active]:bg-secondary/10 data-[state=active]:text-secondary">
            🤝 Nifimas (Friend)
          </TabsTrigger>
          <TabsTrigger value="brozeen" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
            💼 Brozeen (Promoter)
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
                <p>No training data for {personaTab === "nifimas" ? "Nifimas" : "Brozeen"} yet</p>
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
