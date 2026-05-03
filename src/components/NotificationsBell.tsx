import { useEffect, useState } from "react";
import { Bell, CheckCheck, Download } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppNotification, listNotifications, markAllRead, unreadCount } from "@/lib/notifications";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function NotificationsBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [count, setCount] = useState(0);
  const [open, setOpen] = useState(false);

  const refresh = async () => {
    setItems(await listNotifications());
    setCount(await unreadCount());
  };

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 30000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (open && count > 0) { markAllRead().then(() => setCount(0)); }
  }, [open]);

  const exportData = async () => {
    try {
      const tables = ["streamer_contacts", "contact_messages", "knowledge_entries", "ai_conversations", "ai_messages", "analytics_events"];
      const out: Record<string, any> = { exported_at: new Date().toISOString() };
      for (const t of tables) {
        const { data } = await (supabase.from(t as any) as any).select("*");
        out[t] = data || [];
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `streamscout-backup-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup downloaded");
    } catch (e: any) { toast.error(e.message || "Export failed"); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="relative p-2 text-muted-foreground hover:text-foreground transition-colors">
          <Bell className="h-5 w-5" />
          {count > 0 && (
            <Badge className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground">
              {count > 9 ? "9+" : count}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 bg-card border-border p-0">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <p className="text-sm font-semibold text-foreground">Notifications</p>
          <Button size="sm" variant="ghost" onClick={exportData} className="h-7 px-2 text-xs gap-1">
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
        </div>
        <div className="max-h-80 overflow-auto">
          {items.length === 0 ? (
            <p className="p-6 text-sm text-center text-muted-foreground">No notifications yet</p>
          ) : items.map(n => (
            <div key={n.id} className="p-3 border-b border-border hover:bg-muted/30 transition-colors">
              <div className="flex items-start gap-2">
                <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${
                  n.kind === "error" ? "bg-destructive" :
                  n.kind === "warning" ? "bg-yellow-500" :
                  n.kind === "success" ? "bg-green-500" : "bg-primary"
                }`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{n.title}</p>
                  {n.body && <p className="text-xs text-muted-foreground">{n.body}</p>}
                  <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(n.created_at).toLocaleString()}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
