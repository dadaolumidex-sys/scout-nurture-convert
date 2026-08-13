import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Send, Image, Pencil, Trash2, Check, X, Copy, MoreVertical, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MarkdownMessage } from "@/components/chat/MarkdownMessage";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { SuggestionCards } from "@/components/chat/SuggestionCards";
import { DiscordPanel } from "@/components/inbox/DiscordPanel";
import { useAuth } from "@/hooks/useAuth";
import { guestStorage } from "@/lib/guestStorage";
import { LEAD_STATUSES, getLeadStatus } from "@/lib/leadStatus";
import { compressImageFile } from "@/lib/imageCompress";
import { callEdgeFunction } from "@/lib/edgeFunction";



type Contact = {
  id: string;
  username: string;
  display_name: string | null;
  platform: string;
  profile_image_url: string | null;
  conversation_type: string | null;
  growth_stage: string | null;
  status: string | null;
  discord_channel_id?: string | null;
  discord_user_id?: string | null;
  discord_sync_enabled?: boolean | null;
  discord_persona?: string | null;
  discord_last_synced_at?: string | null;
};


type ChatMessage = {
  id: string;
  contact_id: string;
  role: string;
  content: string;
  persona: string | null;
  image_url: string | null;
  created_at: string;
  selected: boolean;
};

type Persona = "friend" | "promoter" | "streamer";
type Suggestion = { message: string; reason: string; approach: string };

const personaConfig = {
  friend: { name: "Nifimas", emoji: "🤝", label: "Friend", badgeClass: "border-secondary/50 bg-secondary/10 text-secondary" },
  promoter: { name: "Brozeen", emoji: "💼", label: "Promoter", badgeClass: "border-primary/50 bg-primary/10 text-primary" },
  streamer: { name: "Big Streamer", emoji: "🎤", label: "Big Streamer", badgeClass: "border-info/50 bg-info/10 text-info" },
};

const ContactChatPage = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPersona = (["friend", "promoter", "streamer"] as const).find((p) => p === searchParams.get("persona")) || "friend";
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [persona, setPersona] = useState<Persona>(initialPersona);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [suggestionsPersona, setSuggestionsPersona] = useState<Persona | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const autogenRef = useRef(searchParams.get("autogen") === "1");

  useEffect(() => {
    if (contactId) {
      loadContact();
      loadMessages();
    }
  }, [contactId, user?.id]);

  // Auto-generate the first suggestion when arriving from the New Chat flow with pasted context.
  useEffect(() => {
    if (!autogenRef.current || !contact) return;
    if (messages.filter((m) => m.persona === persona).length === 0) return;
    autogenRef.current = false;
    void generateSuggestions(persona);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, messages, persona]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadContact = async () => {
    if (!contactId) return;
    setLoadError(null);

    if (!user) {
      setContact(guestStorage.contacts.get(contactId) as Contact | null);
      return;
    }

    const { data, error } = await (supabase.from("streamer_contacts" as any).select("*").eq("id", contactId).single() as any);
    if (error) {
      console.error("Failed to load contact:", error);
      setLoadError(error.message || "This conversation could not be loaded.");
      return;
    }
    if (data) setContact(data);
  };

  const loadMessages = async () => {
    if (!contactId) return;

    if (!user) {
      setMessages(guestStorage.messages.list(contactId) as ChatMessage[]);
      return;
    }

    const { data, error } = await (supabase.from("contact_messages" as any).select("*").eq("contact_id", contactId).order("created_at", { ascending: true }) as any);
    if (error) {
      console.error("Failed to load conversation messages:", error);
      setLoadError(error.message || "Conversation messages could not be loaded.");
      return;
    }
    if (data) setMessages(data);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const imageUrl = await compressImageFile(file);

      if (user) {
        await (supabase.from("contact_messages" as any).insert({
          contact_id: contactId,
          role: "user",
          content: "[Screenshot]",
          image_url: imageUrl,
          persona,
          user_id: user.id,
        }) as any);
      } else if (contactId) {
        guestStorage.messages.insert({
          contact_id: contactId,
          role: "user",
          content: "[Screenshot]",
          image_url: imageUrl,
          persona,
          selected: false,
        });
      }

      await loadMessages();

      if (contact?.status === "new" || !contact?.status) {
        if (user) {
          await (supabase.from("streamer_contacts" as any).update({ status: "in_conversation" }).eq("id", contactId) as any);
        } else if (contactId) {
          guestStorage.contacts.update(contactId, { status: "in_conversation" });
        }
        setContact((prev) => prev ? { ...prev, status: "in_conversation" } : prev);
      }

      if (fileInputRef.current) fileInputRef.current.value = "";

      await generateSuggestions(persona);
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const messageText = input.trim();
    setInput("");
    setSuggestions([]);
    setSelectedSuggestion(null);

    if (user) {
      await (supabase.from("contact_messages" as any).insert({
        contact_id: contactId, role: "user", content: messageText, persona: persona, user_id: user.id,
      }) as any);
    } else if (contactId) {
      guestStorage.messages.insert({
        contact_id: contactId,
        role: "user",
        content: messageText,
        persona,
        image_url: null,
        selected: false,
      });
    }
    await loadMessages();

    if (contact?.status === "new" || !contact?.status) {
      if (user) {
        await (supabase.from("streamer_contacts" as any).update({ status: "in_conversation" }).eq("id", contactId) as any);
      } else if (contactId) {
        guestStorage.contacts.update(contactId, { status: "in_conversation" });
      }
      setContact((prev) => prev ? { ...prev, status: "in_conversation" } : prev);
    }

    // Generate suggestions for current persona only
    await generateSuggestions(persona);
  };

  const generateSuggestions = async (targetPersona: Persona) => {
    setLoading(true);
    setSuggestions([]);
    setSelectedSuggestion(null);
    setSuggestionsPersona(targetPersona);

    const msgs = user
      ? (((await (supabase.from("contact_messages" as any).select("*").eq("contact_id", contactId).order("created_at", { ascending: true }) as any)).data) || []) as ChatMessage[]
      : ((contactId ? guestStorage.messages.list(contactId) : []) as ChatMessage[]);

    const personaMessages = msgs.filter((m) => m.persona === targetPersona);
    const recentMessages = personaMessages.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "assistant" as const : "user" as const,
      content: m.content,
      imageUrl: m.image_url,
    }));

    const contactContext = contact
      ? `You are helping craft a message to ${contact.display_name || contact.username}, a ${contact.platform} streamer${contact.growth_stage ? ` (${contact.growth_stage})` : ""}.`
      : "";

    try {
      const data = await callEdgeFunction<{ suggestions?: Suggestion[] }>("chat-suggestions", {
        messages: recentMessages,
        persona: targetPersona,
        contactContext,
        conversationType: contact?.conversation_type || "new_prospect",
        knowledge: user ? [] : guestStorage.knowledge.list(),
      });
      const nextSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      if (nextSuggestions.length === 0) throw new Error("The AI returned no reply suggestions. Please try again.");
      setSuggestions(nextSuggestions);
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Failed to generate suggestions");
    }
    setLoading(false);
  };

  const handleSelectSuggestion = async (index: number) => {
    setSelectedSuggestion(index);
    const suggestion = suggestions[index];
    if (!suggestion || !suggestionsPersona) return;

    // Save selected suggestion as an assistant message marked as selected
    const saved = user
      ? (await (supabase.from("contact_messages" as any).insert({
          contact_id: contactId,
          role: "assistant",
          content: suggestion.message,
          persona: suggestionsPersona,
          selected: true,
          user_id: user.id,
        }).select().single() as any)).data
      : contactId
        ? guestStorage.messages.insert({
            contact_id: contactId,
            role: "assistant",
            content: suggestion.message,
            persona: suggestionsPersona,
            image_url: null,
            selected: true,
          })
        : null;

    if (saved) {
      await loadMessages();
      if (user) {
        await (supabase.from("streamer_contacts" as any).update({
          last_message: suggestion.message.slice(0, 100),
        }).eq("id", contactId) as any);
      } else if (contactId) {
        guestStorage.contacts.update(contactId, {
          last_message: suggestion.message.slice(0, 100),
        });
      }
      toast.success("Reply selected! Copy it and send to the streamer.");
    }
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;
    if (user) {
      await (supabase.from("contact_messages" as any).update({ content: editContent, updated_at: new Date().toISOString() }).eq("id", id) as any);
    } else {
      guestStorage.messages.update(id, { content: editContent, updated_at: new Date().toISOString() });
    }
    setEditingId(null);
    setEditContent("");
    await loadMessages();
    toast.success("Message updated");
  };

  const handleDelete = async (id: string) => {
    if (user) {
      await (supabase.from("contact_messages" as any).delete().eq("id", id) as any);
    } else {
      guestStorage.messages.remove(id);
    }
    await loadMessages();
    toast.success("Message deleted");
  };

  const sendToDiscord = async (msg: ChatMessage) => {
    if (!user) { toast.error("Sign in to send to Discord"); return; }
    if (!contact?.discord_channel_id && !contact?.discord_user_id) {
      toast.error("Link this contact to Discord first");
      return;
    }
    const t = toast.loading("Sending to Discord...");
    try {
      const { data, error } = await supabase.functions.invoke("discord-send", {
        body: { contactId, content: msg.content, messageId: msg.id },
      });
      if (error) throw new Error((await (error as any)?.context?.text?.()) || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Sent on Discord", { id: t });
      await loadMessages();
    } catch (e: any) {
      toast.error(e.message || "Failed to send", { id: t });
    }
  };

  const config = personaConfig[persona];

  // Smart auto-transition: read the streamer's latest incoming message for intent signals.
  const lastIncoming = [...messages].reverse().find((m) => m.role === "user")?.content?.toLowerCase() || "";
  const pricingSignal = /\b(price|pricing|cost|how much|package|packages|rate|rates|budget|pay|payment|quote)\b/.test(lastIncoming);
  const warmSignal = /\b(yeah|yea|yes|sure|sounds good|interested|tell me more|i'm down|im down|lets|let's|ok cool|okay cool|why not|go on|how does it work)\b/.test(lastIncoming);
  const suggestedPersona: Persona | null = pricingSignal && persona !== "streamer"
    ? "streamer"
    : warmSignal && persona === "friend"
      ? "promoter"
      : null;



  if (!contact) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-full text-center gap-3 px-4">
          {loadError ? (
            <>
              <p className="font-semibold text-destructive">Conversation could not load</p>
              <p className="text-sm text-muted-foreground max-w-lg">{loadError}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => navigate("/inbox")}>Back to inbox</Button>
                <Button onClick={() => { void loadContact(); void loadMessages(); }}>Try again</Button>
              </div>
            </>
          ) : (
            <div className="text-muted-foreground">Loading...</div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto flex flex-col h-[calc(100vh-8rem)] animate-slide-in">
        <ChatHeader
          contact={contact}
          persona={persona}
          onPersonaChange={(p) => { setPersona(p); setSuggestions([]); setSelectedSuggestion(null); }}
          onBack={() => navigate("/inbox")}
        />

        {user && contactId && (
          <DiscordPanel
            contactId={contactId}
            persona={persona}
            signedIn={!!user}
            discord={{
              discord_channel_id: contact.discord_channel_id ?? null,
              discord_user_id: contact.discord_user_id ?? null,
              discord_sync_enabled: contact.discord_sync_enabled ?? false,
              discord_persona: contact.discord_persona ?? persona,
              discord_last_synced_at: contact.discord_last_synced_at ?? null,
            }}
            onChanged={async () => { await loadContact(); await loadMessages(); }}
          />
        )}

        {suggestedPersona && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
            <p className="text-xs sm:text-sm text-foreground flex-1 min-w-[180px]">
              {suggestedPersona === "streamer"
                ? "💰 They're asking about pricing — time for the closer."
                : "🔥 They replied warm — time to add value."}
            </p>
            <Button
              size="sm"
              className="gradient-primary text-primary-foreground h-8"
              onClick={() => {
                setPersona(suggestedPersona);
                setSuggestions([]);
                setSelectedSuggestion(null);
                toast.success(`Switched to ${personaConfig[suggestedPersona].name}`);
              }}
            >
              Move to {personaConfig[suggestedPersona].name}
            </Button>
          </div>
        )}


        {/* Messages */}
        <div className="flex-1 overflow-auto space-y-3 mb-4 pr-1">
          {messages.filter((msg) => msg.persona === persona).length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground space-y-2">
                <p className="text-sm">No messages yet. Paste their message to get started!</p>
                <div className="flex gap-2 justify-center">
                  <Badge variant="outline" className="text-xs">📋 Paste their message</Badge>
                  <Badge variant="outline" className="text-xs">📸 Upload screenshot</Badge>
                  <Badge variant="outline" className="text-xs">🤖 Get reply suggestions</Badge>
                </div>
              </div>
            </div>
          )}
          {messages.filter((msg) => msg.persona === persona).map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`group relative max-w-[calc(100%-1rem)] sm:max-w-[82%] rounded-xl px-4 py-3 text-base font-medium leading-7 text-foreground shadow-sm ${
                msg.role === "user"
                  ? "bg-card border border-border"
                  : "bg-card border border-border"
              }`}>
                {/* Persona badge + selected indicator */}
                {msg.role === "assistant" && (
                  <div className="flex items-center gap-1.5 mb-1">
                    {msg.persona && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${personaConfig[msg.persona as Persona]?.badgeClass || ""}`}>
                        {personaConfig[msg.persona as Persona]?.emoji} {personaConfig[msg.persona as Persona]?.name}
                      </Badge>
                    )}
                    {msg.selected && (
                      <div className="flex items-center gap-0.5 text-[10px] font-medium text-secondary">
                        <Check className="h-3 w-3" /> Used
                      </div>
                    )}
                  </div>
                )}

                {/* Selected blue bar indicator */}
                {msg.role === "assistant" && msg.selected && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-secondary" />
                )}

                {msg.image_url && (
                  <img src={msg.image_url} alt="Screenshot" className="rounded-lg mb-2 max-w-full max-h-60 object-contain" />
                )}

                {editingId === msg.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="bg-background border-border text-foreground text-sm min-h-[60px]"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleEdit(msg.id)} className="h-6 px-2 text-xs text-primary">
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
                      <MarkdownMessage content={msg.content} />
                    ) : (
                      <p className="whitespace-pre-wrap text-base font-medium leading-7 text-foreground">{msg.content}</p>
                    )}
                  </>
                )}

                {editingId !== msg.id && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                        <MoreVertical className="h-3 w-3" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border">
                        {msg.role === "assistant" && (
                          <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied!"); }} className="text-foreground">
                            <Copy className="h-3 w-3 mr-2" /> Copy
                          </DropdownMenuItem>
                        )}
                        {msg.role === "assistant" && (contact.discord_channel_id || contact.discord_user_id) && (
                          <DropdownMenuItem onClick={() => sendToDiscord(msg)} className="text-foreground">
                            <Rocket className="h-3 w-3 mr-2" /> Send to Discord
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuItem onClick={() => { setEditingId(msg.id); setEditContent(msg.content); }} className="text-foreground">
                          <Pencil className="h-3 w-3 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDelete(msg.id)} className="text-destructive">
                          <Trash2 className="h-3 w-3 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Suggestion cards inline */}
          {(suggestions.length > 0 || loading) && (
            <div className="py-2">
              <p className="text-xs text-muted-foreground mb-2">
                {config.emoji} {config.name} suggests ({suggestions.length} options):
              </p>
              <SuggestionCards
                suggestions={suggestions}
                persona={suggestionsPersona || persona}
                selectedIndex={selectedSuggestion}
                onSelect={handleSelectSuggestion}
                loading={loading}
              />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Generate + Status */}
        <div className="flex flex-wrap gap-2 mb-3 items-center">
          <Button
            onClick={() => generateSuggestions(persona)}
            disabled={loading || messages.filter((m) => m.persona === persona).length === 0}
            variant="outline"
            size="sm"
            className={`shrink-0 ${persona === "friend"
              ? "border-secondary/30 text-secondary hover:bg-secondary/10"
              : persona === "streamer"
                ? "border-info/30 text-info hover:bg-info/10"
                : "border-primary/30 text-primary hover:bg-primary/10"}`}
          >
            {config.emoji} Get {config.name} Reply
          </Button>
          <div className="hidden sm:block flex-1" />
          <select
            aria-label="Lead status"
            value={contact?.status || "new"}
            onChange={async (e) => {
              const newStatus = e.target.value;
              if (user) {
                await (supabase.from("streamer_contacts" as any).update({ status: newStatus }).eq("id", contactId) as any);
              } else if (contactId) {
                guestStorage.contacts.update(contactId, { status: newStatus });
              }
              setContact((prev) => prev ? { ...prev, status: newStatus } : prev);
              toast.success(`Status: ${getLeadStatus(newStatus).label}`);
            }}
            className="text-xs bg-muted border border-border rounded-md px-2 py-1.5 text-foreground max-w-full flex-1 sm:flex-none sm:w-auto"
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.emoji} {s.label}</option>
            ))}
          </select>
        </div>


        {/* Input */}
        <div className="flex gap-2 items-end">
          <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="h-10 w-10 p-0 border-border text-muted-foreground hover:text-foreground shrink-0"
          >
            <Image className="h-4 w-4" />
          </Button>
          <Textarea
            placeholder="Paste their message here..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none min-h-[44px] max-h-[120px]"
            rows={2}
            onKeyDownCapture={(e) => {
              if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
              e.preventDefault();
              e.stopPropagation();
              const target = e.currentTarget;
              const start = target.selectionStart;
              const end = target.selectionEnd;
              setInput((current) => `${current.slice(0, start)}\n${current.slice(end)}`);
              window.requestAnimationFrame(() => {
                target.selectionStart = start + 1;
                target.selectionEnd = start + 1;
              });
            }}
          />
          <Button
            type="button"
            onClick={(e) => { if (e.detail > 0) void handleSend(); }}
            disabled={!input.trim()}
            className="gradient-primary text-primary-foreground h-10 w-10 p-0 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default ContactChatPage;
