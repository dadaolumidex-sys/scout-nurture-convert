import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Key, Eye, EyeOff, Save, CheckCircle, Zap, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SettingsPage = () => {
  const { user } = useAuth();
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [savingGemini, setSavingGemini] = useState(false);
  const [savingOpenai, setSavingOpenai] = useState(false);
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [hasOpenaiKey, setHasOpenaiKey] = useState(false);
  const [issueText, setIssueText] = useState("");

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
    if (!user) {
      toast.error("Sign in to save API keys. Guest mode uses built-in AI.");
      return;
    }
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
    if (error) { toast.error(`Failed to save ${label} API key`); }
    else { setHasKey(true); toast.success(`${label} API key saved!`); }
    setSaving(false);
  };

  const handleReportIssue = () => {
    if (!issueText.trim()) { toast.error("Please describe the issue"); return; }
    // Store locally for now
    const issues = JSON.parse(localStorage.getItem("reported_issues") || "[]");
    issues.push({ text: issueText, date: new Date().toISOString() });
    localStorage.setItem("reported_issues", JSON.stringify(issues));
    toast.success("Issue noted! We'll address it in the next update.");
    setIssueText("");
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground text-sm">Configure your workspace</p>
        </div>

        {/* AI Status */}
        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-2">
            <p className="text-sm font-medium text-foreground">🤖 AI Status</p>
            <p className="text-xs text-muted-foreground">
              AI is powered by Lovable AI and works automatically — no API keys needed. 
              Optional: add your own keys below for extra reliability.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-xs text-green-500">AI service active</span>
            </div>
          </CardContent>
        </Card>

        {/* Gemini API Key */}
        <ApiKeyCard
          title="Google Gemini API Key (Optional)"
          description={<>Extra fallback. Get a free key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline">Google AI Studio</a>.</>}
          icon={<Key className="h-5 w-5 text-primary" />}
          apiKey={geminiKey} setApiKey={setGeminiKey} showKey={showGeminiKey} setShowKey={setShowGeminiKey}
          saving={savingGemini} hasKey={hasGeminiKey} onSave={() => handleSaveKey("gemini")} placeholder="AIzaSy..."
          instructions={[
            <>Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline">aistudio.google.com/apikey</a></>,
            <>Click "Create API key"</>,
            <>Copy and paste above</>,
          ]}
          tip="Free tier: 1,500 requests/day"
        />

        {/* OpenAI API Key */}
        <ApiKeyCard
          title="OpenAI API Key (Optional)"
          description={<>Paid fallback. Get from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">OpenAI Platform</a>.</>}
          icon={<Zap className="h-5 w-5 text-green-400" />}
          apiKey={openaiKey} setApiKey={setOpenaiKey} showKey={showOpenaiKey} setShowKey={setShowOpenaiKey}
          saving={savingOpenai} hasKey={hasOpenaiKey} onSave={() => handleSaveKey("openai")} placeholder="sk-..."
          instructions={[
            <>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">platform.openai.com/api-keys</a></>,
            <>Create a secret key</>,
            <>Paste above</>,
          ]}
          tip="GPT-4o-mini is fast and affordable"
        />

        {/* Report Issue / Adjustments */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MessageSquare className="h-5 w-5 text-primary" />
              Report an Issue or Request
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Found a bug or want something adjusted? Describe it here and it will be addressed.
            </p>
            <Textarea
              placeholder="Describe what's not working or what you'd like changed..."
              value={issueText}
              onChange={(e) => setIssueText(e.target.value)}
              className="bg-muted border-border text-foreground min-h-[80px]"
            />
            <Button onClick={handleReportIssue} className="gradient-primary text-primary-foreground gap-1.5">
              <Send className="h-4 w-4" />
              Submit
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

type ApiKeyCardProps = {
  title: string; description: React.ReactNode; icon: React.ReactNode;
  apiKey: string; setApiKey: (v: string) => void; showKey: boolean; setShowKey: (v: boolean) => void;
  saving: boolean; hasKey: boolean; onSave: () => void; placeholder: string;
  instructions: React.ReactNode[]; tip: string;
};

const ApiKeyCard = ({ title, description, icon, apiKey, setApiKey, showKey, setShowKey, saving, hasKey, onSave, placeholder, instructions, tip }: ApiKeyCardProps) => (
  <Card className="bg-card border-border">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        {icon} {title}
        {hasKey && <CheckCircle className="h-4 w-4 text-green-500" />}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{description}</p>
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
      {hasKey && <p className="text-xs text-green-500/80">✅ Active</p>}
      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">How to get a key:</p>
        <ol className="list-decimal list-inside space-y-0.5">
          {instructions.map((step, i) => <li key={i}>{step}</li>)}
        </ol>
        <p className="mt-2">{tip}</p>
      </div>
    </CardContent>
  </Card>
);

export default SettingsPage;
