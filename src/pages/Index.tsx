import { Search, MessageSquare, Bot, TrendingUp, Zap } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { DashboardLayout } from "@/components/DashboardLayout";

const stats = [
  { label: "Streamers Analyzed", value: "0", icon: Search, color: "text-primary" },
  { label: "Active Conversations", value: "0", icon: MessageSquare, color: "text-secondary" },
  { label: "AI Replies Generated", value: "0", icon: Bot, color: "text-accent-foreground" },
  { label: "Conversion Rate", value: "0%", icon: TrendingUp, color: "text-success" },
];

const quickActions = [
  { label: "Analyze Streamer", icon: Search, path: "/analyzer", description: "Paste a Twitch or Kick channel link" },
  { label: "Open Chat", icon: Bot, path: "/chat", description: "Get AI-powered reply suggestions" },
  { label: "View Inbox", icon: MessageSquare, path: "/inbox", description: "Manage your conversations" },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8 animate-slide-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
            Welcome to <span className="text-gradient-primary">StreamScout AI</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Scout streamers, analyze channels, and convert them into clients.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="bg-card border-border">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground">{stat.label}</p>
                    <p className="text-xl sm:text-2xl font-bold text-foreground mt-0.5 sm:mt-1">{stat.value}</p>
                  </div>
                  <stat.icon className={`h-6 w-6 sm:h-8 sm:w-8 ${stat.color} opacity-60`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-foreground mb-3 sm:mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
            {quickActions.map((action) => (
              <Card
                key={action.label}
                className="bg-card border-border hover:border-primary/40 active:scale-[0.98] transition-all cursor-pointer group"
                onClick={() => navigate(action.path)}
              >
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center gap-3 mb-1.5 sm:mb-2">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-lg bg-muted flex items-center justify-center group-hover:bg-accent transition-colors">
                      <action.icon className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm sm:text-base text-foreground">{action.label}</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground">{action.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Getting Started */}
        <Card className="bg-card border-border overflow-hidden">
          <div className="gradient-primary p-[1px] rounded-lg">
            <CardContent className="bg-card rounded-lg p-4 sm:p-6">
              <div className="flex items-center gap-3 mb-2 sm:mb-3">
                <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                <h2 className="text-base sm:text-lg font-semibold text-foreground">Getting Started</h2>
              </div>
              <p className="text-muted-foreground text-xs sm:text-sm mb-3 sm:mb-4">
                Start by analyzing a streamer's channel, then use the AI assistant to craft the perfect outreach message.
              </p>
              <Button
                onClick={() => navigate("/analyzer")}
                className="gradient-primary text-primary-foreground font-semibold hover:opacity-90 w-full sm:w-auto"
              >
                Analyze Your First Streamer
              </Button>
            </CardContent>
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Index;
