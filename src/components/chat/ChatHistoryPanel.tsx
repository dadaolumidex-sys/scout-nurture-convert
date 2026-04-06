import { Conversation } from "@/hooks/useChatHistory";
import { MessageSquare, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Props = {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  isMobile?: boolean;
};

export function ChatHistoryPanel({ conversations, activeId, onSelect, onNew, onDelete, isMobile }: Props) {
  return (
    <div className={cn(
      "flex flex-col border-r border-border bg-card",
      isMobile ? "w-full h-full" : "w-64 shrink-0"
    )}>
      <div className="p-2 border-b border-border">
        <Button onClick={onNew} variant="outline" size="sm" className="w-full gap-1.5 h-8">
          <Plus className="h-3.5 w-3.5" /> New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-1 space-y-0.5">
          {conversations.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">No conversations yet</p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer text-sm transition-colors",
                activeId === c.id ? "bg-accent text-accent-foreground" : "hover:bg-muted text-foreground"
              )}
              onClick={() => onSelect(c.id)}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate flex-1 text-xs">{c.title}</span>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
