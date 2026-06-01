import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, Plus, Check, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

type Reminder = {
  id: string;
  title: string;
  due_at: string;
  note: string | null;
  completed: boolean;
  contact_id: string | null;
};

type Contact = { id: string; username: string; display_name: string | null };

const QUICK_PRESETS: { label: string; hours: number }[] = [
  { label: "In 1 hour", hours: 1 },
  { label: "Tomorrow", hours: 24 },
  { label: "In 3 days", hours: 72 },
  { label: "Next week", hours: 168 },
];

export function RemindersPanel({ contacts }: { contacts: Contact[] }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Reminder[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState<string>("none");
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) { setItems([]); setLoading(false); return; }
    const { data } = await (supabase.from("reminders" as any)
      .select("*").eq("completed", false).order("due_at", { ascending: true }) as any);
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user?.id]);

  const create = async () => {
    if (!title.trim()) { toast.error("Add a title"); return; }
    if (!user) { toast.error("Sign in to set reminders"); return; }
    const due_at = new Date(Date.now() + hours * 3600_000).toISOString();
    const { error } = await (supabase.from("reminders" as any).insert({
      user_id: user.id, title: title.trim(),
      contact_id: contactId === "none" ? null : contactId,
      due_at,
    }) as any);
    if (error) { toast.error("Could not create reminder"); return; }
    toast.success("Reminder set");
    setTitle(""); setContactId("none"); setHours(24); setOpen(false);
    load();
  };

  const complete = async (id: string) => {
    await (supabase.from("reminders" as any).update({ completed: true }).eq("id", id) as any);
    load();
  };

  const remove = async (id: string) => {
    await (supabase.from("reminders" as any).delete().eq("id", id) as any);
    load();
  };

  const fmtDue = (iso: string) => {
    const d = new Date(iso);
    const diff = d.getTime() - Date.now();
    if (diff < 0) return { text: "Overdue", overdue: true };
    const h = Math.round(diff / 3600_000);
    if (h < 1) return { text: "in <1h", overdue: false };
    if (h < 24) return { text: `in ${h}h`, overdue: false };
    return { text: `in ${Math.round(h / 24)}d`, overdue: false };
  };

  if (loading) return null;

  return (
    <Card className="bg-card border-border">
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Bell className="h-4 w-4 text-primary shrink-0" />
            <p className="text-sm font-semibold text-foreground truncate">
              Follow-ups <span className="text-muted-foreground font-normal">({items.length})</span>
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs gap-1 shrink-0">
                <Plus className="h-3 w-3" /> Add
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-sm">
              <DialogHeader><DialogTitle>New reminder</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="reminder-title" className="text-xs">Title</Label>
                  <Input id="reminder-title" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} placeholder="e.g. Follow up with xQc" className="bg-muted border-border mt-1" />
                </div>
                <div>
                  <Label className="text-xs">Contact (optional)</Label>
                  <Select value={contactId} onValueChange={setContactId}>
                    <SelectTrigger className="bg-muted border-border mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border max-h-60">
                      <SelectItem value="none">No contact</SelectItem>
                      {contacts.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.display_name || c.username}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Remind me</Label>
                  <div className="grid grid-cols-2 gap-1.5 mt-1">
                    {QUICK_PRESETS.map(p => (
                      <button key={p.label} onClick={() => setHours(p.hours)}
                        className={`text-xs rounded-md border px-2 py-1.5 transition ${hours === p.hours ? "border-primary bg-primary/10 text-primary" : "border-border bg-muted/50 text-muted-foreground"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Button onClick={create} className="w-full gradient-primary text-primary-foreground">Set reminder</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">No follow-ups scheduled. Stay on top of your leads.</p>
        ) : (
          <div className="space-y-1.5 max-h-60 overflow-auto">
            {items.slice(0, 8).map(r => {
              const { text, overdue } = fmtDue(r.due_at);
              const c = contacts.find(x => x.id === r.contact_id);
              return (
                <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-2">
                  <button onClick={() => complete(r.id)} className="h-5 w-5 rounded-full border border-border hover:border-primary hover:bg-primary/10 flex items-center justify-center shrink-0">
                    <Check className="h-3 w-3 text-muted-foreground" />
                  </button>
                  <button onClick={() => c && navigate(`/inbox/${c.id}`)} className="flex-1 min-w-0 text-left">
                    <p className="text-xs font-medium text-foreground truncate">{r.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Clock className={`h-2.5 w-2.5 ${overdue ? "text-destructive" : "text-muted-foreground"}`} />
                      <span className={`text-[10px] ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>{text}</span>
                      {c && <span className="text-[10px] text-primary truncate">· {c.display_name || c.username}</span>}
                    </div>
                  </button>
                  <button onClick={() => remove(r.id)} className="text-muted-foreground hover:text-destructive shrink-0 p-1">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
