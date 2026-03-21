import { useState, useRef, useEffect } from "react";
import { Send, Bot, Plus, ImagePlus, Sparkles, X, Pencil, Trash2, Copy, MoreVertical, Check, RotateCcw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Message = {
  role: "user" | "assistant";
  content: string;
  images?: string[];
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
  deepResearch,
  onDelta,
  onDone,
  onError,
}: {
  messages: Message[];
  persona: Persona;
  deepResearch: boolean;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const apiMessages = messages.map((msg) => {
    if (msg.images && msg.images.length > 0) {
      return {
        role: msg.role,
        content: [
          { type: "text" as const, text: msg.content || "What do you see in this image?" },
          ...msg.images.map((img) => ({
            type: "image_url" as const,
            image_url: { url: img },
          })),
        ],
      };
    }
    return { role: msg.role, content: msg.content };
  });

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: JSON.stringify({ messages: apiMessages, persona, deepResearch }),
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
  const [deepResearch, setDeepResearch] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = personaConfig[persona];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image must be under 10MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setPendingImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setPendingImages([]);
    setEditingIndex(null);
  };

  const sendMessages = async (msgs: Message[]) => {
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
        messages: msgs,
        persona,
        deepResearch,
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

  const handleSend = async () => {
    if ((!input.trim() && pendingImages.length === 0) || loading) return;

    const userMsg: Message = {
      role: "user",
      content: input,
      images: pendingImages.length > 0 ? [...pendingImages] : undefined,
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingImages([]);

    await sendMessages(newMessages);
  };

  const handleEditSave = async (index: number) => {
    if (!editContent.trim()) return;
    // Update the message and remove everything after it, then resend
    const updated = messages.slice(0, index).concat({
      ...messages[index],
      content: editContent,
    });
    setMessages(updated);
    setEditingIndex(null);
    setEditContent("");
    await sendMessages(updated);
  };

  const handleResend = async (index: number) => {
    // Resend from this message onwards (remove assistant replies after it)
    const truncated = messages.slice(0, index + 1);
    setMessages(truncated);
    await sendMessages(truncated);
  };

  const handleDelete = (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
    toast.success("Message deleted");
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
              onClick={handleNewChat}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              New Chat
            </Button>
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

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-4">
          <Button
            variant={deepResearch ? "default" : "outline"}
            size="sm"
            onClick={() => setDeepResearch(!deepResearch)}
            className={`gap-1.5 ${deepResearch ? "gradient-primary text-primary-foreground" : ""}`}
          >
            <Sparkles className="h-4 w-4" />
            Deep Research
          </Button>
          {deepResearch && (
            <Badge variant="outline" className="text-xs border-primary/30 text-primary">
              Uses advanced model for thorough analysis
            </Badge>
          )}
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
                <p className="text-xs mt-1">Upload images, toggle Deep Research, or switch personas</p>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`group relative max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                  msg.role === "user"
                    ? "bg-muted text-foreground"
                    : "bg-accent text-accent-foreground border border-border"
                }`}
              >
                {/* User images */}
                {msg.images && msg.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {msg.images.map((img, idx) => (
                      <img
                        key={idx}
                        src={img}
                        alt={`Uploaded ${idx + 1}`}
                        className="rounded-lg max-h-40 object-cover border border-border"
                      />
                    ))}
                  </div>
                )}

                {editingIndex === i ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="bg-background border-border text-foreground text-sm min-h-[60px]"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleEditSave(i)} className="h-6 px-2 text-xs text-primary">
                        <Check className="h-3 w-3 mr-1" /> Save & Resend
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingIndex(null)} className="h-6 px-2 text-xs text-muted-foreground">
                        <X className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </>
                )}

                {/* Actions menu */}
                {editingIndex !== i && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                        <MoreVertical className="h-3 w-3" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border">
                        <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied!"); }} className="text-foreground">
                          <Copy className="h-3 w-3 mr-2" /> Copy
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditingIndex(i); setEditContent(msg.content); }} className="text-foreground">
                          <Pencil className="h-3 w-3 mr-2" /> Edit
                        </DropdownMenuItem>
                        {msg.role === "user" && (
                          <DropdownMenuItem onClick={() => handleResend(i)} className="text-foreground">
                            <RotateCcw className="h-3 w-3 mr-2" /> Resend
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleDelete(i)} className="text-destructive">
                          <Trash2 className="h-3 w-3 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex gap-3">
              <div className="bg-accent rounded-xl px-4 py-3 text-sm text-muted-foreground animate-pulse">
                {config.name} is {deepResearch ? "researching deeply" : "thinking"}...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Pending image previews */}
        {pendingImages.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {pendingImages.map((img, idx) => (
              <div key={idx} className="relative group">
                <img
                  src={img}
                  alt={`Pending ${idx + 1}`}
                  className="h-16 w-16 rounded-lg object-cover border border-border"
                />
                <button
                  onClick={() => removePendingImage(idx)}
                  className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Textarea
              placeholder="Type your message or upload an image..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none min-h-[80px] pr-12"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 bottom-2 h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              <ImagePlus className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handleImageUpload}
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={loading || (!input.trim() && pendingImages.length === 0)}
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
