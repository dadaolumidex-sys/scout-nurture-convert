import { useState } from "react";
import { Plus, BookOpen, FileText, Trash2, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";

type KnowledgeItem = {
  id: string;
  title: string;
  category: string;
  content: string;
};

const categories = [
  "Outreach Scripts",
  "Conversion Strategies",
  "Objection Handling",
  "Growth Tips",
];

const defaultItems: KnowledgeItem[] = [
  {
    id: "1",
    title: "Initial Outreach — Friend Mode",
    category: "Outreach Scripts",
    content:
      "Hey! I caught your stream the other day and really enjoyed it. Your energy is great! How long have you been streaming? I'm always curious about how people got started.",
  },
  {
    id: "2",
    title: "Handling 'I can't afford it'",
    category: "Objection Handling",
    content:
      "I totally understand budget is a concern. The thing is, promotion is an investment — most of our clients see a 2-3x return within the first month through new subs and donations. We also have flexible plans.",
  },
  {
    id: "3",
    title: "Growth tip: Clip Strategy",
    category: "Growth Tips",
    content:
      "Create short clips from your best moments and post them to TikTok, YouTube Shorts, and Twitter. Clips with emotional reactions, fails, or funny moments tend to go viral and bring new viewers to your channel.",
  },
];

const KnowledgePage = () => {
  const [items, setItems] = useState<KnowledgeItem[]>(defaultItems);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState(categories[0]);
  const [newContent, setNewContent] = useState("");
  const [filter, setFilter] = useState("All");

  const handleAdd = () => {
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error("Title and content are required");
      return;
    }
    setItems((prev) => [
      {
        id: Date.now().toString(),
        title: newTitle,
        category: newCategory,
        content: newContent,
      },
      ...prev,
    ]);
    setNewTitle("");
    setNewContent("");
    setDialogOpen(false);
    toast.success("Knowledge added!");
  };

  const handleDelete = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    toast.success("Deleted");
  };

  const filtered = filter === "All" ? items : items.filter((i) => i.category === filter);

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-slide-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Knowledge Base</h1>
            <p className="text-muted-foreground text-sm">
              Store scripts, strategies, and tips for the AI to reference
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground font-semibold hover:opacity-90">
                <Plus className="h-4 w-4 mr-2" />
                Add Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">New Knowledge Entry</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label className="text-foreground">Title</Label>
                  <Input
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Entry title"
                    className="bg-muted border-border text-foreground"
                  />
                </div>
                <div>
                  <Label className="text-foreground">Category</Label>
                  <Select value={newCategory} onValueChange={setNewCategory}>
                    <SelectTrigger className="bg-muted border-border text-foreground">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-foreground">Content</Label>
                  <Textarea
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                    placeholder="Script, strategy, or tip..."
                    className="bg-muted border-border text-foreground min-h-[120px]"
                  />
                </div>
                <Button onClick={handleAdd} className="w-full gradient-primary text-primary-foreground">
                  Add Entry
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Filter */}
        <div className="flex gap-2 flex-wrap">
          {["All", ...categories].map((cat) => (
            <Button
              key={cat}
              variant="outline"
              size="sm"
              onClick={() => setFilter(cat)}
              className={`${
                filter === cat
                  ? "bg-primary/10 border-primary text-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {cat}
            </Button>
          ))}
        </div>

        {/* Items */}
        <div className="space-y-3">
          {filtered.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center text-muted-foreground">
                <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No entries yet. Add your first knowledge entry!</p>
              </CardContent>
            </Card>
          ) : (
            filtered.map((item) => (
              <Collapsible key={item.id}>
                <Card className="bg-card border-border">
                  <CollapsibleTrigger asChild>
                    <CardContent className="p-4 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3">
                        <FileText className="h-4 w-4 text-primary" />
                        <h3 className="font-medium text-foreground">{item.title}</h3>
                        <Badge variant="outline" className="border-border text-muted-foreground text-xs">
                          {item.category}
                        </Badge>
                      </div>
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 border-t border-border pt-3">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{item.content}</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-3 text-destructive hover:text-destructive/80 p-0 h-auto"
                        onClick={() => handleDelete(item.id)}
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        Delete
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default KnowledgePage;
