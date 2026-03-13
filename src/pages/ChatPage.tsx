import { useState } from "react";
import { Send, Bot, User, ToggleLeft, ToggleRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Persona = "friend" | "promoter";

const personaConfig = {
  friend: {
    name: "Nifimas",
    label: "Friend Mode",
    emoji: "🤝",
    description: "Friendly, casual, supportive — build trust and rapport",
    badgeClass: "border-secondary text-secondary",
  },
  promoter: {
    name: "Brozeen",
    label: "Promoter Mode",
    emoji: "💼",
    description: "Confident, professional — present and convert",
    badgeClass: "border-primary text-primary",
  },
};

const ChatPage = () => {
  const [persona, setPersona] = useState<Persona>("friend");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const config = personaConfig[persona];

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    // Mock AI response — will be replaced with real AI
    await new Promise((r) => setTimeout(r, 1500));

    const mockReply =
      persona === "friend"
        ? "That's a great conversation so far! I'd suggest something like: 'Hey, I really enjoyed your last stream — the energy was incredible. Have you thought about doing some collabs? I know a few people who could help boost your reach 😊'"
        : "Based on this conversation, here's a professional follow-up: 'I appreciate you sharing that. Many streamers at your stage face the same challenge with discoverability. I specialize in helping creators break through that plateau. Would you be open to a 10-minute call to explore some strategies?'";

    setMessages((prev) => [...prev, { role: "assistant", content: mockReply }]);
    setLoading(false);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)] animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Chat Assistant</h1>
            <p className="text-muted-foreground text-sm">
              Paste conversation messages and get AI reply suggestions
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPersona(persona === "friend" ? "promoter" : "friend")}
              className={`${config.badgeClass} hover:opacity-80`}
            >
              {config.emoji} {config.name}
            </Button>
          </div>
        </div>

        {/* Persona Banner */}
        <Card className="bg-muted border-border mb-4">
          <CardContent className="p-3 flex items-center gap-3">
            <span className="text-xl">{config.emoji}</span>
            <div>
              <p className="text-sm font-medium text-foreground">
                {config.label} — {config.name}
              </p>
              <p className="text-xs text-muted-foreground">{config.description}</p>
            </div>
          </CardContent>
        </Card>

        {/* Messages */}
        <div className="flex-1 overflow-auto space-y-3 mb-4">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Paste a conversation and get AI-powered reply suggestions</p>
                <p className="text-xs mt-1">Switch personas to change the reply style</p>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-muted text-foreground"
                    : "bg-accent text-accent-foreground border border-border"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
                {msg.role === "assistant" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs text-primary hover:text-primary/80 p-0 h-auto"
                    onClick={() => {
                      navigator.clipboard.writeText(msg.content);
                      toast.success("Copied!");
                    }}
                  >
                    Copy reply
                  </Button>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="bg-accent rounded-xl px-4 py-3 text-sm text-muted-foreground animate-pulse">
                {config.name} is thinking...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-3">
          <Textarea
            placeholder="Paste the conversation or type your message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none min-h-[80px]"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="gradient-primary text-primary-foreground self-end h-10 w-10 p-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ChatPage;
