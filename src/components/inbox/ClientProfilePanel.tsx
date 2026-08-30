import { useEffect, useState } from "react";
import { Brain, CalendarClock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ClientProfile = {
  goal?: string;
  offer?: string;
  signals?: string;
  notes?: string;
  nextStep?: string;
};

export const EMPTY_CLIENT_PROFILE: ClientProfile = {
  goal: "",
  offer: "",
  signals: "",
  notes: "",
  nextStep: "",
};

export function normalizeClientProfile(value: unknown): ClientProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_CLIENT_PROFILE };
  const source = value as Record<string, unknown>;
  return {
    goal: typeof source.goal === "string" ? source.goal : "",
    offer: typeof source.offer === "string" ? source.offer : "",
    signals: typeof source.signals === "string" ? source.signals : "",
    notes: typeof source.notes === "string" ? source.notes : "",
    nextStep: typeof source.nextStep === "string" ? source.nextStep : "",
  };
}

const followUpOptions = [
  { label: "Tomorrow", hours: 24 },
  { label: "In 3 days", hours: 72 },
  { label: "In 7 days", hours: 168 },
];

export function ClientProfilePanel({
  profile,
  onSave,
  onFollowUp,
}: {
  profile: ClientProfile;
  onSave: (profile: ClientProfile) => Promise<void>;
  onFollowUp: (hours: number) => Promise<void>;
}) {
  const [draft, setDraft] = useState<ClientProfile>(() => normalizeClientProfile(profile));
  const [saving, setSaving] = useState(false);
  const [scheduling, setScheduling] = useState<number | null>(null);

  useEffect(() => setDraft(normalizeClientProfile(profile)), [profile]);

  const update = (key: keyof ClientProfile, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const save = async () => {
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const schedule = async (hours: number) => {
    setScheduling(hours);
    try {
      await onFollowUp(hours);
    } finally {
      setScheduling(null);
    }
  };

  return (
    <details className="mb-3 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5 group">
      <summary className="cursor-pointer list-none flex items-center gap-2 text-xs sm:text-sm font-medium text-foreground">
        <Brain className="h-4 w-4 text-primary shrink-0" />
        <span className="flex-1">Client profile & AI memory</span>
        <span className="text-[10px] font-normal text-muted-foreground">private — used for better replies</span>
      </summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div>
          <label className="text-[11px] text-muted-foreground">Goal / pain point</label>
          <Input value={draft.goal || ""} onChange={(event) => update("goal", event.target.value)} placeholder="e.g. wants more active viewers" className="mt-1 h-8 text-xs bg-background" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Offer / desired outcome</label>
          <Input value={draft.offer || ""} onChange={(event) => update("offer", event.target.value)} placeholder="e.g. channel audit, promotion plan" className="mt-1 h-8 text-xs bg-background" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-[11px] text-muted-foreground">Buying signals, objections, or concerns</label>
          <Textarea value={draft.signals || ""} onChange={(event) => update("signals", event.target.value)} placeholder="e.g. asked about price; worried about budget; likes Fortnite" className="mt-1 min-h-[52px] text-xs bg-background resize-none" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Personal notes</label>
          <Textarea value={draft.notes || ""} onChange={(event) => update("notes", event.target.value)} placeholder="Keep this factual and helpful" className="mt-1 min-h-[52px] text-xs bg-background resize-none" />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Next step</label>
          <Textarea value={draft.nextStep || ""} onChange={(event) => update("nextStep", event.target.value)} placeholder="e.g. send proof, then follow up" className="mt-1 min-h-[52px] text-xs bg-background resize-none" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void save()} disabled={saving} className="h-8 text-xs gradient-primary text-primary-foreground">
          <Save className="mr-1 h-3.5 w-3.5" /> {saving ? "Saving…" : "Save profile"}
        </Button>
        <span className="ml-1 text-[11px] text-muted-foreground flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Follow up:</span>
        {followUpOptions.map((option) => (
          <Button key={option.hours} type="button" size="sm" variant="outline" disabled={scheduling !== null} onClick={() => void schedule(option.hours)} className="h-8 px-2 text-xs">
            {scheduling === option.hours ? "Setting…" : option.label}
          </Button>
        ))}
      </div>
    </details>
  );
}
