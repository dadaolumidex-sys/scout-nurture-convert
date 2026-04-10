import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Bot, MessageSquare, Search, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BookOpen, BarChart3, Settings } from "lucide-react";

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
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
      <div className="flex items-center justify-around h-14">
        {mainTabs.map((tab) => (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] transition-colors",
              isActive(tab.path)
                ? "text-primary"
                : "text-muted-foreground"
            )}
          >
            <tab.icon className="h-5 w-5" />
            <span>{tab.label}</span>
          </button>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[10px] transition-colors",
                moreActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span>More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="mb-2">
            {moreTabs.map((tab) => (
              <DropdownMenuItem
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn(isActive(tab.path) && "text-primary")}
              >
                <tab.icon className="mr-2 h-4 w-4" />
                {tab.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
