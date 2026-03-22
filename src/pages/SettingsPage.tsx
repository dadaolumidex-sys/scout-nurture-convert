import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Key, Eye, EyeOff, Save, CheckCircle, Zap } from "lucide-react";
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

  useEffect(() => {
    if (user) loadSettings();
  }, [user]);

  const loadSettings = async () => {
    const { data } = await (supabase
      .from("user_settings" as any)
      .select("gemini_api_key, openai_api_key")
      .eq("user_id", user!.id)
      .single() as any);
    if (data?.gemini_api_key) {
      setHasGeminiKey(true);
      setGeminiKey(data.gemini_api_key);
    }
    if (data?.openai_api_key) {
      setHasOpenaiKey(true);
      setOpenaiKey(data.openai_api_key);
    }
  };

  const handleSaveKey = async (type: "gemini" | "openai") => {
    const key = type === "gemini" ? geminiKey : openaiKey;
    const setSaving = type === "gemini" ? setSavingGemini : setSavingOpenai;
    const setHasKey = type === "gemini" ? setHasGeminiKey : setHasOpenaiKey;
    const label = type === "gemini" ? "Gemini" : "OpenAI";
    const column = type === "gemini" ? "gemini_api_key" : "openai_api_key";

    if (!key.trim()) {
      toast.error(`Please enter a ${label} API key`);
      return;
    }
    setSaving(true);

    const updatePayload: Record<string, string> = {
      user_id: user!.id,
      [column]: key.trim(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await (supabase
      .from("user_settings" as any)
      .upsert(updatePayload, { onConflict: "user_id" }) as any);

    if (error) {
      toast.error(`Failed to save ${label} API key`);
    } else {
      setHasKey(true);
      toast.success(`${label} API key saved! AI chat should work now.`);
    }
    setSaving(false);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground text-sm">Configure your StreamScout AI workspace</p>
        </div>

        {/* Gemini API Key */}
        <ApiKeyCard
          title="Google Gemini API Key"
          description={
            <>
              Free tier with 1,500 requests/day. Get a key from{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Google AI Studio
              </a>.
            </>
          }
          icon={<Key className="h-5 w-5 text-primary" />}
          apiKey={geminiKey}
          setApiKey={setGeminiKey}
          showKey={showGeminiKey}
          setShowKey={setShowGeminiKey}
          saving={savingGemini}
          hasKey={hasGeminiKey}
          onSave={() => handleSaveKey("gemini")}
          placeholder="AIzaSy..."
          instructions={[
            <>Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline">aistudio.google.com/apikey</a></>,
            <>Click "Create API key"</>,
            <>Select "Create API key in new project"</>,
            <>Copy the key and paste it above</>,
          ]}
          tip="Free tier includes 1,500 requests/day. If you hit limits, create a new key in a new project."
        />

        {/* OpenAI API Key */}
        <ApiKeyCard
          title="OpenAI (ChatGPT) API Key"
          description={
            <>
              Paid API with powerful GPT models. Get a key from{" "}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                OpenAI Platform
              </a>.
            </>
          }
          icon={<Zap className="h-5 w-5 text-green-400" />}
          apiKey={openaiKey}
          setApiKey={setOpenaiKey}
          showKey={showOpenaiKey}
          setShowKey={setShowOpenaiKey}
          saving={savingOpenai}
          hasKey={hasOpenaiKey}
          onSave={() => handleSaveKey("openai")}
          placeholder="sk-..."
          instructions={[
            <>Go to <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-primary underline">platform.openai.com/api-keys</a></>,
            <>Click "Create new secret key"</>,
            <>Copy the key and paste it above</>,
            <>Add credits at <a href="https://platform.openai.com/settings/organization/billing" target="_blank" rel="noopener noreferrer" className="text-primary underline">Billing</a> ($5 min)</>,
          ]}
          tip="OpenAI is used as a fallback when Gemini is rate-limited. GPT-4o-mini is fast and affordable."
        />

        {/* Priority info */}
        <Card className="bg-card border-border">
          <CardContent className="p-5 space-y-2">
            <p className="text-sm font-medium text-foreground">🔄 AI Provider Priority</p>
            <ol className="list-decimal list-inside text-xs text-muted-foreground space-y-1">
              <li>Lovable AI (workspace credits — automatic)</li>
              <li>Your OpenAI key (if saved — reliable paid fallback)</li>
              <li>Your Gemini key (if saved — free tier available)</li>
            </ol>
            <p className="text-xs text-muted-foreground mt-2">
              The system automatically switches between providers if one is unavailable or rate-limited.
            </p>
          </CardContent>
        </Card>

        {/* Placeholder */}
        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Settings className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">More settings coming soon — persona customization, templates, and more.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

type ApiKeyCardProps = {
  title: string;
  description: React.ReactNode;
  icon: React.ReactNode;
  apiKey: string;
  setApiKey: (v: string) => void;
  showKey: boolean;
  setShowKey: (v: boolean) => void;
  saving: boolean;
  hasKey: boolean;
  onSave: () => void;
  placeholder: string;
  instructions: React.ReactNode[];
  tip: string;
};

const ApiKeyCard = ({
  title, description, icon, apiKey, setApiKey, showKey, setShowKey,
  saving, hasKey, onSave, placeholder, instructions, tip,
}: ApiKeyCardProps) => (
  <Card className="bg-card border-border">
    <CardHeader>
      <CardTitle className="flex items-center gap-2 text-lg">
        {icon}
        {title}
        {hasKey && <CheckCircle className="h-4 w-4 text-green-500" />}
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">{description}</p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            type={showKey ? "text" : "password"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={placeholder}
            className="bg-muted border-border text-foreground pr-10"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button onClick={onSave} disabled={saving} className="gradient-primary text-primary-foreground gap-1.5">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>

      {hasKey && (
        <p className="text-xs text-green-500/80">✅ API key is configured and active</p>
      )}

      <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">How to get an API key:</p>
        <ol className="list-decimal list-inside space-y-0.5">
          {instructions.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        <p className="mt-2">{tip}</p>
      </div>
    </CardContent>
  </Card>
);

export default SettingsPage;
