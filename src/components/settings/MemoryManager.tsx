import { useState } from "react";
import { Brain, Trash2, Plus, Loader2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useMemory } from "@/hooks/useMemory";

export function MemoryManager() {
  const { memories, loading, enabled, setEnabled, addMemory, removeMemory, clearAll } = useMemory();
  const [newFact, setNewFact] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!newFact.trim()) return;
    setAdding(true);
    await addMemory(newFact, "manual");
    setNewFact("");
    setAdding(false);
    toast.success("Saved to memory");
  };

  const handleClear = async () => {
    if (memories.length === 0) return;
    await clearAll();
    toast.success("Memory cleared");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" /> Memory
        </h1>
        <p className="text-sm text-muted-foreground">
          The AI remembers key facts inside each chat thread so replies stay useful without mixing one conversation into another.
        </p>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">Remember per chat</p>
            <p className="text-xs text-muted-foreground">When on, the assistant learns and recalls facts only for the matching conversation.</p>
          </div>
          <Switch checked={enabled} onCheckedChange={(v) => { setEnabled(v); toast.success(v ? "Memory turned on" : "Memory turned off"); }} />
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium text-foreground flex items-center gap-2">
            <Plus className="h-4 w-4 text-primary" /> Add something to remember
          </p>
          <div className="flex gap-2">
            <Input
              value={newFact}
              onChange={(e) => setNewFact(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="e.g. I'm building a fitness app for beginners"
              className="bg-muted border-border text-foreground"
            />
            <Button onClick={handleAdd} disabled={adding || !newFact.trim()} className="gradient-primary text-primary-foreground gap-1.5">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">Saved memories ({memories.length})</p>
        {memories.length > 0 && (
          <Button variant="ghost" size="sm" onClick={handleClear} className="text-destructive hover:text-destructive/80 gap-1.5">
            <Trash2 className="h-4 w-4" /> Clear all
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : memories.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Sparkles className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>No memories yet. Keep chatting and the AI will start remembering important details — or add one above.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <Card key={m.id} className="bg-card border-border">
              <CardContent className="p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground">{m.content}</p>
                  <Badge variant="outline" className="mt-1.5 text-[10px] border-border text-muted-foreground">
                    {m.source === "manual" ? "Added by you" : "Learned automatically"}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive/80 shrink-0" onClick={() => removeMemory(m.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
