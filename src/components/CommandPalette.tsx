import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { LayoutDashboard, BarChart3, MessageSquare, Inbox, Sparkles, Brain, Settings, Globe, Search } from "lucide-react";

const ROUTES = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/analyzer", label: "Streamer Analyzer", icon: BarChart3 },
  { path: "/inbox", label: "Conversation Inbox", icon: Inbox },
  { path: "/chat", label: "AI Chat Assistant", icon: Sparkles },
  { path: "/knowledge", label: "Knowledge & Training", icon: Brain },
  { path: "/analytics", label: "Analytics", icon: MessageSquare },
  { path: "/search", label: "Web Search Agent", icon: Globe },
  { path: "/settings", label: "Settings", icon: Settings },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault(); setOpen(o => !o);
      }
      if (e.key === "/" && !["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName)) {
        e.preventDefault(); setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to page... (Cmd/Ctrl+K)" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {ROUTES.map(r => (
            <CommandItem key={r.path} onSelect={() => { navigate(r.path); setOpen(false); }}>
              <r.icon className="mr-2 h-4 w-4" /> {r.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
