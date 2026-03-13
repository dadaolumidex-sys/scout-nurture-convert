import { useState, useRef, useEffect } from "react";
import { Send, Bot } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Persona = "friend" | "promoter";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

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

async function streamChat({
  messages,
  persona,
  onDelta,
  onDone,
  onError,
}: {
  messages: Message[];
  persona: Persona;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages, persona }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    onError(err.error || `Error ${resp.status}`);
    return;
  }

  if (!resp.body) {
    onError("No response stream");
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let idx: number;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (json === "[DONE]") { onDone(); return; }
      try {
        const parsed = JSON.parse(json);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) onDelta(content);
      } catch {
        buffer = line + "\n" + buffer;
        break;
      }
    }
  }
  onDone();
}

const ChatPage = () => {
  const [persona, setPersona] = useState<Persona>("friend");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const config = personaConfig[persona];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: Message = { role: "user", content: input };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return prev.map((m, i) =>
            i === prev.length - 1 ? { ...m, content: assistantSoFar } : m
          );
        }
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: newMessages,
        persona,
        onDelta: upsertAssistant,
        onDone: () => setLoading(false),
        onError: (msg) => {
          toast.error(msg);
          setLoading(false);
        },
      });
    } catch (e) {
      console.error(e);
      toast.error("Failed to get AI response");
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)] animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">AI Chat Assistant</h1>
            <p className="text-muted-foreground text-sm">
              Ask anything — strategy, settings, ideas, or get reply suggestions
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
                <p className="text-sm">Ask me anything — strategy, settings, ideas, or paste a conversation for reply suggestions</p>
                <p className="text-xs mt-1">Switch personas to change the response style</p>
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
                {msg.role === "assistant" ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
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
          {loading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-3">
              <div className="bg-accent rounded-xl px-4 py-3 text-sm text-muted-foreground animate-pulse">
                {config.name} is thinking...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
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
