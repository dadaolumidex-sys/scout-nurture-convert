import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

const COLUMNS: { id: string; label: string; emoji: string; accent: string }[] = LEAD_STATUSES.map((s) => ({
  id: s.id,
  label: s.id === "new" ? "New" : s.id === "in_conversation" ? "In Chat" : s.label,
  emoji: s.emoji,
  accent: s.accent,
}));


export function PipelineBoard({ contacts, onRefresh }: { contacts: PipelineContact[]; onRefresh: () => void }) {
  const navigate = useNavigate();

  const moveTo = async (id: string, status: string) => {
    const target = contacts.find(c => c.id === id);
    if (!target || (target.status || "new") === status) return;
    const { error } = await (supabase.from("streamer_contacts" as any).update({ status }).eq("id", id) as any);
    if (error) { toast.error("Could not update"); return; }
    toast.success(`Moved to ${COLUMNS.find(c => c.id === status)?.label}`);
    onRefresh();
  };

  const handleDrop = (e: React.DragEvent, status: string) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/contact-id");
    if (!id) return;
    moveTo(id, status);
  };

  const moveByOffset = (currentStatus: string, id: string, offset: number) => {
    const idx = COLUMNS.findIndex(c => c.id === currentStatus);
    const next = COLUMNS[idx + offset];
    if (next) moveTo(id, next.id);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3" role="list" aria-label="Lead pipeline columns">
      {COLUMNS.map((col, colIndex) => {
        const items = contacts.filter(c => (c.status || "new") === col.id);
        return (
          <section key={col.id}
            role="listitem"
            aria-label={`${col.label} column, ${items.length} contact${items.length === 1 ? "" : "s"}`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => handleDrop(e, col.id)}
            className={`rounded-xl border ${col.accent} p-2 min-h-[180px] flex flex-col gap-2`}>
            <div className="flex items-center justify-between px-1 sticky top-0">
              <p className="text-[11px] sm:text-xs font-bold text-foreground">
                <span aria-hidden="true">{col.emoji}</span> <span className="ml-0.5">{col.label}</span>
              </p>
              <Badge variant="outline" className="text-[10px] h-4 px-1.5" aria-hidden="true">{items.length}</Badge>
            </div>
            <ul className="space-y-1.5 flex-1 list-none m-0 p-0">
              {items.map(c => {
                const name = c.display_name || c.username;
                const canPrev = colIndex > 0;
                const canNext = colIndex < COLUMNS.length - 1;
                return (
                  <li key={c.id}>
                    <Card
                      draggable
                      role="button"
                      tabIndex={0}
                      aria-label={`${name}, ${c.platform}, in ${col.label}. Press Enter to open chat.`}
                      onDragStart={(e) => e.dataTransfer.setData("text/contact-id", c.id)}
                      onClick={() => navigate(`/inbox/${c.id}`)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigate(`/inbox/${c.id}`);
                        } else if (e.key === "ArrowRight" && canNext) {
                          e.preventDefault();
                          moveByOffset(col.id, c.id, 1);
                        } else if (e.key === "ArrowLeft" && canPrev) {
                          e.preventDefault();
                          moveByOffset(col.id, c.id, -1);
                        }
                      }}
                      className="bg-card border-border hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors cursor-pointer active:scale-[0.98]">
                      <CardContent className="p-2 flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                          {c.profile_image_url
                            ? <img src={c.profile_image_url} alt="" className="h-full w-full object-cover" />
                            : <span className="text-[10px] font-bold text-foreground" aria-hidden="true">{name[0]?.toUpperCase()}</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold text-foreground truncate">{name}</p>
                          <p className="text-[9px] text-muted-foreground capitalize">{c.platform}</p>
                        </div>
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <Button
                            variant="ghost" size="icon"
                            className="h-5 w-5"
                            disabled={!canPrev}
                            aria-label={`Move ${name} to previous stage`}
                            onClick={(e) => { e.stopPropagation(); moveByOffset(col.id, c.id, -1); }}>
                            <ChevronLeft className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="h-5 w-5"
                            disabled={!canNext}
                            aria-label={`Move ${name} to next stage`}
                            onClick={(e) => { e.stopPropagation(); moveByOffset(col.id, c.id, 1); }}>
                            <ChevronRight className="h-3 w-3" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
              {items.length === 0 && (
                <li className="text-[10px] text-muted-foreground text-center py-3 italic">Drop here</li>
              )}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
