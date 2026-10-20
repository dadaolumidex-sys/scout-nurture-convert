import { AlertTriangle } from "lucide-react";

export type AuditPriorityCard = {
  id: string;
  level: "critical" | "priority";
  title: string;
  evidence: string;
  action: string;
};

export function AuditPriorityCards({ items }: { items: AuditPriorityCard[] }) {
  if (!items.length) return null;
  return <section aria-label="Channel priorities" className="space-y-3">
    <h3 className="text-sm font-bold uppercase tracking-wide">What needs attention now</h3>
    <ul className="grid gap-3">
      {items.map((item) => <li key={item.id} className={"rounded-xl border-l-4 border p-4 " + (item.level === "critical" ? "border-rose-500 bg-rose-500/10" : "border-amber-500 bg-amber-500/10")}>
        <p className={"flex items-start gap-2 text-sm font-extrabold uppercase " + (item.level === "critical" ? "text-rose-500" : "text-amber-500")}>
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{item.level === "critical" ? "Critical review priority" : "Priority to work on"}: {item.title}</span>
        </p>
        <p className="mt-3 text-sm"><strong>What we found:</strong> {item.evidence}</p>
        <p className="mt-2 text-sm"><strong>Start here:</strong> {item.action}</p>
      </li>)}
    </ul>
  </section>;
}
