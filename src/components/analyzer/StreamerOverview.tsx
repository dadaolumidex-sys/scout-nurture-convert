import { Users, Eye, Clock, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResult } from "@/pages/AnalyzerPage";

export const StreamerOverview = ({ result }: { result: AnalysisResult }) => (
  <Card className="bg-card border-border">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {result.profileImageUrl && (
            <img src={result.profileImageUrl} alt={result.displayName} className="h-10 w-10 rounded-full" />
          )}
          <div>
            <CardTitle className="text-lg text-foreground">{result.displayName}</CardTitle>
            {result.description && (
              <p className="text-xs text-muted-foreground mt-0.5 max-w-md truncate">{result.description}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {result.isLive && <Badge className="bg-destructive text-destructive-foreground">🔴 LIVE</Badge>}
          <Badge variant="outline" className="border-primary text-primary capitalize">{result.platform}</Badge>
        </div>
      </div>
    </CardHeader>
    <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[
        { icon: Users, label: "Followers", value: result.followersEstimate },
        { icon: Eye, label: "Avg Viewers", value: result.avgViewers },
        { icon: Clock, label: "Frequency", value: result.streamingFrequency },
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
);
