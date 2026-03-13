import { useState } from "react";
import { Search, Loader2, TrendingUp, Users, Clock, Zap, Eye, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";

type AnalysisResult = {
  username: string;
  platform: "twitch" | "kick";
  followers: string;
  avgViewers: string;
  frequency: string;
  growthStage: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  promotionPotential: string;
  friendMessage: string;
  promoterMessage: string;
};

const mockAnalysis: AnalysisResult = {
  username: "example_streamer",
  platform: "twitch",
  followers: "~2,400",
  avgViewers: "~15-30",
  frequency: "3-4 times per week",
  growthStage: "Small Creator / Pre-Affiliate",
  strengths: [
    "Consistent streaming schedule",
    "Engaged small community",
    "Good game variety",
  ],
  weaknesses: [
    "Low discoverability — not appearing in browse pages",
    "No social media cross-promotion",
    "Limited networking with other streamers",
  ],
  opportunities: [
    "Raid/host exchange with similar-sized streamers",
    "Clip-based content for TikTok and YouTube Shorts",
    "Community events to boost engagement metrics",
  ],
  promotionPotential:
    "High — this streamer has the consistency but lacks the audience growth strategy. Promotion could significantly accelerate their path to Affiliate/Partner.",
  friendMessage:
    "Hey! I caught your last stream and honestly your energy is really solid. How long have you been streaming? I feel like you're at that point where the right push could really change things for you 🔥",
  promoterMessage:
    "Hi there! I work with streamers in your stage of growth, and I noticed your channel has strong potential. The consistency is already there — what's often missing is discoverability. I'd love to chat about how we could get your stream in front of more eyes. Would you be open to a quick conversation?",
};

const AnalyzerPage = () => {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const handleAnalyze = async () => {
    if (!url.trim()) {
      toast.error("Please paste a Twitch or Kick channel link");
      return;
    }

    const isTwitch = url.includes("twitch.tv");
    const isKick = url.includes("kick.com");

    if (!isTwitch && !isKick) {
      toast.error("Please enter a valid Twitch or Kick channel URL");
      return;
    }

    setLoading(true);
    // Simulate AI analysis — will be replaced with real AI call
    await new Promise((r) => setTimeout(r, 2000));

    const username = url.split("/").filter(Boolean).pop() || "unknown";
    setResult({
      ...mockAnalysis,
      username,
      platform: isTwitch ? "twitch" : "kick",
    });
    setLoading(false);
    toast.success("Analysis complete!");
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Streamer Analyzer</h1>
          <p className="text-muted-foreground mt-1">
            Paste a channel link to get an AI-powered analysis
          </p>
        </div>

        {/* Input */}
        <Card className="bg-card border-border">
          <CardContent className="p-5">
            <div className="flex gap-3">
              <Input
                placeholder="https://twitch.tv/username or https://kick.com/username"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
                onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              />
              <Button
                onClick={handleAnalyze}
                disabled={loading}
                className="gradient-primary text-primary-foreground font-semibold hover:opacity-90 min-w-[120px]"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Analyze
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        {result && (
          <div className="space-y-4 animate-slide-in">
            {/* Overview */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg text-foreground">
                    Streamer Overview
                  </CardTitle>
                  <Badge
                    variant="outline"
                    className="border-primary text-primary capitalize"
                  >
                    {result.platform}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: Users, label: "Followers", value: result.followers },
                  { icon: Eye, label: "Avg Viewers", value: result.avgViewers },
                  { icon: Clock, label: "Frequency", value: result.frequency },
                  { icon: TrendingUp, label: "Stage", value: result.growthStage },
                ].map((m) => (
                  <div key={m.label} className="bg-muted rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <m.icon className="h-4 w-4 text-primary" />
                      <span className="text-xs text-muted-foreground">{m.label}</span>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{m.value}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Strengths / Weaknesses / Opportunities */}
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { title: "Strengths", items: result.strengths, color: "text-success" },
                { title: "Weaknesses", items: result.weaknesses, color: "text-warning" },
                { title: "Opportunities", items: result.opportunities, color: "text-info" },
              ].map((section) => (
                <Card key={section.title} className="bg-card border-border">
                  <CardHeader className="pb-2">
                    <CardTitle className={`text-sm ${section.color}`}>
                      {section.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {section.items.map((item, i) => (
                        <li key={i} className="text-sm text-muted-foreground flex gap-2">
                          <span className={section.color}>•</span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Promotion Potential */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Target className="h-5 w-5 text-primary" />
                  <CardTitle className="text-sm text-foreground">Promotion Potential</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{result.promotionPotential}</p>
              </CardContent>
            </Card>

            {/* Suggested Messages */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-secondary">
                    🤝 Friend Mode (Nifimas)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic">
                    "{result.friendMessage}"
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-secondary text-secondary hover:bg-secondary/10"
                    onClick={() => {
                      navigator.clipboard.writeText(result.friendMessage);
                      toast.success("Copied to clipboard!");
                    }}
                  >
                    Copy Message
                  </Button>
                </CardContent>
              </Card>
              <Card className="bg-card border-border">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-primary">
                    💼 Promoter Mode (Brozeen)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground italic">
                    "{result.promoterMessage}"
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 border-primary text-primary hover:bg-primary/10"
                    onClick={() => {
                      navigator.clipboard.writeText(result.promoterMessage);
                      toast.success("Copied to clipboard!");
                    }}
                  >
                    Copy Message
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AnalyzerPage;
