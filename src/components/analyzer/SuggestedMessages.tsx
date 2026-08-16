import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, MessageSquarePlus } from "lucide-react";

type Props = {
  friendMessage: string;
  promoterMessage: string;
  streamerMessage?: string;
  onStartConversation?: (persona: "friend" | "promoter" | "streamer") => void;
};

const ANGLES = [
  {
    key: "friend" as const,
    title: "🤝 Friendship",
    hint: "Warm gamer-to-gamer opener. No selling — build rapport first.",
    accent: "text-secondary",
    border: "border-secondary",
    hover: "hover:bg-secondary/10",
  },
  {
    key: "promoter" as const,
    title: "💼 Promoter & Closer",
    hint: "Names the gap, gives value, handles objections, and closes when they are ready.",
    accent: "text-primary",
    border: "border-primary",
    hover: "hover:bg-primary/10",
  },
  {
    key: "streamer" as const,
    title: "🎤 Expert Proof",
    hint: "Backup authority: use proof and experience to support the Promoter & Closer.",
    accent: "text-info",
    border: "border-info",
    hover: "hover:bg-info/10",
  },
];

export const SuggestedMessages = ({ friendMessage, promoterMessage, streamerMessage, onStartConversation }: Props) => {
  const messages: Record<string, string> = {
    friend: friendMessage,
    promoter: promoterMessage,
    streamer: streamerMessage || "",
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-base font-bold text-foreground">Opening messages you can send on Discord</h2>
        <p className="text-sm text-muted-foreground">
          Pick the angle that fits this streamer. "Start conversation" opens them in your Inbox so you can paste their reply and get the next message.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {ANGLES.filter((a) => messages[a.key]).map((angle) => (
          <Card key={angle.key} className="bg-card border-border flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className={`text-sm ${angle.accent}`}>{angle.title}</CardTitle>
              <p className="text-xs text-muted-foreground">{angle.hint}</p>
            </CardHeader>
            <CardContent className="flex flex-col flex-1 justify-between gap-3">
              <p className="text-[15px] font-medium text-foreground/90 leading-relaxed">"{messages[angle.key]}"</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={`${angle.border} ${angle.accent} ${angle.hover}`}
                  onClick={() => {
                    navigator.clipboard.writeText(messages[angle.key]);
                    toast.success("Message copied!");
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
                </Button>
                {onStartConversation && (
                  <Button size="sm" variant="secondary" onClick={() => onStartConversation(angle.key)}>
                    <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" /> Start conversation
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};
