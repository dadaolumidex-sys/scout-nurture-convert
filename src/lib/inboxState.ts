export type InboxState = "needs_reply" | "waiting" | "finished";

export const INBOX_STATES: Record<InboxState, { label: string; emoji: string; className: string }> = {
  needs_reply: { label: "Needs reply", emoji: "✉️", className: "bg-primary/15 text-primary border-primary/30" },
  waiting: { label: "Waiting", emoji: "⏳", className: "bg-warning/15 text-warning border-warning/30" },
  finished: { label: "Finished", emoji: "✓", className: "bg-success/15 text-success border-success/30" },
};

export function getInboxState(value?: string | null, legacyStatus?: string | null): InboxState {
  if (value === "needs_reply" || value === "waiting" || value === "finished") return value;
  if (["converted", "not_interested", "blocked"].includes(legacyStatus || "")) return "finished";
  return "needs_reply";
}
