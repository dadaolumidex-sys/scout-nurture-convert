export type LeadStatus =
  | "new"
  | "in_conversation"
  | "ready_to_pitch"
  | "converted"
  | "not_interested"
  | "blocked";

export const LEAD_STATUSES: { id: LeadStatus; label: string; emoji: string; className: string; accent: string }[] = [
  { id: "new", label: "New friend request", emoji: "👋", className: "bg-primary/15 text-primary border-primary/30", accent: "border-primary/30 bg-primary/5" },
  { id: "in_conversation", label: "In conversation", emoji: "💬", className: "bg-secondary/15 text-secondary border-secondary/30", accent: "border-secondary/30 bg-secondary/5" },
  { id: "ready_to_pitch", label: "Ready to pitch", emoji: "🎯", className: "bg-warning/15 text-warning border-warning/30", accent: "border-warning/30 bg-warning/5" },
  { id: "converted", label: "Converted", emoji: "✅", className: "bg-success/15 text-success border-success/30", accent: "border-success/30 bg-success/5" },
  { id: "not_interested", label: "Not Interested", emoji: "🚫", className: "bg-muted text-muted-foreground border-border", accent: "border-border bg-muted/30" },
  { id: "blocked", label: "Blocked / Archived", emoji: "⛔", className: "bg-destructive/15 text-destructive border-destructive/30", accent: "border-destructive/30 bg-destructive/5" },
];

export const leadStatusMap = Object.fromEntries(LEAD_STATUSES.map((s) => [s.id, s])) as Record<string, typeof LEAD_STATUSES[number]>;

export const getLeadStatus = (status?: string | null) => leadStatusMap[status || "new"] || leadStatusMap.new;
