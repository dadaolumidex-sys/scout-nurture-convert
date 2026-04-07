import { useState } from "react";
import { Conversation } from "@/hooks/useChatHistory";
import { MessageSquare, Trash2, Plus, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  isMobile?: boolean;
};

export function ChatHistoryPanel({ conversations, activeId, onSelect, onNew, onDelete, onRename, isMobile }: Props) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const startRename = (c: Conversation, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(c.id);
    setRenameValue(c.title);
  };

  const confirmRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (renamingId && renameValue.trim()) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const cancelRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingId(null);
  };

  return (
    <div className={cn(
      "flex flex-col",
      isMobile ? "w-full flex-1 min-h-0" : "w-64 shrink-0 border-r border-border bg-card"
    )}>
      <div className={cn("border-b border-border", isMobile ? "pb-2" : "p-2")}>
        <Button onClick={onNew} className="w-full gap-1.5 h-9 gradient-primary text-primary-foreground font-medium">
          <Plus className="h-4 w-4" /> New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className={cn("space-y-0.5", isMobile ? "py-1" : "p-1")}>
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">No conversations yet</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-2 rounded-lg px-3 py-2.5 cursor-pointer text-sm transition-colors",
                activeId === c.id ? "bg-accent text-accent-foreground" : "hover:bg-muted text-foreground"
              )}
              onClick={() => onSelect(c.id)}
            >
              <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
              {renamingId === c.id ? (
                <div className="flex-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                  <Input
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    className="h-6 text-xs bg-background border-border px-1.5"
                    autoFocus
                    onKeyDown={e => { if (e.key === "Enter") confirmRename(e as any); if (e.key === "Escape") cancelRename(e as any); }}
                  />
                  <button onClick={confirmRename} className="text-primary hover:text-primary/80"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={cancelRename} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <>
                  <span className="truncate flex-1 text-xs">{c.title}</span>
                  <div className={cn(
                    "flex items-center gap-0.5 transition-opacity",
                    isMobile ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  )}>
                    <button onClick={(e) => startRename(c, e)} className="text-muted-foreground hover:text-foreground p-0.5">
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); onDelete(c.id); }} className="text-muted-foreground hover:text-destructive p-0.5">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
