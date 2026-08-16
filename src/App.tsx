import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
const Index = lazy(() => import("./pages/Index"));
const AnalyzerPage = lazy(() => import("./pages/AnalyzerPage"));
const ChatPage = lazy(() => import("./pages/ChatPage"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const ContactChatPage = lazy(() => import("./pages/ContactChatPage"));
const KnowledgePage = lazy(() => import("./pages/KnowledgePage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const SearchPage = lazy(() => import("./pages/SearchPage"));
const AuthPage = lazy(() => import("./pages/AuthPage"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

function AppRoutes() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-label="Loading page" />}>
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

const App = () => (
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

export default App;
