import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Zap, Mail, Lock, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

async function ensureProfile(email: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("profiles" as any).upsert({
    user_id: user.id,
    email,
    display_name: email.split("@")[0],
    workspace_name: "My Workspace",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
}

function withAuthTimeout<T>(request: Promise<T>, timeoutMs = 20_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Sign-in is taking too long. Check your internet connection and try again.")), timeoutMs);
    request.then(
      (value) => { window.clearTimeout(timeout); resolve(value); },
      (error) => { window.clearTimeout(timeout); reject(error); },
    );
  });
}

function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : "Authentication failed";
  if (/sign-in is taking too long/i.test(message)) {
    return "StreamScout's sign-in service is not responding right now. Your internet can be working; this is the app's secure database connection. Please try again shortly.";
  }
  if (/failed to fetch|networkerror|network request failed/i.test(message)) {
    return "Could not reach StreamScout's sign-in service. Your internet may be working, but the app's secure database connection is unavailable right now. Please try again shortly.";
  }
  return message;
}

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace("/");
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!navigator.onLine) {
      toast.error("You are offline. Connect to the internet, then try signing in again.");
      return;
    }
    setLoading(true);

    try {
      if (isLogin) {
        const { error } = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }));
        if (error) throw error;
        // A profile is useful, but it must never keep a successful sign-in
        // spinning if the database is slow or temporarily unavailable.
        void ensureProfile(email);
        toast.success("Welcome back!");
        window.location.href = "/";
      } else {
        const { data, error } = await withAuthTimeout(supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: email.split("@")[0], workspace_name: "My Workspace" },
          },
        }));
        if (error) throw error;
        if (!data.session) {
          const { error: signInError } = await withAuthTimeout(supabase.auth.signInWithPassword({ email, password }));
          if (signInError) throw signInError;
        }
        void ensureProfile(email);
        toast.success("Account created! Welcome 🎉");
        window.location.href = "/";
      }
    } catch (error: any) {
      toast.error(friendlyAuthError(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.14),transparent_34%),linear-gradient(180deg,hsl(var(--background)),hsl(var(--sidebar-background)))]" />
      <Card className="relative w-full max-w-md gradient-card border-border shadow-2xl shadow-primary/10">
        <CardHeader className="text-center space-y-3 pb-3">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl gradient-primary glow-primary">
              <Zap className="h-6 w-6 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl text-foreground">StreamScout AI</CardTitle>
          <p className="text-sm text-muted-foreground">
            {isLogin ? "Sign in with Gmail and password" : "Create your private workspace instantly"}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-9"
                required
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Password (min 6 chars)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-9"
                minLength={6}
                required
              />
            </div>
            <Button type="submit" className="w-full gradient-primary text-primary-foreground h-11 glow-primary" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isLogin ? "Sign In" : "Create Account"}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary hover:underline"
            >
              {isLogin ? "Sign Up" : "Sign In"}
            </button>
          </p>

          <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p>Each team member has a private workspace. API keys, chats, searches, contacts, and training data stay isolated per account.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthPage;
