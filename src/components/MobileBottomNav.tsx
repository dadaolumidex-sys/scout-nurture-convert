import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Bot, MessageSquare, Search, MoreHorizontal, BookOpen, BarChart3, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const mainTabs = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Analyzer", icon: Search, path: "/analyzer" },
  { label: "Inbox", icon: MessageSquare, path: "/inbox" },
  { label: "AI Chat", icon: Bot, path: "/chat" },
];

const moreTabs = [
  { label: "Knowledge", icon: BookOpen, path: "/knowledge" },
  { label: "Analytics", icon: BarChart3, path: "/analytics" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const moreActive = moreTabs.some((t) => isActive(t.path));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-16">
        {mainTabs.map((tab) => (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] font-medium transition-colors",
              isActive(tab.path)
                ? "text-primary"
                : "text-muted-foreground active:text-foreground"
            )}
          >
            {isActive(tab.path) && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full bg-primary" />
            )}
            <tab.icon className={cn("h-5 w-5 transition-transform", isActive(tab.path) && "scale-110")} />
            <span>{tab.label}</span>
          </button>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[11px] font-medium transition-colors",
                moreActive ? "text-primary" : "text-muted-foreground active:text-foreground"
              )}
            >
              {moreActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full bg-primary" />
              )}
              <MoreHorizontal className={cn("h-5 w-5 transition-transform", moreActive && "scale-110")} />
              <span>More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="mb-2 w-48">
            {moreTabs.map((tab) => (
              <DropdownMenuItem
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(
                  "gap-2 py-2.5",
                  isActive(tab.path) && "text-primary"
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
