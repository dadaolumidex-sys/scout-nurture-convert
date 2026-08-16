import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Send, Bot, Plus, ImagePlus, Sparkles, X, Pencil, Trash2, Copy, MoreVertical, Check, RotateCcw, ArrowLeft, Cpu, AlertTriangle, KeyRound, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useIsMobile } from "@/hooks/use-mobile";
import { useChatHistory, ChatMessage } from "@/hooks/useChatHistory";
import { useMemory } from "@/hooks/useMemory";
import { useAuth } from "@/hooks/useAuth";
import { guestStorage } from "@/lib/guestStorage";
import { ChatHistoryPanel } from "@/components/chat/ChatHistoryPanel";
import { ChatComposer, ChatComposerHandle } from "@/components/chat/ChatComposer";
import { compressImageFile } from "@/lib/imageCompress";
import { generatePersonalChatReply } from "@/lib/personalChat";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";


type Persona = "friend" | "promoter";
type InboxPersona = Persona | "streamer";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const personaConfig = {
  friend: { name: "Friendship", label: "Friendship", emoji: "🤝", badgeClass: "border-secondary text-secondary" },
  promoter: { name: "Promoter & Closer", label: "Promoter & Closer", emoji: "💼", badgeClass: "border-primary text-primary" },
};

async function streamChat({
  messages, persona, deepResearch, memory, knowledge, signal, onDelta, onDone, onError,
}: {
  messages: ChatMessage[]; persona: Persona; deepResearch: boolean; memory?: string[]; knowledge?: unknown[];
  signal?: AbortSignal;
  onDelta: (text: string) => void; onDone: () => void | Promise<void>; onError: (msg: string, code?: string) => void;
}) {
  // Only the most recent user turn keeps its images. Re-uploading every old
  // screenshot on every turn is what made replies crawl (especially on phones).
  const lastImageIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user" && messages[i].images?.length) return i;
    }
    return -1;
  })();

  const apiMessages = messages.map((msg, i) => {
    if (i === lastImageIndex && msg.images && msg.images.length > 0) {
      return {
        role: msg.role,
        content: [
          { type: "text" as const, text: msg.content || "Check this conversation and give me the perfect next reply" },
          ...msg.images.map((img) => ({ type: "image_url" as const, image_url: { url: img } })),
        ],
      };
    }
    return {
      role: msg.role,
      content: msg.content || (msg.images?.length ? "[image sent earlier]" : ""),
    };
  });


  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const tryPersonalFallback = async () => {
    if (!session?.user) throw new Error("A signed-in personal key is required for the backup reply.");
    const reply = await generatePersonalChatReply({
      messages: apiMessages,
      persona,
      deepResearch,
      memory,
      knowledge,
    });
    onDelta(reply);
    await onDone();
  };

  // A person's own active Gemini key is normally the quickest path. It also
  // avoids waiting on a busy hosted AI service before discovering a provider
  // model is unavailable for that account.
  if (session?.user) {
    try {
      await tryPersonalFallback();
      return;
    } catch (error) {
      console.warn("Personal Chat AI unavailable; trying the hosted backup.", error);
    }
  }

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  // A normal reply should either begin quickly or move to the backup path.
  const timeout = window.setTimeout(() => controller.abort(), deepResearch ? 60_000 : 28_000);
  let resp: Response;
  try {
    resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ messages: apiMessages, persona, deepResearch, memory: memory || [], knowledge: knowledge || [] }),
      signal: controller.signal,
    });
  } catch (error) {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
    try {
      await tryPersonalFallback();
    } catch {
      throw error;
    }
    return;
  }


  // Error responses come back as JSON (even with HTTP 200) — detect and surface them.
  const contentType = resp.headers.get("content-type") || "";
  if (!resp.ok || contentType.includes("application/json")) {
    const err = await resp.json().catch(() => ({ error: "Request failed" }));
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
    try {
      await tryPersonalFallback();
    } catch {
      onError(err.error || `Error ${resp.status}`, err.code);
    }
    return;
  }
  if (!resp.body) {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
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
      if (json === "[DONE]") {
        window.clearTimeout(timeout);
        signal?.removeEventListener("abort", abortFromCaller);
        await onDone();
        return;
      }
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
  window.clearTimeout(timeout);
  signal?.removeEventListener("abort", abortFromCaller);
  await onDone();
}

function formatTime(date?: Date) {
  if (!date) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function TypingIndicator({ name }: { name: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="h-7 w-7 rounded-full bg-card flex items-center justify-center shrink-0 border border-border">
        <Bot className="h-3.5 w-3.5 text-secondary" />
      </div>
      <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-3 py-2.5">
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
    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-medium text-muted-foreground" title={deepResearch ? "Gemini Flash with deeper analysis" : "Gemini Flash for fast replies"}>
      <Cpu className="h-2.5 w-2.5" />
      {deepResearch ? "Gemini Flash · Deep" : "Gemini Flash · Fast"}
    </div>
  );
}

const ChatPage = () => {
  const isMobile = useIsMobile();
  const { memories, addMany, enabled: memoryEnabled } = useMemory();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [persona, setPersona] = useState<Persona>("friend");
  const [aiError, setAiError] = useState<{ msg: string; code?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [deepResearch, setDeepResearch] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [imageLoading, setImageLoading] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [msgTimestamps, setMsgTimestamps] = useState<Date[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportPersona, setExportPersona] = useState<InboxPersona>("friend");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const composerRef = useRef<ChatComposerHandle>(null);
  const sendLockRef = useRef(false);
  const requestAbortRef = useRef<AbortController | null>(null);

  const {
    conversations, activeId, messages, setMessages,
    loadMessages, createConversation, saveMessage,
    replaceMessages, deleteConversation, startNewChat,
    renameConversation,
  } = useChatHistory();

  // Track which conversation is on screen so streamed tokens/saves never bleed
  // into a different chat if the user switches while a reply is streaming.
  const activeIdRef = useRef<string | null>(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const config = personaConfig[persona];
  const draftKey = `streamscout_ai_draft_${user?.id || "guest"}_${activeId || "new"}`;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: loading ? "auto" : "smooth" });
  }, [messages, loading]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    if (fileInputRef.current) fileInputRef.current.value = "";

    setImageLoading(true);
    try {
      const accepted = list.slice(0, 3);
      if (list.length > accepted.length) toast.info("You can analyze up to 3 images at once");
      const prepared: string[] = [];
      for (const file of accepted) {
        if (file.size > 20 * 1024 * 1024) { toast.error(`${file.name} is over 20MB`); continue; }
        try {
          const compressed = await compressImageFile(file);
          prepared.push(compressed);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : `Couldn't read ${file.name}`);
        }
      }
      if (prepared.length > 0) setPendingImages((prev) => [...prev, ...prepared].slice(0, 3));
    } finally {
      setImageLoading(false);
    }
  };


  const removePendingImage = (index: number) => setPendingImages((prev) => prev.filter((_, i) => i !== index));

  const handleNewChat = () => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    sendLockRef.current = false;
    setLoading(false);
    activeIdRef.current = null;
    startNewChat();
    setPendingImages([]);
    setEditingIndex(null);
    setMsgTimestamps([]);
    if (isMobile) setMobileView("chat");
  };

  const handleSelectConversation = (id: string) => {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
    sendLockRef.current = false;
    setLoading(false);
    activeIdRef.current = id;
    setAiError(null);
    loadMessages(id);
    setMsgTimestamps([]);
    if (isMobile) setMobileView("chat");
  };

  const handleBackToList = () => setMobileView("list");

  // Fire-and-forget: extract durable facts from the exchange and add them to long-term memory.
  const captureMemory = async (msgs: ChatMessage[]) => {
    if (!memoryEnabled) return;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({
          messages: msgs.map((m) => ({ role: m.role, content: m.content })),
          knownMemory: memories.map((m) => m.content),
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.facts) && data.facts.length > 0) {
        await addMany(data.facts, "auto");
      }
    } catch (e) {
      console.error("memory capture failed", e);
    }
  };

  const sendMessagesStream = async (convoId: string, msgs: ChatMessage[]) => {
    requestAbortRef.current?.abort();
    const requestController = new AbortController();
    requestAbortRef.current = requestController;
    sendLockRef.current = true;
    setLoading(true);
    setAiError(null);
    let assistantSoFar = "";
    let lastPaint = 0;
    let paintTimer: number | null = null;
    const unlock = () => {
      if (paintTimer !== null) window.clearTimeout(paintTimer);
      if (requestAbortRef.current === requestController) requestAbortRef.current = null;
      sendLockRef.current = false;
      setLoading(false);
    };
    // Only touch on-screen state while THIS conversation is still the active one.
    const isStillActive = () => activeIdRef.current === convoId;

    const paintAssistant = () => {
      paintTimer = null;
      if (!isStillActive()) return; // user switched chats mid-stream — don't bleed into another chat
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        return [...prev, { role: "assistant", content: assistantSoFar }];
      });
      lastPaint = Date.now();
    };

    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      if (Date.now() - lastPaint >= 80) paintAssistant();
      else if (paintTimer === null) paintTimer = window.setTimeout(paintAssistant, 80);
    };

    const memoryPayload = memoryEnabled ? memories.map((m) => m.content) : [];
    // Guests: pass their locally-saved knowledge/objections so the AI can use them.
    const guestKnowledge = user ? [] : guestStorage.knowledge.list();

    try {
      await streamChat({
        messages: msgs, persona, deepResearch,
        memory: memoryPayload,
        knowledge: guestKnowledge,
        signal: requestController.signal,
        onDelta: upsertAssistant,
        onDone: async () => {
          try {
            if (assistantSoFar) {
              paintAssistant();
              // Always persist to the conversation the reply belongs to.
              await saveMessage(convoId, { role: "assistant", content: assistantSoFar });
              if (isStillActive()) setMsgTimestamps(prev => [...prev, new Date()]);
              void captureMemory([...msgs, { role: "assistant", content: assistantSoFar }]);
            }
          } finally {
            unlock();
          }
        },
        onError: (msg, code) => { if (isStillActive()) { setAiError({ msg, code }); } toast.error(msg); unlock(); },
      });
    } catch (e) {
      console.error(e);
      if (!requestController.signal.aborted || requestAbortRef.current === requestController) {
        toast.error(e instanceof DOMException && e.name === "AbortError" ? "The reply took too long. Please try again." : "Failed to get AI response");
      }
      unlock();
    }
  };

  const handleSend = async (rawText: string) => {
    const text = rawText.trim();
    if ((!text && pendingImages.length === 0) || loading || sendLockRef.current) return;
    if (imageLoading) { toast.info("Still preparing your image…"); return; }

    const userMsg: ChatMessage = {
      role: "user",
      content: text || (pendingImages.length > 0 ? "Check this conversation and give me the perfect next reply" : ""),
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
    // Mark this chat as the one on screen immediately: the state-driven ref
    // updates a tick later, and without this a brand-new chat would drop its
    // very first streamed reply.
    activeIdRef.current = convoId;

    // Each conversation is isolated: only its own messages are sent to the AI.
    // Long-term "remembering" comes from the durable memory system, not from
    // pulling raw messages of a different chat/person.
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setMsgTimestamps(prev => [...prev, new Date()]);
    setPendingImages([]);

    // Persist in the background so the AI request starts immediately.
    void saveMessage(convoId, userMsg);
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

  const handleRetryLast = async () => {
    if (!activeId || loading || sendLockRef.current) return;
    // Drop a trailing empty/failed assistant turn, then resend from the last user message.
    let msgs = [...messages];
    if (msgs[msgs.length - 1]?.role === "assistant") msgs = msgs.slice(0, -1);
    if (msgs.length === 0) return;
    setMessages(msgs);
    await sendMessagesStream(activeId, msgs);
  };

  const handleDelete = (index: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== index));
    toast.success("Message deleted");
  };

  const activeConvo = activeId ? conversations.find(c => c.id === activeId) : null;

  const openExportDialog = () => {
    const savedPersona = activeConvo?.persona;
    setExportPersona(savedPersona === "promoter" || savedPersona === "streamer" ? savedPersona : "friend");
    setExportOpen(true);
  };

  const exportToInbox = async () => {
    if (!user || !activeConvo || messages.length === 0) {
      toast.error("Open a named AI Chat with messages first");
      return;
    }
    const clientName = activeConvo.title.trim();
    if (!clientName || clientName === "New Chat") {
      toast.error("Name this AI Chat first so it can be linked to the right client");
      return;
    }

    setExporting(true);
    try {
      // Reuse a client with the same name when it already exists. Otherwise,
      // create a new manual Inbox client. The AI chat itself is never changed.
      let contact: { id: string } | null = null;
      const { data: existing } = await (supabase.from("streamer_contacts" as any)
        .select("id")
        .eq("user_id", user.id)
        .eq("display_name", clientName)
        .limit(1) as any);
      if (existing?.[0]) {
        contact = existing[0];
      } else {
        const safeSlug = clientName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "client";
        const { data: created, error } = await (supabase.from("streamer_contacts" as any).insert({
          user_id: user.id,
          username: `ai-${safeSlug}-${Date.now()}`,
          display_name: clientName,
          platform: "manual",
          status: "in_conversation",
          conversation_type: exportPersona,
        }).select("id").single() as any);
        if (error || !created) throw new Error(error?.message || "Couldn't create the Inbox client");
        contact = created;
      }

      await (supabase.from("streamer_contacts" as any).update({ conversation_type: exportPersona }).eq("id", contact.id) as any);

      const transcript = messages.map((message) => (
        `${message.role === "user" ? "YOU / YOUR NOTE" : "AI ADVICE"}:\n${message.content}`
      )).join("\n\n");
      const privateNote = `PRIVATE AI CHAT CONTEXT — not a real client message.\nUse this only to understand the client, previous advice, and where the conversation left off.\n\n${transcript}`;
      const exportSource = `ai_chat_export:${activeConvo.id}`;
      const { data: existingNote } = await (supabase.from("contact_messages" as any)
        .select("id")
        .eq("contact_id", contact.id)
        .eq("source", exportSource)
        .limit(1) as any);

      const note = {
        user_id: user.id,
        contact_id: contact.id,
        role: "assistant",
        persona: exportPersona,
        source: exportSource,
        content: privateNote.slice(0, 60_000),
      };
      const { error: noteError } = existingNote?.[0]
        ? await (supabase.from("contact_messages" as any).update({ ...note, updated_at: new Date().toISOString() }).eq("id", existingNote[0].id) as any)
        : await (supabase.from("contact_messages" as any).insert(note) as any);
      if (noteError) throw new Error(noteError.message || "Couldn't save the private AI context");

      setExportOpen(false);
      toast.success(`Saved ${clientName} to Inbox — your AI Chat is unchanged`);
      navigate(`/inbox/${contact.id}?persona=${exportPersona}`);
    } catch (error) {
      console.error("Inbox export failed:", error);
      toast.error(error instanceof Error ? error.message : "Couldn't send this chat to Inbox");
    } finally {
      setExporting(false);
    }
  };

  const exportDialog = (
    <Dialog open={exportOpen} onOpenChange={setExportOpen}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Send this AI Chat to Inbox?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-foreground">Client name</Label>
            <Input value={activeConvo?.title || ""} readOnly className="bg-muted border-border text-foreground" />
          </div>
          <div>
            <Label className="text-foreground">Current stage / reply voice</Label>
            <Select value={exportPersona} onValueChange={(value) => setExportPersona(value as InboxPersona)}>
              <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="friend">🤝 Friendship — build trust</SelectItem>
                <SelectItem value="promoter">💼 Promoter & Closer — value, objections, and conversion</SelectItem>
                <SelectItem value="streamer">🎤 Expert Proof — backup authority</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            This creates or reuses this client in Inbox and saves this AI Chat as a private context note. It does not edit or remove your original AI Chat.
          </p>
          <Button onClick={exportToInbox} disabled={exporting || !activeConvo || messages.length === 0} className="w-full gradient-primary text-primary-foreground">
            {exporting ? <><Bot className="h-4 w-4 mr-2 animate-pulse" /> Saving…</> : <><Inbox className="h-4 w-4 mr-2" /> Send to Inbox</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // Shared message bubble renderer
  const renderMessages = (maxWidth: string) => (
    <>
      {messages.map((msg, i) => (
        <div key={i} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
          {msg.role === "assistant" && (
            <div className="h-7 w-7 rounded-full bg-card flex items-center justify-center shrink-0 mt-0.5 border border-border">
              <Bot className="h-3.5 w-3.5 text-secondary" />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <div className={`group relative rounded-2xl px-4 py-3 text-base font-medium leading-7 text-foreground shadow-sm ${maxWidth} ${
              msg.role === "user"
                ? "bg-card border border-border rounded-tr-sm"
                : "bg-card border border-border rounded-tl-sm"
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
                    <MarkdownMessage content={msg.content} />
                  ) : (
                    msg.content && <p className="whitespace-pre-wrap text-base font-medium leading-7 text-foreground">{msg.content}</p>
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
            <div className="h-7 w-7 rounded-full bg-card border border-border flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-xs font-bold text-foreground">Y</span>
            </div>
          )}
        </div>
      ))}
      {loading && messages[messages.length - 1]?.role !== "assistant" && (
        <TypingIndicator name={config.name} />
      )}
      {aiError && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3.5 space-y-2.5">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Couldn't get a reply</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{aiError.msg}</p>
            </div>
            <button onClick={() => setAiError(null)} className="ml-auto shrink-0 text-muted-foreground hover:text-foreground" aria-label="Dismiss">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            {(aiError.code === "add_key" || aiError.code === "bad_key") && (
              <Button size="sm" onClick={() => navigate("/settings")} className="gradient-primary text-primary-foreground gap-1.5 h-8 text-xs">
                <KeyRound className="h-3.5 w-3.5" /> Add / fix API key
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => { setAiError(null); handleRetryLast(); }} className="gap-1.5 h-8 text-xs">
              <RotateCcw className="h-3.5 w-3.5" /> Try again
            </Button>
          </div>
        </div>
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
        <p className="text-base font-semibold text-foreground mb-1">AI Assistant</p>
        <p className="text-xs mb-4">Ask me anything — writing, coding, research, business, study help, or analyze a screenshot. Toggle Deep Research for in-depth answers 🚀</p>
        <div className="flex flex-wrap justify-center gap-2">
          {["Explain a topic simply", "Help me write something", "Analyze my screenshot"].map(s => (
            <button key={s} onClick={() => { composerRef.current?.setText(s); }} className="text-xs px-3 py-1.5 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
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
      {deepResearch && (
        <p className="px-3 pt-1 text-[11px] text-muted-foreground">Uses more of this chat and your saved knowledge for a detailed answer. Add a link when you want it checked.</p>
      )}

      {imageLoading && (
        <p className="px-3 pt-1.5 text-xs text-muted-foreground">Preparing image…</p>
      )}
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

      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
      <ChatComposer
        ref={composerRef}
        variant="mobile"
        loading={loading || imageLoading}
        hasPendingImages={pendingImages.length > 0}
        draftKey={draftKey}
        onSend={handleSend}
        onPickImage={() => fileInputRef.current?.click()}
      />
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
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={openExportDialog} aria-label="Send to Inbox" disabled={!activeConvo || messages.length === 0}>
            <Inbox className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={handleNewChat}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setPersona(persona === "friend" ? "promoter" : "friend")} className={`${config.badgeClass} hover:opacity-80 h-7 px-2 text-xs border`}>
            {config.emoji} {config.name}
          </Button>
        </div>

        {/* Messages */}
          <div className="flex-1 overflow-auto px-3 py-3 space-y-3">
            {messages.length === 0 ? emptyState : renderMessages("max-w-[calc(100%-2.25rem)]")}
        </div>

        {/* Input */}
        {inputBar("pb-[env(safe-area-inset-bottom)]")}
        {exportDialog}
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
              <Button variant="outline" size="sm" onClick={openExportDialog} disabled={!activeConvo || messages.length === 0} className="gap-1 h-8 px-2">
                <Inbox className="h-3.5 w-3.5" /> Send to Inbox
              </Button>
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
            {deepResearch && <Badge variant="outline" className="text-xs border-primary/30 text-primary">Detailed chat + knowledge analysis</Badge>}
          </div>

          <div className="flex-1 overflow-auto space-y-3 mb-2">
            {messages.length === 0 ? emptyState : renderMessages("max-w-[82%]")}
          </div>

          {imageLoading && (
            <p className="mb-1.5 text-xs text-muted-foreground">Preparing image…</p>
          )}
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

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
          <ChatComposer
            ref={composerRef}
            variant="desktop"
            loading={loading || imageLoading}
            hasPendingImages={pendingImages.length > 0}
            draftKey={draftKey}
            onSend={handleSend}
            onPickImage={() => fileInputRef.current?.click()}
          />
        </div>
        {exportDialog}
      </div>
    </DashboardLayout>
  );
};

export default ChatPage;
