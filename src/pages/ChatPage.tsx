import { useState, useRef, useEffect } from "react";
import { Send, Bot, Plus, ImagePlus, Sparkles, X, Pencil, Trash2, Copy, MoreVertical, Check, RotateCcw, ArrowLeft, Cpu } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { useChatHistory, ChatMessage } from "@/hooks/useChatHistory";
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";

type Persona = "friend" | "promoter";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const personaConfig = {
  friend: { name: "Nifimas", label: "Friend", emoji: "🤝", badgeClass: "border-secondary text-secondary" },
  promoter: { name: "Brozeen", label: "Promoter", emoji: "💼", badgeClass: "border-primary text-primary" },
};

async function streamChat({
  messages, persona, deepResearch, onDelta, onDone, onError,
}: {
  messages: ChatMessage[]; persona: Persona; deepResearch: boolean;
  onDelta: (text: string) => void; onDone: () => void; onError: (msg: string) => void;
}) {
  const apiMessages = messages.map((msg) => {
    if (msg.images && msg.images.length > 0) {
      return {
        role: msg.role,
        content: [
          { type: "text" as const, text: msg.content || "Check this conversation and give me the perfect next reply" },
          ...msg.images.map((img) => ({ type: "image_url" as const, image_url: { url: img } })),
        ],
      };
    }
    return { role: msg.role, content: msg.content };
  });

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const resp = await fetch(CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    body: JSON.stringify({ messages: apiMessages, persona, deepResearch }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    onError(err.error || `Error ${resp.status}`);
    return;
  }
  if (!resp.body) { onError("No response stream"); return; }

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

function formatTime(date?: Date) {
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TypingIndicator({ name }: { name: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center shrink-0">
        <Bot className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="bg-accent rounded-2xl rounded-tl-sm px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{name}</span>
          <div className="flex gap-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:150ms]" />
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelBadge({ deepResearch }: { deepResearch: boolean }) {
  return (
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
      <Cpu className="h-2.5 w-2.5" />
      {deepResearch ? "Gemini Pro" : "Gemini Flash"}
    </div>
  );
}

const ChatPage = () => {
  const isMobile = useIsMobile();
  const [persona, setPersona] = useState<Persona>("friend");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [msgTimestamps, setMsgTimestamps] = useState<Date[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendLockRef = useRef(false);

  const {
    conversations, activeId, messages, setMessages,
    loadMessages, createConversation, saveMessage,
    replaceMessages, deleteConversation, startNewChat,
    renameConversation,
  } = useChatHistory();

  const config = personaConfig[persona];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.size > 10 * 1024 * 1024) { toast.error("Image must be under 10MB"); return; }
      const reader = new FileReader();
      reader.onload = () => setPendingImages((prev) => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removePendingImage = (index: number) => setPendingImages((prev) => prev.filter((_, i) => i !== index));

  const handleNewChat = () => {
    startNewChat();
    setInput("");
    setPendingImages([]);
    setEditingIndex(null);
    setMsgTimestamps([]);
    if (isMobile) setMobileView("chat");
  };

  const handleSelectConversation = (id: string) => {
    loadMessages(id);
    setMsgTimestamps([]);
    if (isMobile) setMobileView("chat");
  };

  const handleBackToList = () => setMobileView("list");

  const sendMessagesStream = async (convoId: string, msgs: ChatMessage[]) => {
    sendLockRef.current = true;
    setLoading(true);
    let assistantSoFar = "";
    const unlock = () => { sendLockRef.current = false; setLoading(false); };

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
    };

    try {
      await streamChat({
        messages: msgs, persona, deepResearch,
        onDelta: upsertAssistant,
        onDone: async () => {
          if (assistantSoFar) {
            await saveMessage(convoId, { role: "assistant", content: assistantSoFar });
            setMsgTimestamps(prev => [...prev, new Date()]);
          }
          unlock();
        },
        onError: (msg) => { toast.error(msg); unlock(); },
      });
    } catch (e) { console.error(e); toast.error("Failed to get AI response"); unlock(); }
  };

  const handleSend = async () => {
    if ((!input.trim() && pendingImages.length === 0) || loading || sendLockRef.current) return;

    const userMsg: ChatMessage = {
      role: "user",
      content: input || (pendingImages.length > 0 ? "Check this conversation and give me the perfect next reply" : ""),
      images: pendingImages.length > 0 ? [...pendingImages] : undefined,
    };

    let convoId = activeId;
    if (!convoId) {
      try {
        convoId = await createConversation(persona, deepResearch);
      } catch {
        toast.error("Failed to create conversation");
        return;
      }
    }

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setMsgTimestamps(prev => [...prev, new Date()]);
    setInput("");
    setPendingImages([]);

    await saveMessage(convoId, userMsg);
    await sendMessagesStream(convoId, newMessages);
  };

  const handleEditSave = async (index: number) => {
    if (!editContent.trim() || !activeId) return;
    const updated = messages.slice(0, index).concat({ ...messages[index], content: editContent });
    setMessages(updated);
    setEditingIndex(null);
    setEditContent("");
    await replaceMessages(activeId, updated);
    await sendMessagesStream(activeId, updated);
  };

  const handleResend = async (index: number) => {
    if (!activeId) return;
    const truncated = messages.slice(0, index + 1);
    setMessages(truncated);
    await replaceMessages(activeId, truncated);
    await sendMessagesStream(activeId, truncated);
  };

  const handleDelete = (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
    toast.success("Message deleted");
  };

  const activeConvo = activeId ? conversations.find(c => c.id === activeId) : null;

  // Shared message bubble renderer
  const renderMessages = (maxWidth: string) => (
    <>
      {messages.map((msg, i) => (
        <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
          {msg.role === "assistant" && (
            <div className="h-7 w-7 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-3.5 w-3.5 text-primary" />
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <div className={`group relative rounded-2xl px-3 py-2.5 text-sm ${maxWidth} ${
              msg.role === "user"
                ? "bg-primary/15 text-foreground rounded-tr-sm"
                : "bg-accent text-accent-foreground border border-border rounded-tl-sm"
            }`}>
              {msg.images && msg.images.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {msg.images.map((img, idx) => <img key={idx} src={img} alt={`Upload ${idx + 1}`} className="rounded-lg max-h-32 object-cover border border-border" />)}
                </div>
              )}
              {editingIndex === i ? (
                <div className="space-y-2">
                  <Textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} className="bg-background border-border text-foreground text-sm min-h-[60px]" />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleEditSave(i)} className="h-6 px-2 text-xs text-primary"><Check className="h-3 w-3 mr-1" /> Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingIndex(null)} className="h-6 px-2 text-xs text-muted-foreground"><X className="h-3 w-3 mr-1" /> Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                  ) : (
                    msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </>
              )}
              {editingIndex !== i && (
                <div className={`absolute top-1 right-1 transition-opacity ${isMobile ? "opacity-0 group-active:opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                      <MoreVertical className="h-3 w-3" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-card border-border">
                      <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied!"); }}><Copy className="h-3 w-3 mr-2" /> Copy</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setEditingIndex(i); setEditContent(msg.content); }}><Pencil className="h-3 w-3 mr-2" /> Edit</DropdownMenuItem>
                      {msg.role === "user" && <DropdownMenuItem onClick={() => handleResend(i)}><RotateCcw className="h-3 w-3 mr-2" /> Resend</DropdownMenuItem>}
                      <DropdownMenuItem onClick={() => handleDelete(i)} className="text-destructive"><Trash2 className="h-3 w-3 mr-2" /> Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
            {msgTimestamps[i] && (
              <span className={`text-[10px] text-muted-foreground px-1 ${msg.role === "user" ? "text-right" : "text-left"}`}>
                {formatTime(msgTimestamps[i])}
              </span>
            )}
          </div>
          {msg.role === "user" && (
            <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-primary">Y</span>
            </div>
          )}
        </div>
      ))}
      {loading && messages[messages.length - 1]?.role !== "assistant" && (
        <TypingIndicator name={config.name} />
      )}
      <div ref={messagesEndRef} />
    </>
  );

  const emptyState = (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-muted-foreground px-6">
        <div className="h-16 w-16 mx-auto mb-4 rounded-2xl bg-accent flex items-center justify-center">
          <Bot className="h-8 w-8 text-primary opacity-60" />
        </div>
        <p className="text-base font-semibold text-foreground mb-1">StreamScout AI</p>
        <p className="text-xs mb-4">Ask anything, upload images, or toggle Deep Research for powerful answers 🚀</p>
        <div className="flex flex-wrap justify-center gap-2">
          {["Help me reach a streamer", "Analyze my conversation", "Growth strategies"].map(s => (
            <button key={s} onClick={() => { setInput(s); }} className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // Shared input bar
  const inputBar = (extraClass = "") => (
    <div className={`shrink-0 border-t border-border bg-background ${extraClass}`}>
      <div className="flex items-center gap-2 px-2 pt-1.5">
        <Button variant={deepResearch ? "default" : "ghost"} size="sm" onClick={() => setDeepResearch(!deepResearch)} className={`gap-1 h-7 text-xs rounded-full ${deepResearch ? "gradient-primary text-primary-foreground" : "text-muted-foreground"}`}>
          <Sparkles className="h-3 w-3" /> Deep Research
        </Button>
        <ModelBadge deepResearch={deepResearch} />
      </div>

      {pendingImages.length > 0 && (
        <div className="flex gap-1.5 px-3 pt-1.5 flex-wrap">
          {pendingImages.map((img, idx) => (
            <div key={idx} className="relative group">
              <img src={img} alt={`Pending ${idx + 1}`} className="h-12 w-12 rounded-lg object-cover border border-border" />
              <button onClick={() => removePendingImage(idx)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2 p-2">
        <Button variant="ghost" size="icon" className="h-10 w-10 shrink-0 text-muted-foreground" onClick={() => fileInputRef.current?.click()} type="button">
          <ImagePlus className="h-5 w-5" />
        </Button>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
        <div className="flex-1">
          <Textarea
            placeholder="Ask anything..."
            value={input} onChange={(e) => setInput(e.target.value)}
            className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none min-h-[40px] max-h-[120px] text-sm rounded-2xl px-4 py-2.5"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            rows={1}
          />
        </div>
        <Button onClick={handleSend} disabled={loading || (!input.trim() && pendingImages.length === 0)} className="gradient-primary text-primary-foreground h-10 w-10 p-0 rounded-full shrink-0">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  // Mobile: full-screen list or full-screen chat
  if (isMobile) {
    if (mobileView === "list") {
      return (
        <DashboardLayout>
          <div className="flex flex-col h-[calc(100dvh-8rem)] animate-slide-in">
            <div className="flex items-center justify-between px-1 mb-3">
              <div>
                <h1 className="text-xl font-bold text-foreground">AI Chat</h1>
                <p className="text-xs text-muted-foreground">Upload images • Think deeply • Save to knowledge</p>
              </div>
            </div>
            <ChatHistoryPanel
              conversations={conversations}
              activeId={activeId}
              onSelect={handleSelectConversation}
              onNew={handleNewChat}
              onDelete={deleteConversation}
              onRename={renameConversation}
              isMobile
            />
          </div>
        </DashboardLayout>
      );
    }

    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background">
        {/* Header */}
        <div className="flex items-center gap-2 px-2 py-2 border-b border-border shrink-0 bg-background/95 backdrop-blur">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleBackToList}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground truncate">
              {activeConvo?.title || "New Chat"}
            </h1>
            <ModelBadge deepResearch={deepResearch} />
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPersona(persona === "friend" ? "promoter" : "friend")} className={`${config.badgeClass} hover:opacity-80 h-7 px-2 text-xs border`}>
            {config.emoji} {config.name}
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
          {messages.length === 0 ? emptyState : renderMessages("max-w-[85%]")}
        </div>

        {/* Input */}
        {inputBar("pb-[env(safe-area-inset-bottom)]")}
      </div>
    );
  }

  // Desktop layout
  return (
    <DashboardLayout>
      <div className="flex animate-slide-in h-[calc(100vh-8rem)]">
        <div className="hidden md:flex">
          <ChatHistoryPanel
            conversations={conversations}
            activeId={activeId}
            onSelect={handleSelectConversation}
            onNew={handleNewChat}
            onDelete={deleteConversation}
            onRename={renameConversation}
          />
        </div>

        <div className="flex-1 flex flex-col min-w-0 pl-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="font-bold text-foreground truncate text-xl">
                {activeConvo?.title || "New Chat"}
              </h1>
              <ModelBadge deepResearch={deepResearch} />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="outline" size="sm" onClick={handleNewChat} className="gap-1 h-8 px-2">
                <Plus className="h-3.5 w-3.5" /> New
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPersona(persona === "friend" ? "promoter" : "friend")} className={`${config.badgeClass} hover:opacity-80 h-8 px-2`}>
                {config.emoji} {config.name}
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-3">
            <Button variant={deepResearch ? "default" : "outline"} size="sm" onClick={() => setDeepResearch(!deepResearch)} className={`gap-1 h-7 text-xs ${deepResearch ? "gradient-primary text-primary-foreground" : ""}`}>
              <Sparkles className="h-3.5 w-3.5" /> Deep Research
            </Button>
            {deepResearch && <Badge variant="outline" className="text-xs border-primary/30 text-primary">Advanced analysis</Badge>}
          </div>

          <div className="flex-1 overflow-auto space-y-3 mb-2">
            {messages.length === 0 ? emptyState : renderMessages("max-w-[80%]")}
          </div>

          {pendingImages.length > 0 && (
            <div className="flex gap-1.5 mb-1.5 flex-wrap">
              {pendingImages.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img src={img} alt={`Pending ${idx + 1}`} className="h-14 w-14 rounded-lg object-cover border border-border" />
                  <button onClick={() => removePendingImage(idx)} className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Textarea
                placeholder="Type your message or upload a conversation screenshot..."
                value={input} onChange={(e) => setInput(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none pr-10 min-h-[72px]"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              />
              <Button variant="ghost" size="icon" className="absolute right-1 bottom-1 h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => fileInputRef.current?.click()} type="button">
                <ImagePlus className="h-4 w-4" />
              </Button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
            </div>
            <Button onClick={handleSend} disabled={loading || (!input.trim() && pendingImages.length === 0)} className="gradient-primary text-primary-foreground self-end h-10 w-10 p-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ChatPage;
