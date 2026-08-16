import { useEffect, useState } from "react";
import { ClipboardCheck, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ClientActionPlan = {
  goal: string;
  objection: string;
  nextAction: string;
  followUpDate: string;
  owner: string;
  handoverNote: string;
};

export const EMPTY_CLIENT_ACTION_PLAN: ClientActionPlan = {
  goal: "",
  objection: "",
  nextAction: "Reply today",
  followUpDate: "",
  owner: "",
  handoverNote: "",
};

type Props = {
  plan: ClientActionPlan;
  lastClientMessage: string;
  saving?: boolean;
  onSave: (plan: ClientActionPlan) => void;
};

export function ClientActionCard({ plan, lastClientMessage, saving, onSave }: Props) {
  const [draft, setDraft] = useState<ClientActionPlan>(plan);

  useEffect(() => setDraft(plan), [plan]);

  const update = (field: keyof ClientActionPlan, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  return (
    <section className="mb-3 rounded-xl border border-primary/30 bg-primary/5 p-3 sm:p-4" aria-label="Client action card">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-md bg-primary/15 text-primary flex items-center justify-center"><ClipboardCheck className="h-4 w-4" /></div>
        <div>
          <h2 className="text-sm font-semibold text-foreground">Client Action Card</h2>
          <p className="text-[11px] text-muted-foreground">Private team notes — never sent to the client.</p>
        </div>
      </div>

      {lastClientMessage && (
        <p className="mb-3 rounded-md border border-border bg-background/40 px-2.5 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Latest client message: </span>{lastClientMessage.slice(0, 260)}{lastClientMessage.length > 260 ? "…" : ""}
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-muted-foreground">Their goal
          <Input value={draft.goal} onChange={(e) => update("goal", e.target.value)} placeholder="e.g. Hit Affiliate / grow viewers" className="mt-1 h-9 bg-background text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Main objection or concern
          <Input value={draft.objection} onChange={(e) => update("objection", e.target.value)} placeholder="e.g. No budget / needs proof" className="mt-1 h-9 bg-background text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Next action
          <select value={draft.nextAction} onChange={(e) => update("nextAction", e.target.value)} className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground">
            <option>Reply today</option>
            <option>Wait for their reply</option>
            <option>Move to Brozeen</option>
            <option>Move to Big Streamer</option>
            <option>Re-engage later</option>
            <option>Archive / not a fit</option>
          </select>
        </label>
        <label className="text-xs text-muted-foreground">Follow up on
          <Input type="date" value={draft.followUpDate} onChange={(e) => update("followUpDate", e.target.value)} className="mt-1 h-9 bg-background text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Team owner
          <Input value={draft.owner} onChange={(e) => update("owner", e.target.value)} placeholder="Who is handling this client?" className="mt-1 h-9 bg-background text-foreground" />
        </label>
        <label className="text-xs text-muted-foreground">Handover note
          <Textarea value={draft.handoverNote} onChange={(e) => update("handoverNote", e.target.value)} placeholder="What should the next team member know?" className="mt-1 min-h-[36px] resize-none bg-background text-foreground" rows={1} />
        </label>
      </div>
      <Button type="button" size="sm" onClick={() => onSave(draft)} disabled={saving} className="mt-3 h-8 gradient-primary text-primary-foreground">
        <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving..." : "Save client plan"}
      </Button>
    </section>
  );
}
