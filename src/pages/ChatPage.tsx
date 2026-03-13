import { useState, useRef, useEffect } from "react";
import { Send, Bot, Plus, ImagePlus, Sparkles, X, Trash2, Pencil, Check, MoreVertical, MessageSquare, ChevronLeft } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Message = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
};

type Conversation = {
  id: string;
  title: string;
  persona: string;
  created_at: string;
  updated_at: string;
};

type Persona = "friend" | "promoter";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const personaConfig = {
  friend: {
    name: "Nifimas",
    label: "Friend Mode",
    emoji: "🤝",
    description: "Friendly, casual, supportive",
    badgeClass: "border-secondary text-secondary",
  },
  promoter: {
    name: "Brozeen",
    label: "Promoter Mode",
    emoji: "💼",
    description: "Confident, professional",
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
  const { user } = useAuth();
  const [persona, setPersona] = useState<Persona>("friend");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const config = personaConfig[persona];

  useEffect(() => {
    if (user) loadConversations();
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadConversations = async () => {
    const { data } = await (supabase.from("ai_conversations" as any)
      .select("*")
      .order("updated_at", { ascending: false }) as any);
    if (data) setConversations(data);
  };

  const loadMessages = async (convId: string) => {
    const { data } = await (supabase.from("ai_messages" as any)
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true }) as any);
    if (data) {
      setMessages(data.map((m: any) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        images: m.images?.length > 0 ? m.images : undefined,
      })));
    }
  };

  const selectConversation = async (conv: Conversation) => {
    setActiveConvId(conv.id);
    setPersona(conv.persona as Persona);
    await loadMessages(conv.id);
    setShowSidebar(false);
  };

  const handleNewChat = async () => {
    const { data } = await (supabase.from("ai_conversations" as any).insert({
      user_id: user?.id,
      title: "New Chat",
      persona,
    }).select().single() as any);

    if (data) {
      setActiveConvId(data.id);
      setMessages([]);
      setInput("");
      setPendingImages([]);
      await loadConversations();
      setShowSidebar(false);
    }
  };

  const handleDeleteConversation = async (convId: string) => {
    await (supabase.from("ai_conversations" as any).delete().eq("id", convId) as any);
    if (activeConvId === convId) {
      setActiveConvId(null);
      setMessages([]);
    }
    await loadConversations();
    toast.success("Conversation deleted");
  };

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

  const handleEditMessage = async (msgId: string) => {
    if (!editContent.trim()) return;
    await (supabase.from("ai_messages" as any).update({ content: editContent, updated_at: new Date().toISOString() }).eq("id", msgId) as any);
    setEditingId(null);
    setEditContent("");
    if (activeConvId) await loadMessages(activeConvId);
    toast.success("Message updated");
  };

  const handleDeleteMessage = async (msgId: string) => {
    await (supabase.from("ai_messages" as any).delete().eq("id", msgId) as any);
    if (activeConvId) await loadMessages(activeConvId);
    toast.success("Message deleted");
  };

  const handleSend = async () => {
    if ((!input.trim() && pendingImages.length === 0) || loading) return;

    // Create conversation if none active
    let convId = activeConvId;
    if (!convId) {
      const { data } = await (supabase.from("ai_conversations" as any).insert({
        user_id: user?.id,
        title: input.trim().slice(0, 50) || "Image Chat",
        persona,
      }).select().single() as any);
      if (!data) { toast.error("Failed to create conversation"); return; }
      convId = data.id;
      setActiveConvId(convId);
      await loadConversations();
    }

    const userMsg: Message = {
      role: "user",
      content: input,
      images: pendingImages.length > 0 ? [...pendingImages] : undefined,
    };

    // Save user message to DB
    await (supabase.from("ai_messages" as any).insert({
      conversation_id: convId,
      role: "user",
      content: input,
      images: pendingImages.length > 0 ? pendingImages : [],
    }) as any);

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setPendingImages([]);
    setLoading(true);

    let assistantSoFar = "";

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && !last.id) {
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
        deepResearch,
        onDelta: upsertAssistant,
        onDone: async () => {
          setLoading(false);
          // Save assistant message to DB
          if (assistantSoFar) {
            await (supabase.from("ai_messages" as any).insert({
              conversation_id: convId,
              role: "assistant",
              content: assistantSoFar,
            }) as any);
            // Update conversation title and timestamp
            await (supabase.from("ai_conversations" as any).update({
              updated_at: new Date().toISOString(),
            }).eq("id", convId) as any);
            // Reload to get IDs
            if (convId) await loadMessages(convId);
            await loadConversations();
          }
        },
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
      <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)] sm:h-[calc(100vh-8rem)] animate-slide-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-foreground truncate">AI Chat</h1>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSidebar(!showSidebar)}
              className="gap-1 text-xs sm:text-sm"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Chats</span>
              {conversations.length > 0 && (
                <Badge variant="secondary" className="ml-0.5 h-4 px-1 text-[10px]">{conversations.length}</Badge>
              )}
            </Button>
            <Button variant="outline" size="sm" onClick={handleNewChat} className="gap-1 text-xs sm:text-sm">
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPersona(persona === "friend" ? "promoter" : "friend")}
              className={`${config.badgeClass} text-xs sm:text-sm`}
            >
              {config.emoji} <span className="hidden sm:inline ml-1">{config.name}</span>
            </Button>
          </div>
        </div>

        {/* Conversation list overlay */}
        {showSidebar && (
          <Card className="mb-3 bg-card border-border max-h-60 overflow-auto">
            <CardContent className="p-2 space-y-1">
              {conversations.length === 0 ? (
                <p className="text-xs text-muted-foreground p-2 text-center">No saved chats yet</p>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`flex items-center justify-between gap-2 p-2 rounded-lg cursor-pointer transition-colors text-sm ${
                      conv.id === activeConvId ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                    onClick={() => selectConversation(conv)}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate text-foreground">{conv.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {personaConfig[conv.persona as Persona]?.emoji} {new Date(conv.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={(e) => { e.stopPropagation(); handleDeleteConversation(conv.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Toolbar */}
        <div className="flex items-center gap-2 mb-3">
          <Button
            variant={deepResearch ? "default" : "outline"}
            size="sm"
            onClick={() => setDeepResearch(!deepResearch)}
            className={`gap-1 text-xs ${deepResearch ? "gradient-primary text-primary-foreground" : ""}`}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Deep Research
          </Button>
          {deepResearch && (
            <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
              Advanced model
            </Badge>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto space-y-3 mb-3">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground px-4">
                <Bot className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Ask anything — your chats are saved automatically</p>
                <p className="text-xs mt-1">Upload images, toggle Deep Research, or switch personas</p>
              </div>
            </div>
          )}
          {messages.map((msg, i) => (
            <div
              key={msg.id || i}
              className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`group relative max-w-[85%] rounded-xl px-3 py-2.5 text-sm ${
                  msg.role === "user"
                    ? "bg-muted text-foreground"
                    : "bg-accent text-accent-foreground border border-border"
                }`}
              >
                {msg.images && msg.images.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {msg.images.map((img, idx) => (
                      <img
                        key={idx}
                        src={img}
                        alt={`Uploaded ${idx + 1}`}
                        className="rounded-lg max-h-32 object-cover border border-border"
                      />
                    ))}
                  </div>
                )}

                {editingId === msg.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="bg-background border-border text-foreground text-sm min-h-[60px]"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleEditMessage(msg.id!)} className="h-6 px-2 text-xs text-primary">
                        <Check className="h-3 w-3 mr-1" /> Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)} className="h-6 px-2 text-xs text-muted-foreground">
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
                {editingId !== msg.id && msg.id && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                        <MoreVertical className="h-3 w-3" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border">
                        {msg.role === "assistant" && (
                          <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied!"); }} className="text-foreground text-xs">
                            Copy
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => { setEditingId(msg.id!); setEditContent(msg.content); }} className="text-foreground text-xs">
                          <Pencil className="h-3 w-3 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDeleteMessage(msg.id!)} className="text-destructive text-xs">
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

        {/* Pending images */}
        {pendingImages.length > 0 && (
          <div className="flex gap-2 mb-2 flex-wrap">
            {pendingImages.map((img, idx) => (
              <div key={idx} className="relative group">
                <img src={img} alt={`Pending ${idx + 1}`} className="h-14 w-14 rounded-lg object-cover border border-border" />
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
        <div className="flex gap-2 items-end">
          <div className="flex-1 relative">
            <Textarea
              placeholder="Type your message..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none min-h-[44px] max-h-[120px] pr-10 text-sm"
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
              className="absolute right-1.5 bottom-1.5 h-7 w-7 text-muted-foreground hover:text-foreground"
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
            className="gradient-primary text-primary-foreground h-10 w-10 p-0 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ChatPage;
