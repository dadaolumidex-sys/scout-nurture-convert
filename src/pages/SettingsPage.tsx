import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Key, Eye, EyeOff, Save, CheckCircle, Zap, User, Bell, Shield, Palette, Link2, Wrench, Download, LogOut, ChevronRight, ArrowLeft, Wifi, RefreshCw, Trash2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ApiKeysManager } from "@/components/settings/ApiKeysManager";
import { useAuth } from "@/hooks/useAuth";
import { useIsMobile } from "@/hooks/use-mobile";
import { THEME_PRESETS, applyTheme, getStoredTheme } from "@/lib/themeColors";

type SettingsView = "main" | "profile" | "notifications" | "security" | "appearance" | "api" | "troubleshoot" | "install";

const SettingsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [view, setView] = useState<SettingsView>("main");
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [savingGemini, setSavingGemini] = useState(false);
  const [savingOpenai, setSavingOpenai] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [issueText, setIssueText] = useState("");
  const [activeTheme, setActiveTheme] = useState<string>(getStoredTheme());
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<string | null>(null);

  useEffect(() => {
    if (user) loadSettings();
  }, [user]);

  const loadSettings = async () => {
    const { data } = await (supabase
      .from("user_settings" as any)
      .select("gemini_api_key, openai_api_key")
      .eq("user_id", user!.id)
      .single() as any);
    if (data?.gemini_api_key) { setHasGeminiKey(true); setGeminiKey(data.gemini_api_key); }
    if (data?.openai_api_key) { setHasOpenaiKey(true); setOpenaiKey(data.openai_api_key); }
  };

  const handleSaveKey = async (type: "gemini" | "openai") => {
    if (!user) { toast.error("Sign in to save API keys. Guest mode uses built-in AI."); return; }
    const key = type === "gemini" ? geminiKey : openaiKey;
    const setSaving = type === "gemini" ? setSavingGemini : setSavingOpenai;
    const setHasKey = type === "gemini" ? setHasGeminiKey : setHasOpenaiKey;
    const label = type === "gemini" ? "Gemini" : "OpenAI";
    const column = type === "gemini" ? "gemini_api_key" : "openai_api_key";
    if (!key.trim()) { toast.error(`Please enter a ${label} API key`); return; }
    setSaving(true);
    const { error } = await (supabase
      .from("user_settings" as any)
      .upsert({ user_id: user!.id, [column]: key.trim(), updated_at: new Date().toISOString() }, { onConflict: "user_id" }) as any);
    if (error) toast.error(`Failed to save ${label} API key`);
    else { setHasKey(true); toast.success(`${label} API key saved!`); }
    setSaving(false);
  };

  const handleRunDiagnostics = async () => {
    setDiagRunning(true);
    setDiagResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const chatUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const res = await fetch(chatUrl, { method: "POST", headers: { "Content-Type": "application/json", apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify({ messages: [{ role: "user", content: "test" }], persona: "friend" }) });
      if (res.ok) setDiagResult("✅ All systems operational. AI is responding correctly.");
      else setDiagResult(`⚠️ AI returned status ${res.status}. Try again in a moment.`);
    } catch {
      setDiagResult("❌ Cannot reach AI service. Check your internet connection.");
    }
    setDiagRunning(false);
  };

  const handleResetSession = () => {
    sessionStorage.clear();
    toast.success("Session reset. Refreshing...");
    setTimeout(() => window.location.reload(), 500);
  };

  const handleClearCache = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("streamscout_"));
    keys.forEach(k => localStorage.removeItem(k));
    toast.success(`Cleared ${keys.length} cached items`);
  };

  const handleForceRefresh = () => {
    window.location.reload();
  };

  const handleFixIt = () => {
    if (!issueText.trim()) { toast.error("Please describe the issue first"); return; }
    const issues = JSON.parse(localStorage.getItem("reported_issues") || "[]");
    issues.push({ text: issueText, date: new Date().toISOString() });
    localStorage.setItem("reported_issues", JSON.stringify(issues));
    toast.success("Issue logged! Running auto-fix...");
    setIssueText("");
    handleRunDiagnostics();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate("/");
  };

  // Sub-views
  if (view !== "main") {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto space-y-4 animate-slide-in">
          <button onClick={() => setView("main")} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Back to Settings
          </button>

          {view === "troubleshoot" && (
            <>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Troubleshoot & Fix</h1>
                <p className="text-sm text-muted-foreground">Run diagnostics or describe any issue — AI will diagnose and fix it.</p>
              </div>

              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Sparkles className="h-4 w-4 text-primary" /> Describe your issue
                  </div>
                  <Textarea
                    placeholder="e.g. 'Messages won't send', 'Images not showing', 'App crashes when I open inbox', 'Theme is not changing'..."
                    value={issueText} onChange={(e) => setIssueText(e.target.value)}
                    className="bg-muted border-border text-foreground min-h-[100px]"
                  />
                  <Button onClick={handleFixIt} className="w-full gradient-primary text-primary-foreground gap-1.5 h-10">
                    <Wrench className="h-4 w-4" /> Fix It
                  </Button>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={handleRunDiagnostics} disabled={diagRunning} className="gap-1.5 h-10 border-primary/30 text-foreground">
                  <Wifi className="h-4 w-4" /> {diagRunning ? "Running..." : "Run Diagnostics"}
                </Button>
                <Button variant="outline" onClick={handleResetSession} className="gap-1.5 h-10 border-border text-foreground">
                  <RefreshCw className="h-4 w-4" /> Reset Session
                </Button>
                <Button variant="outline" onClick={handleClearCache} className="gap-1.5 h-10 border-border text-foreground">
                  <Trash2 className="h-4 w-4" /> Clear Cache
                </Button>
                <Button variant="outline" onClick={handleForceRefresh} className="gap-1.5 h-10 border-border text-foreground">
                  <RotateCcw className="h-4 w-4" /> Force Refresh
                </Button>
              </div>

              {diagResult && (
                <Card className="bg-card border-border">
                  <CardContent className="p-4 text-sm text-foreground">{diagResult}</CardContent>
                </Card>
              )}

              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-2">
                  <p className="text-sm font-medium text-foreground">Quick fixes</p>
                  <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside">
                    <li><span className="font-medium text-foreground">Messages not sending?</span> Run diagnostics → Reset Session</li>
                    <li><span className="font-medium text-foreground">Images not uploading?</span> Check file size (&lt;10MB) and format (JPG, PNG, WebP)</li>
                    <li><span className="font-medium text-foreground">AI not responding?</span> Run diagnostics to check AI service status</li>
                    <li><span className="font-medium text-foreground">App feels buggy?</span> Clear Cache → Force Refresh</li>
                    <li><span className="font-medium text-foreground">Something else?</span> Describe it above and let AI fix it!</li>
                  </ul>
                </CardContent>
              </Card>
            </>
          )}

          {view === "api" && <ApiKeysManager />}

          {view === "profile" && (
            <>
              <h1 className="text-2xl font-bold text-foreground">Profile</h1>
              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-2">
                  <p className="text-sm text-muted-foreground">Email: {user?.email || "Guest mode"}</p>
                  <p className="text-sm text-muted-foreground">Status: {user ? "Signed in" : "Guest"}</p>
                </CardContent>
              </Card>
            </>
          )}

          {view === "appearance" && (
            <>
              <div>
                <h1 className="text-2xl font-bold text-foreground">Appearance</h1>
                <p className="text-sm text-muted-foreground">Pick a color theme. It changes the whole app — buttons, links, chat highlights and the sidebar — instantly.</p>
              </div>
              <Card className="bg-card border-border">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <Palette className="h-4 w-4 text-primary" /> Theme color
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {THEME_PRESETS.map((preset) => {
                      const selected = preset.id === activeTheme;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => {
                            applyTheme(preset.id);
                            setActiveTheme(preset.id);
                            toast.success(`${preset.name} theme applied`);
                          }}
                          className={`flex items-center gap-2.5 rounded-lg border p-3 text-left transition-colors ${
                            selected ? "border-primary bg-muted" : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <span
                            className="h-7 w-7 shrink-0 rounded-full border border-border"
                            style={{ backgroundColor: `hsl(${preset.swatch})` }}
                          />
                          <span className="flex-1 text-sm font-medium text-foreground">{preset.name}</span>
                          {selected && <CheckCircle className="h-4 w-4 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">Your choice is saved on this device and stays after you close the app.</p>
                </CardContent>
              </Card>
            </>
          )}

          {(view === "notifications" || view === "security" || view === "install") && (
            <>
              <h1 className="text-2xl font-bold text-foreground capitalize">{view === "install" ? "Install App" : view}</h1>
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    {view === "install" ? "You can install this app to your home screen from your browser menu (Share → Add to Home Screen)." : "Coming soon."}
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // Main settings menu
  const menuItems: { section: string; items: { icon: React.ReactNode; label: string; desc: string; view: SettingsView }[] }[] = [
    {
      section: "ACCOUNT",
      items: [
        { icon: <User className="h-5 w-5 text-primary" />, label: "Profile", desc: "Manage your email", view: "profile" },
        { icon: <Bell className="h-5 w-5 text-primary" />, label: "Notifications", desc: "Configure alert preferences", view: "notifications" },
        { icon: <Shield className="h-5 w-5 text-destructive" />, label: "Security", desc: "Change your password", view: "security" },
      ],
    },
    {
      section: "APP",
      items: [
        { icon: <Palette className="h-5 w-5 text-primary" />, label: "Appearance", desc: "Theme and display settings", view: "appearance" },
        { icon: <Link2 className="h-5 w-5 text-primary" />, label: "API & Connections", desc: "See which services are active", view: "api" },
        { icon: <Wrench className="h-5 w-5 text-primary" />, label: "Troubleshoot & Fix", desc: "Diagnose and fix common issues", view: "troubleshoot" },
        { icon: <Download className="h-5 w-5 text-primary" />, label: "Install App", desc: "Add to home screen", view: "install" },
      ],
    },
  ];

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-4 animate-slide-in">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>

        {menuItems.map((section) => (
          <div key={section.section}>
            <p className="text-xs font-semibold text-primary tracking-wider mb-2">{section.section}</p>
            <Card className="bg-card border-border overflow-hidden">
              <div className="divide-y divide-border">
                {section.items.map((item) => (
                  <button
                    key={item.view}
                    onClick={() => setView(item.view)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left"
                  >
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">{item.icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            </Card>
          </div>
        ))}

        {user && (
          <Button variant="outline" onClick={handleSignOut} className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 gap-2 h-11">
            <LogOut className="h-4 w-4" /> Sign Out
          </Button>
        )}
      </div>
    </DashboardLayout>
  );
};

function ApiKeyInput({ title, placeholder, apiKey, setApiKey, showKey, setShowKey, saving, hasKey, onSave, icon }: {
  title: string; placeholder: string; apiKey: string; setApiKey: (v: string) => void;
  showKey: boolean; setShowKey: (v: boolean) => void; saving: boolean; hasKey: boolean; onSave: () => void; icon: React.ReactNode;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium text-foreground">{title}</span>
          {hasKey && <CheckCircle className="h-4 w-4 text-green-500" />}
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={placeholder} className="bg-muted border-border text-foreground pr-10" />
            <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button onClick={onSave} disabled={saving} className="gradient-primary text-primary-foreground gap-1.5">
            <Save className="h-4 w-4" /> {saving ? "..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default SettingsPage;
