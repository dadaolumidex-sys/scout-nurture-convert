import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
const routeLoaders = {
  "/": () => import("./pages/Index"),
  "/analyzer": () => import("./pages/AnalyzerPage"),
  "/chat": () => import("./pages/ChatPage"),
  "/inbox": () => import("./pages/InboxPage"),
  "/knowledge": () => import("./pages/KnowledgePage"),
  "/analytics": () => import("./pages/AnalyticsPage"),
  "/settings": () => import("./pages/SettingsPage"),
  "/search": () => import("./pages/SearchPage"),
  "/auth": () => import("./pages/AuthPage"),
};

export const preloadRoute = (path: string) => {
  const exactPath = path.startsWith("/inbox/") ? "/inbox" : path;
  const loader = routeLoaders[exactPath as keyof typeof routeLoaders];
  if (loader) void loader();
};

const Index = lazy(routeLoaders["/"]);
const AnalyzerPage = lazy(routeLoaders["/analyzer"]);
const ChatPage = lazy(routeLoaders["/chat"]);
const InboxPage = lazy(routeLoaders["/inbox"]);
const ContactChatPage = lazy(() => import("./pages/ContactChatPage"));
const KnowledgePage = lazy(routeLoaders["/knowledge"]);
const AnalyticsPage = lazy(routeLoaders["/analytics"]);
const SettingsPage = lazy(routeLoaders["/settings"]);
const SearchPage = lazy(routeLoaders["/search"]);
const AuthPage = lazy(routeLoaders["/auth"]);
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function AppRoutes() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center" aria-label="Loading page">
        <div className="h-7 w-7 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    }>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/analyzer" element={<AnalyzerPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/inbox" element={<InboxPage />} />
        <Route path="/inbox/:contactId" element={<ContactChatPage />} />
        <Route path="/knowledge" element={<KnowledgePage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}

const App = () => {
  useEffect(() => {
    // After the first screen is usable, quietly warm the pages used most.
    // Navigation then feels instant instead of waiting for a new JS chunk.
    const warmRoutes = () => ["/chat", "/inbox", "/analyzer", "/knowledge", "/search"].forEach(preloadRoute);
    const timer = window.setTimeout(warmRoutes, 800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
