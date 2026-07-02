import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageSquare, Globe, Inbox, KeyRound, Sparkles, ArrowRight, ArrowLeft, Check } from "lucide-react";

const STORAGE_KEY = "onboarding_done_v1";

interface Step {
  icon: any;
  title: string;
  body: string;
  cta?: { label: string; to: string };
}

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Welcome 👋",
    body: "This is your all-in-one AI workspace — chat with an AI assistant, run deep web research, find leads, and manage your outreach. Here's a 30-second tour.",
  },
  {
    icon: KeyRound,
    title: "Add your free API keys",
    body: "Paste a free Gemini key (and your Apify key for web search) in Settings → API Keys. This gives you unlimited AI and powers real web results. It's stored privately to your account.",
    cta: { label: "Open Settings", to: "/settings" },
  },
  {
    icon: MessageSquare,
    title: "Chat with AI",
    body: "Ask anything — writing, coding, research, business, or upload a screenshot for the perfect reply. Turn on Deep Research for in-depth answers.",
    cta: { label: "Go to Chat", to: "/chat" },
  },
  {
    icon: Globe,
    title: "Deep Web Search",
    body: "Search Google, YouTube, TikTok, Instagram, Maps, emails and more. Auto-Discover scans multiple platforms at once and ranks the best leads for you.",
    cta: { label: "Try Search", to: "/search" },
  },
  {
    icon: Inbox,
    title: "Save & organize leads",
    body: "Bookmark results, send them to your Inbox in bulk, tag them, and track every conversation through the pipeline. You're all set — enjoy! 🚀",
    cta: { label: "Open Inbox", to: "/inbox" },
  },
];

export function OnboardingTour() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        const t = setTimeout(() => setOpen(true), 600);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, []);

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
    setOpen(false);
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className="max-w-sm p-0 overflow-hidden gap-0 border-border">
        <div className="gradient-primary p-6 flex items-center justify-center">
          <div className="h-14 w-14 rounded-2xl bg-background/20 backdrop-blur flex items-center justify-center">
            <Icon className="h-7 w-7 text-primary-foreground" />
          </div>
        </div>
        <div className="p-5 space-y-3">
          <h2 className="text-lg font-bold text-foreground">{current.title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{current.body}</p>

          {current.cta && (
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5 border-primary/40 text-primary"
              onClick={() => { finish(); navigate(current.cta!.to); }}
            >
              {current.cta.label} <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}

          <div className="flex items-center justify-center gap-1.5 pt-1">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"}`} />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            {step > 0 ? (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} className="gap-1 text-muted-foreground">
                <ArrowLeft className="h-3.5 w-3.5" /> Back
              </Button>
            ) : (
              <Button variant="ghost" size="sm" onClick={finish} className="text-muted-foreground">
                Skip
              </Button>
            )}
            {isLast ? (
              <Button size="sm" onClick={finish} className="gradient-primary text-primary-foreground gap-1.5">
                Get started <Check className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button size="sm" onClick={() => setStep(step + 1)} className="gradient-primary text-primary-foreground gap-1.5">
                Next <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
