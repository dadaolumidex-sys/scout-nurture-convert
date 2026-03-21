import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Settings, Key, Eye, EyeOff, Save, CheckCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SettingsPage = () => {
  const { user } = useAuth();
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasKey, setHasKey] = useState(false);

  useEffect(() => {
    if (user) loadSettings();
  }, [user]);

  const loadSettings = async () => {
    const { data } = await (supabase
      .from("user_settings" as any)
      .select("gemini_api_key")
      .eq("user_id", user!.id)
      .single() as any);
    if (data?.gemini_api_key) {
      setHasKey(true);
      setApiKey(data.gemini_api_key);
    }
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      toast.error("Please enter an API key");
      return;
    }
    setSaving(true);
    const { error } = await (supabase
      .from("user_settings" as any)
      .upsert({
        user_id: user!.id,
        gemini_api_key: apiKey.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" }) as any);

    if (error) {
      toast.error("Failed to save API key");
    } else {
      setHasKey(true);
      toast.success("API key saved! AI chat should work now.");
    }
    setSaving(false);
  };

  const maskedKey = apiKey ? apiKey.slice(0, 10) + "..." + apiKey.slice(-4) : "";

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground text-sm">Configure your StreamScout AI workspace</p>
        </div>

        {/* API Key Section */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Key className="h-5 w-5 text-primary" />
              AI API Key (Gemini)
              {hasKey && <CheckCircle className="h-4 w-4 text-green-500" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enter your Google Gemini API key to power the AI chat, reply suggestions, and analysis features.
              Get a free key from{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                Google AI Studio
              </a>.
            </p>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy..."
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
              <Button onClick={handleSave} disabled={saving} className="gradient-primary text-primary-foreground gap-1.5">
                <Save className="h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>

            {hasKey && (
              <p className="text-xs text-green-500/80">
                ✅ API key is configured and active
              </p>
            )}

            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">How to get a free API key:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Go to <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary underline">aistudio.google.com/apikey</a></li>
                <li>Click "Create API key"</li>
                <li>Select "Create API key in new project"</li>
                <li>Copy the key and paste it above</li>
              </ol>
              <p className="mt-2">Free tier includes 1,500 requests/day. If you hit limits, create a new key in a new project.</p>
            </div>
          </CardContent>
        </Card>

        {/* Placeholder for future settings */}
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

export default SettingsPage;