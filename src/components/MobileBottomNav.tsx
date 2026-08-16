import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Search, MessageSquare, BookOpen, Bot, Settings, BarChart3, Globe, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const mainTabs = [
  { label: "Home", icon: LayoutDashboard, path: "/" },
  { label: "Analyze", icon: Search, path: "/analyzer" },
  { label: "Inbox", icon: MessageSquare, path: "/inbox" },
  { label: "KB", icon: BookOpen, path: "/knowledge" },
  { label: "AI", icon: Bot, path: "/chat" },
];

const moreTabs = [
  { label: "Web Search", icon: Globe, path: "/search" },
  { label: "Analytics", icon: BarChart3, path: "/analytics" },
  { label: "Settings", icon: Settings, path: "/settings" },
];

export function MobileBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const moreActive = moreTabs.some((t) => isActive(t.path));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-center justify-around h-[80px] px-1">
        {mainTabs.map((tab) => (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className={cn(
              "relative flex flex-col items-center justify-center gap-1.5 flex-1 h-full text-[13px] font-semibold transition-colors",
              isActive(tab.path)
                ? "text-primary"
                : "text-muted-foreground active:text-foreground"
            )}
          >
            {isActive(tab.path) && (
              <span className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-b-full bg-primary" />
            )}
            <tab.icon className={cn("h-7 w-7", isActive(tab.path) && "scale-110")} strokeWidth={isActive(tab.path) ? 2.4 : 1.9} />
            <span>{tab.label}</span>
          </button>
        ))}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "relative flex flex-col items-center justify-center gap-1.5 flex-1 h-full text-[13px] font-semibold transition-colors",
                moreActive ? "text-primary" : "text-muted-foreground active:text-foreground"
              )}
            >
              {moreActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-b-full bg-primary" />
              )}
              <MoreHorizontal className="h-7 w-7" strokeWidth={moreActive ? 2.4 : 1.9} />
              <span>More</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="mb-2 w-56">
            {moreTabs.map((tab) => (
              <DropdownMenuItem
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={cn("gap-3 py-3.5 text-base", isActive(tab.path) && "text-primary")}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </DropdownMenuItem>
            ))}
            {user ? (
              <DropdownMenuItem
                onClick={() => void signOut()}
                className="gap-3 py-3.5 text-base text-destructive focus:text-destructive"
              >
                <LogOut className="h-5 w-5" />
                Sign Out
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => navigate("/auth")}
                className="gap-3 py-3.5 text-base text-primary focus:text-primary"
              >
                <LogIn className="h-5 w-5" />
                Sign In / Create Account
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
