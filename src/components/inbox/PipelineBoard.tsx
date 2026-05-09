import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PipelineContact = {
  id: string;
  username: string;
  display_name: string | null;
  platform: string;
  status: string | null;
  profile_image_url: string | null;
  last_message: string | null;
};

const COLUMNS: { id: string; label: string; emoji: string; accent: string }[] = [
  { id: "new", label: "New", emoji: "👋", accent: "border-primary/30 bg-primary/5" },
  { id: "in_conversation", label: "In Chat", emoji: "💬", accent: "border-secondary/30 bg-secondary/5" },
  { id: "ready_to_pitch", label: "Ready to pitch", emoji: "🎯", accent: "border-yellow-500/30 bg-yellow-500/5" },
  { id: "converted", label: "Converted", emoji: "✅", accent: "border-green-500/30 bg-green-500/5" },
];

export function PipelineBoard({ contacts, onRefresh }: { contacts: PipelineContact[]; onRefresh: () => void }) {
  const navigate = useNavigate();

  const handleDrop = async (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/contact-id");
    if (!id) return;
    const target = contacts.find(c => c.id === id);
    if (!target || target.status === status) return;
    const { error } = await (supabase.from("streamer_contacts" as any).update({ status }).eq("id", id) as any);
    if (error) { toast.error("Could not update"); return; }
    toast.success(`Moved to ${COLUMNS.find(c => c.id === status)?.label}`);
    onRefresh();
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
      {COLUMNS.map(col => {
        const items = contacts.filter(c => (c.status || "new") === col.id);
        return (
          <div key={col.id}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`rounded-xl border ${col.accent} p-2 min-h-[180px] flex flex-col gap-2`}>
            <div className="flex items-center justify-between px-1 sticky top-0">
              <p className="text-[11px] sm:text-xs font-bold text-foreground">
                {col.emoji} <span className="ml-0.5">{col.label}</span>
              </p>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">{items.length}</Badge>
            </div>
            <div className="space-y-1.5 flex-1">
              {items.map(c => (
                <Card key={c.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/contact-id", c.id)}
                  onClick={() => navigate(`/inbox/${c.id}`)}
                  className="bg-card border-border hover:border-primary/50 transition-colors cursor-pointer active:scale-[0.98]">
                  <CardContent className="p-2 flex items-center gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                      {c.profile_image_url
                        ? <img src={c.profile_image_url} alt="" className="h-full w-full object-cover" />
                        : <span className="text-[10px] font-bold text-foreground">{(c.display_name || c.username)[0]?.toUpperCase()}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold text-foreground truncate">{c.display_name || c.username}</p>
                      <p className="text-[9px] text-muted-foreground capitalize">{c.platform}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {items.length === 0 && (
                <p className="text-[10px] text-muted-foreground text-center py-3 italic">Drop here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
