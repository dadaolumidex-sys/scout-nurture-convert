import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Search, MessageSquare, BookOpen, Bot, Settings, BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

const mainTabs = [
  { label: "Home", icon: LayoutDashboard, path: "/" },
  { label: "Analyze", icon: Search, path: "/analyzer" },
  { label: "Inbox", icon: MessageSquare, path: "/inbox" },
  { label: "KB", icon: BookOpen, path: "/knowledge" },
  { label: "AI", icon: Bot, path: "/chat" },
];

const moreTabs = [
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-[68px]">
        {mainTabs.map((tab) => (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1 flex-1 h-full text-[11px] font-medium transition-colors",
              isActive(tab.path)
                ? "text-primary"
                : "text-muted-foreground active:text-foreground"
            )}
          >
            {isActive(tab.path) && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-full bg-primary" />
            )}
            <tab.icon className={cn("h-6 w-6", isActive(tab.path) && "scale-110")} strokeWidth={isActive(tab.path) ? 2.2 : 1.8} />
            <span>{tab.label}</span>
          </button>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "relative flex flex-col items-center justify-center gap-1 flex-1 h-full text-[11px] font-medium transition-colors",
                moreActive ? "text-primary" : "text-muted-foreground active:text-foreground"
              )}
            >
              {moreActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[3px] rounded-b-full bg-primary" />
              )}
              <MoreHorizontal className="h-6 w-6" strokeWidth={moreActive ? 2.2 : 1.8} />
              <span>More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="mb-2 w-48">
            {moreTabs.map((tab) => (
              <DropdownMenuItem
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn("gap-2 py-3", isActive(tab.path) && "text-primary")}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
