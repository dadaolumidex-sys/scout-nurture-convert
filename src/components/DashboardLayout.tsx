import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationsBell } from "@/components/NotificationsBell";
import { MiniMusicPlayer } from "@/components/MiniMusicPlayer";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <CommandPalette />
      <div className="min-h-screen flex w-full">
        <div className="hidden md:block">
          <AppSidebar />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b border-border px-3 sm:px-4">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="hidden md:flex text-muted-foreground hover:text-foreground" />
              <span className="md:hidden text-sm font-semibold text-foreground">StreamScout</span>
            </div>
            <NotificationsBell />
          </header>
          <main className="flex-1 overflow-auto p-3 sm:p-6 pb-40 md:pb-20">
            {children}
          </main>
        </div>
        <MiniMusicPlayer />
        <MobileBottomNav />
      </div>
    </SidebarProvider>
  );
}
