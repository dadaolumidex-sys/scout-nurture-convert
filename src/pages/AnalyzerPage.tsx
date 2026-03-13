import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { StreamerOverview } from "@/components/analyzer/StreamerOverview";
import { AnalysisSection } from "@/components/analyzer/AnalysisSection";
import { PromotionPotential } from "@/components/analyzer/PromotionPotential";
import { SuggestedMessages } from "@/components/analyzer/SuggestedMessages";

export type AnalysisResult = {
  username: string;
  displayName: string;
  description: string;
  profileImageUrl: string;
  broadcasterType: string;
  createdAt: string;
  platform: "twitch" | "kick";
  followersEstimate: string;
  avgViewers: string;
  streamingFrequency: string;
  growthStage: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  promotionPotential: string;
  friendMessage: string;
  promoterMessage: string;
  isLive: boolean;
  liveTitle: string | null;
  liveGame: string | null;
  liveViewers: number | null;
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

    const platform = isTwitch ? "twitch" : "kick";

    const username = url.split("/").filter(Boolean).pop()?.replace(/[?#].*/, "") || "";
    if (!username) {
      toast.error("Could not extract username from URL");
      return;
    }

    setLoading(true);
    try {
      const functionName = platform === "twitch" ? "analyze-twitch" : "analyze-kick";
      const { data, error } = await supabase.functions.invoke(functionName, {
        body: { username },
      });

      if (error) throw new Error(error.message);
      if (data?.error) {
        toast.error(data.error);
        setLoading(false);
        return;
      }

      setResult(data as AnalysisResult);
      toast.success("Analysis complete!");

      // Auto-save to contacts
      await supabase.from("streamer_contacts" as any).upsert(
        {
          username: data.username,
          platform: data.platform,
          channel_url: platform === "twitch" ? `https://twitch.tv/${data.username}` : `https://kick.com/${data.username}`,
          display_name: data.displayName,
          description: data.description,
          profile_image_url: data.profileImageUrl,
          broadcaster_type: data.broadcasterType,
          created_at_twitch: data.createdAt,
          followers_estimate: data.followersEstimate,
          avg_viewers: data.avgViewers,
          streaming_frequency: data.streamingFrequency,
          growth_stage: data.growthStage,
          strengths: data.strengths,
          weaknesses: data.weaknesses,
          opportunities: data.opportunities,
          promotion_potential: data.promotionPotential,
          friend_message: data.friendMessage,
          promoter_message: data.promoterMessage,
          is_live: data.isLive,
          live_title: data.liveTitle,
          live_game: data.liveGame,
          live_viewers: data.liveViewers,
        } as any,
        { onConflict: "username" as any }
      );
    } catch (err: any) {
      console.error("Analysis failed:", err);
      toast.error(err.message || "Analysis failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Streamer Analyzer</h1>
          <p className="text-muted-foreground mt-1">
            Paste a Twitch or Kick channel link to get a real-time AI-powered analysis
          </p>
        </div>

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

        {result && (
          <div className="space-y-4 animate-slide-in">
            <StreamerOverview result={result} />

            <div className="grid md:grid-cols-3 gap-4">
              <AnalysisSection title="Strengths" items={result.strengths} color="text-success" />
              <AnalysisSection title="Weaknesses" items={result.weaknesses} color="text-warning" />
              <AnalysisSection title="Opportunities" items={result.opportunities} color="text-info" />
            </div>

            <PromotionPotential text={result.promotionPotential} />
            <SuggestedMessages friendMessage={result.friendMessage} promoterMessage={result.promoterMessage} />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default AnalyzerPage;
