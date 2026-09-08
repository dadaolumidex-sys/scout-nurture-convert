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
import { useAuth } from "@/hooks/useAuth";
import { guestStorage } from "@/lib/guestStorage";
import { getInboxState, INBOX_STATES, type InboxState } from "@/lib/inboxState";
import { compressImageFile } from "@/lib/imageCompress";
import { callEdgeFunction } from "@/lib/edgeFunction";
import { readDraftRecord, writeDraftRecord } from "@/lib/draftStorage";
import { ClientProfilePanel, EMPTY_CLIENT_PROFILE, normalizeClientProfile, type ClientProfile } from "@/components/inbox/ClientProfilePanel";



type Contact = {
  id: string;
  username: string;
  display_name: string | null;
  platform: string;
  profile_image_url: string | null;
  conversation_type: string | null;
  growth_stage: string | null;
  status: string | null;
  inbox_state?: string | null;
  discord_channel_id?: string | null;
  discord_user_id?: string | null;
  discord_sync_enabled?: boolean | null;
  discord_persona?: string | null;
  discord_last_synced_at?: string | null;
  client_profile?: ClientProfile | null;
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
  source?: string | null;
};

type Persona = "friend" | "promoter" | "streamer";
type Suggestion = { message: string; reason: string; approach: string };

const personaConfig = {
  friend: { name: "Friendship", emoji: "🤝", label: "Friendship", badgeClass: "border-secondary/50 bg-secondary/10 text-secondary" },
  promoter: { name: "Promoter & Closer", emoji: "💼", label: "Promoter & Closer", badgeClass: "border-primary/50 bg-primary/10 text-primary" },
  streamer: { name: "Expert Proof", emoji: "🎤", label: "Expert Proof", badgeClass: "border-info/50 bg-info/10 text-info" },
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
  const [replyDirection, setReplyDirection] = useState("");
  const [loadedDraftKey, setLoadedDraftKey] = useState("");
  const [persona, setPersona] = useState<Persona>(initialPersona);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [suggestionsPersona, setSuggestionsPersona] = useState<Persona | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clientProfile, setClientProfile] = useState<ClientProfile>({ ...EMPTY_CLIENT_PROFILE });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const autogenRef = useRef(searchParams.get("autogen") === "1");
  const draftKey = `streamscout_inbox_draft_${user?.id || "guest"}_${contactId || "unknown"}`;
  const inboxDraftRef = useRef({ input: "", replyDirection: "" });

  useEffect(() => {
    const saved = readDraftRecord(draftKey, { input: "", replyDirection: "" });
    setInput(saved.input || "");
    setReplyDirection(saved.replyDirection || "");
    inboxDraftRef.current = { input: saved.input || "", replyDirection: saved.replyDirection || "" };
    setLoadedDraftKey(draftKey);
  }, [draftKey]);

  useEffect(() => {
    if (loadedDraftKey === draftKey) {
      writeDraftRecord(draftKey, { input, replyDirection });
    }
  }, [draftKey, input, loadedDraftKey, replyDirection]);

  const updateInboxDraft = (next: Partial<{ input: string; replyDirection: string }>) => {
    const saved = { ...inboxDraftRef.current, ...next };
    inboxDraftRef.current = saved;
    writeDraftRecord(draftKey, saved);
    if (next.input !== undefined) setInput(next.input);
    if (next.replyDirection !== undefined) setReplyDirection(next.replyDirection);
  };

  useEffect(() => {
    if (contactId) {
      loadContact();
      loadMessages();
    }
  }, [contactId, user?.id]);

  // Auto-generate the first suggestion when arriving from the New Chat flow with pasted context.
  useEffect(() => {
    if (!autogenRef.current || !contact) return;
    if (!messages.some((m) => !m.source?.startsWith("ai_chat_export:") && m.source !== "client_action_card" && m.source !== "website_audit")) return;
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
      const guestContact = guestStorage.contacts.get(contactId) as Contact | null;
      setContact(guestContact);
      setClientProfile(normalizeClientProfile(guestContact?.client_profile));
      return;
    }

    const { data, error } = await (supabase.from("streamer_contacts" as any).select("*").eq("id", contactId).single() as any);
    if (error) {
      console.error("Failed to load contact:", error);
      setLoadError(error.message || "This conversation could not be loaded.");
      return;
    }
    if (data) {
      setContact(data);
      setClientProfile(normalizeClientProfile(data.client_profile));
      // Older Inboxes saved this source type in conversation_type. Preserve it
      // in growth_stage the first time they are opened, before stage switching.
      if (!data.growth_stage && ["new_prospect", "existing_chat", "re_engage"].includes(data.conversation_type || "")) {
        const preservedType = data.conversation_type;
        if (user) {
          await (supabase.from("streamer_contacts" as any).update({ growth_stage: preservedType }).eq("id", contactId) as any);
        } else if (contactId) {
          guestStorage.contacts.update(contactId, { growth_stage: preservedType });
        }
        data.growth_stage = preservedType;
        setContact({ ...data });
      }
      if (!searchParams.get("persona") && ["friend", "promoter", "streamer"].includes(data.conversation_type || "")) {
        setPersona(data.conversation_type as Persona);
      }
    }
  };

  const saveClientProfile = async (profile: ClientProfile) => {
    if (!contactId) return;
    const cleaned = normalizeClientProfile(profile);
    if (user) {
      const { error } = await (supabase.from("streamer_contacts" as any)
        .update({ client_profile: cleaned, updated_at: new Date().toISOString() })
        .eq("id", contactId) as any);
      if (error) {
        toast.error("Could not save the client profile. Refresh and try again.");
        return;
      }
    } else {
      guestStorage.contacts.update(contactId, { client_profile: cleaned } as any);
    }
    setClientProfile(cleaned);
    setContact((current) => current ? { ...current, client_profile: cleaned } : current);
    toast.success("Client profile saved — AI will use it for future replies.");
  };

  const scheduleFollowUp = async (hours: number) => {
    if (!user || !contactId || !contact) {
      toast.error("Sign in to schedule follow-up reminders.");
      return;
    }
    const name = contact.display_name || contact.username;
    const dueAt = new Date(Date.now() + hours * 3_600_000).toISOString();
    const { error } = await (supabase.from("reminders" as any).insert({
      user_id: user.id,
      contact_id: contactId,
      title: `Follow up with ${name}`,
      note: clientProfile.nextStep?.trim() || "Review the latest message and send a helpful follow-up.",
      due_at: dueAt,
    }) as any);
    if (error) {
      toast.error("Could not schedule the follow-up. Please try again.");
      return;
    }
    toast.success(`Follow-up set for ${hours === 24 ? "tomorrow" : `in ${hours / 24} days`}.`);
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

  const handlePersonaChange = async (nextPersona: Persona) => {
    setPersona(nextPersona);
    setSuggestions([]);
    setSelectedSuggestion(null);
    setSuggestionsPersona(null);

    // A person has one Inbox, but their active outreach stage should follow
    // them as the team moves from friendship to promoter to closer.
    if (contact?.conversation_type === nextPersona) return;
    if (user) {
      const { error } = await (supabase.from("streamer_contacts" as any)
        .update({ conversation_type: nextPersona })
        .eq("id", contactId) as any);
      if (error) {
        toast.error("Could not save the client stage. Please try again.");
        return;
      }
    } else if (contactId) {
      guestStorage.contacts.update(contactId, { conversation_type: nextPersona });
    }
    setContact((prev) => prev ? { ...prev, conversation_type: nextPersona } : prev);
    toast.success(`${contact?.display_name || contact?.username || "Client"} is now in the ${personaConfig[nextPersona].name} stage.`);
  };

  const addImageFiles = async (selectedFiles: File[]) => {
    const availableSlots = 3 - pendingImages.length;
    if (!selectedFiles.length || availableSlots <= 0) {
      toast.error("You can attach up to 3 screenshots at once.");
      return;
    }
    const files = selectedFiles.slice(0, availableSlots);

    setUploading(true);
    try {
      const imageUrls = await Promise.all(files.map((file) => compressImageFile(file)));
      setPendingImages((current) => [...current, ...imageUrls].slice(0, 3));
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.success(`${imageUrls.length} screenshot${imageUrls.length === 1 ? "" : "s"} attached. Add your instruction, then press Send when ready.`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addImageFiles(Array.from(e.target.files || []));
  };

  // Paste a copied screenshot straight into the reply box.
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files || []).filter((file) => file.type.startsWith("image/"));
    if (!files.length) return;
    e.preventDefault();
    void addImageFiles(files);
  };

  const handleSend = async () => {
    if ((!input.trim() && pendingImages.length === 0) || loading) return;
    const messageText = input.trim() || "[Screenshot — use the attached conversation and reply direction]";
    const attachedImages = pendingImages;
    updateInboxDraft({ input: "" });
    setPendingImages([]);
    setSuggestions([]);
    setSelectedSuggestion(null);

    const messagesToSave = attachedImages.length
      ? attachedImages.map((imageUrl, index) => ({
        contact_id: contactId,
        role: "user",
        content: index === 0
          ? messageText
          : `[Additional screenshot ${index + 1} of ${attachedImages.length} — use together with the message above.]`,
        image_url: imageUrl,
        persona,
      }))
      : [{ contact_id: contactId, role: "user", content: messageText, image_url: null, persona }];

    if (user) {
      await (supabase.from("contact_messages" as any).insert(
        messagesToSave.map((message) => ({ ...message, user_id: user.id })),
      ) as any);
    } else if (contactId) {
      messagesToSave.forEach((message) => {
        guestStorage.messages.insert({ ...message, selected: false });
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

    // The reply voice can change as the relationship progresses, but this is
    // still one continuous client conversation. Keep every public message in
    // context so a promoter or expert can continue exactly where friendship
    // left off.
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

    const isPrivateAiContext = (message: ChatMessage) => message.source?.startsWith("ai_chat_export:") || message.source === "client_action_card" || message.source === "website_audit";
    // Exported AI Chat history is background only. It must never be treated as
    // a real client message, otherwise an old line can override a new reply.
    const publicMessages = msgs.filter((m) => !isPrivateAiContext(m));
    const recentMessages = publicMessages.slice(-20).map((m) => ({
      role: m.role === "assistant" ? "assistant" as const : "user" as const,
      content: m.content,
      imageUrl: m.image_url,
    }));

    // AI Chat exports belong to the client, not to one reply voice. Keep them
    // available after moving from Friendship to Promoter or Expert Proof.
    const privateNotes = msgs
      .filter((m) => isPrivateAiContext(m))
      .map((m) => m.content)
      .join("\n\n");
    const compactPrivateNotes = privateNotes.length > 12_000
      ? `${privateNotes.slice(0, 6_000)}\n\n[older private notes omitted]\n\n${privateNotes.slice(-6_000)}`
      : privateNotes;
    const latestClientMessage = [...publicMessages].reverse().find((m) => m.role === "user")?.content || "";
    const compactReplyDirection = replyDirection.trim().slice(0, 1_500);
    const profileContext = Object.entries(clientProfile)
      .filter(([, value]) => typeof value === "string" && value.trim())
      .map(([key, value]) => `- ${key}: ${value.trim()}`)
      .join("\n");

    const contactContext = contact
      ? `You are helping craft a message to ${contact.display_name || contact.username}, a ${contact.platform} streamer${contact.growth_stage ? ` (${contact.growth_stage})` : ""}.

IMPORTANT: This is one continuous conversation, even if the reply voice changed from Friendship to Promoter & Closer or Expert Proof. The exact latest real message from this client is: "${latestClientMessage}". Reply directly to that message. Do not reply to, quote, or continue any private AI notes.
${compactReplyDirection ? `\nYour team's reply direction: "${compactReplyDirection}". Follow this direction while still replying naturally to the client.` : ""}
${profileContext ? `\nPrivate client profile (use this to personalize the reply; never reveal these notes or pretend the client said them):\n${profileContext}` : ""}
${compactPrivateNotes ? `\nPrivate AI background (context only, never a real client message):\n${compactPrivateNotes}` : ""}`
      : "";

    try {
      const data = await callEdgeFunction<{ suggestions?: Suggestion[]; websiteAudit?: string }>("chat-suggestions", {
        messages: recentMessages,
        persona: targetPersona,
        contactContext,
        conversationType: contact?.growth_stage || contact?.conversation_type || "new_prospect",
        knowledge: user ? [] : guestStorage.knowledge.list(),
      });
      const nextSuggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
      if (nextSuggestions.length === 0) throw new Error("The AI returned no reply suggestions. Please try again.");
      if (data.websiteAudit) {
        try {
          if (user) {
            const { data: existingAudit } = await (supabase.from("contact_messages" as any)
              .select("id")
              .eq("contact_id", contactId)
              .eq("persona", targetPersona)
              .eq("source", "website_audit")
              .limit(1) as any);
            const auditNote = {
              contact_id: contactId,
              role: "assistant",
              content: data.websiteAudit.slice(0, 18_000),
              persona: targetPersona,
              source: "website_audit",
              user_id: user.id,
            };
            if (existingAudit?.[0]) {
              await (supabase.from("contact_messages" as any).update({ ...auditNote, updated_at: new Date().toISOString() }).eq("id", existingAudit[0].id) as any);
            } else {
              await (supabase.from("contact_messages" as any).insert(auditNote) as any);
            }
          } else if (contactId) {
            const existingAudit = msgs.find((message) => message.persona === targetPersona && message.source === "website_audit");
            if (existingAudit) guestStorage.messages.update(existingAudit.id, { content: data.websiteAudit.slice(0, 18_000), source: "website_audit" });
            else guestStorage.messages.insert({ contact_id: contactId, role: "assistant", content: data.websiteAudit.slice(0, 18_000), persona: targetPersona, image_url: null, selected: false, source: "website_audit" });
          }
          await loadMessages();
        } catch (auditError) {
          console.warn("Could not save the private website audit", auditError);
        }
      }
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
      // The selected reply is now stored in the conversation. Clear the three
      // temporary cards immediately so only the reply the user chose remains.
      setSuggestions([]);
      setSelectedSuggestion(null);
      setSuggestionsPersona(null);
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
  // Keep the conversation continuous on screen too. A stage is a reply voice,
  // not a separate room or a replacement for earlier messages.
  const displayMessages = messages.filter((message) => message.source !== "client_action_card");
  const hasClientConversation = messages.some((message) =>
    !message.source?.startsWith("ai_chat_export:")
    && message.source !== "client_action_card"
    && message.source !== "website_audit",
  );



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
      <div className="max-w-3xl mx-auto flex flex-col h-[calc(100dvh-11rem-env(safe-area-inset-bottom))] sm:h-[calc(100vh-8rem)] animate-slide-in">
        <ChatHeader
          contact={contact}
          persona={persona}
          onPersonaChange={handlePersonaChange}
          onBack={() => navigate("/inbox")}
        />

        <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">One client, one history.</span>{" "}
          Choose the reply voice when the conversation moves forward. Earlier messages stay here, and every next reply uses the full client history. Screenshots are temporary for the current reply only.
        </div>

        <ClientProfilePanel
          profile={clientProfile}
          onSave={saveClientProfile}
          onFollowUp={scheduleFollowUp}
        />

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
                void handlePersonaChange(suggestedPersona);
              }}
            >
              Move to {personaConfig[suggestedPersona].name}
            </Button>
          </div>
        )}


        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-auto space-y-3 mb-4 pr-1">
          {displayMessages.length === 0 && (
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
          {displayMessages.map((msg) => {
            const isPrivateAiContext = msg.source?.startsWith("ai_chat_export:");
            if (msg.source === "client_action_card") return null;
            if (msg.source === "website_audit") {
              return (
                <details key={msg.id} className="rounded-xl border border-dashed border-info/40 bg-info/5 px-4 py-3 text-sm text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-info">🔒 Private website audit — used for future replies</summary>
                  <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">{msg.content}</p>
                </details>
              );
            }
            if (isPrivateAiContext) {
              return (
                <details key={msg.id} className="rounded-xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-primary">🔒 Private AI context — not sent to this client</summary>
                  <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed">{msg.content}</p>
                </details>
              );
            }
            return (
            <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`group relative max-w-[calc(100%-1rem)] sm:max-w-[82%] rounded-xl px-4 py-3 text-base font-medium leading-7 text-foreground shadow-sm ${
                msg.role === "user"
                  ? "bg-card border border-border"
                  : "bg-card border border-border"
              }`}>
                {/* The label shows which reply voice was used at that point. */}
                {(msg.persona || (msg.role === "assistant" && msg.selected)) && (
                  <div className="flex items-center gap-1.5 mb-1">
                    {msg.persona && (
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${personaConfig[msg.persona as Persona]?.badgeClass || ""}`}>
                        {personaConfig[msg.persona as Persona]?.emoji} {personaConfig[msg.persona as Persona]?.name}
                      </Badge>
                    )}
                    {msg.role === "assistant" && msg.selected && (
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
            );
          })}

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
            disabled={loading || !hasClientConversation}
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
            aria-label="Client inbox status"
            value={getInboxState(contact?.inbox_state, contact?.status)}
            onChange={async (e) => {
              const nextState = e.target.value as InboxState;
              if (user) {
                const { error } = await (supabase.from("streamer_contacts" as any).update({ inbox_state: nextState }).eq("id", contactId) as any);
                if (error) {
                  toast.error("Could not update Inbox status. Refresh and try again.");
                  return;
                }
              } else if (contactId) {
                guestStorage.contacts.update(contactId, { inbox_state: nextState } as any);
              }
              setContact((prev) => prev ? { ...prev, inbox_state: nextState } : prev);
              toast.success(`Inbox status: ${INBOX_STATES[nextState].label}`);
            }}
            className="text-xs bg-muted border border-border rounded-md px-2 py-1.5 text-foreground max-w-full flex-1 sm:flex-none sm:w-auto"
          >
            {(Object.entries(INBOX_STATES) as [InboxState, typeof INBOX_STATES[InboxState]][]).map(([value, state]) => (
              <option key={value} value={value}>{state.emoji} {state.label}</option>
            ))}
          </select>
        </div>


        {/* Input */}
        <label className="mb-1 block text-xs font-medium text-muted-foreground" htmlFor="reply-direction">Reply instructions (optional)</label>
        <Textarea
          id="reply-direction"
          aria-label="How you want the AI to reply"
          placeholder="Example: friendly but confident; keep it short; do not mention price yet."
          value={replyDirection}
          onChange={(e) => updateInboxDraft({ replyDirection: e.target.value })}
          className="mb-2 bg-muted/60 border-border text-foreground placeholder:text-muted-foreground resize-none min-h-[40px] max-h-[88px] text-sm"
          rows={1}
        />
        {(input || replyDirection) && (
          <div className="mb-2 flex justify-end">
            <Button type="button" variant="ghost" size="sm" onClick={() => updateInboxDraft({ input: "", replyDirection: "" })} className="h-7 text-xs text-muted-foreground hover:text-foreground">
              Clear unsent text
            </Button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <input type="file" ref={fileInputRef} accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
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
            placeholder="Paste their latest message or the full Discord conversation here..."
            value={input}
            onChange={(e) => updateInboxDraft({ input: e.target.value })}
            onPaste={handlePaste}
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
            onClick={() => void handleSend()}
            disabled={!input.trim() && pendingImages.length === 0}
            className="gradient-primary text-primary-foreground h-10 w-10 p-0 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
        {pendingImages.length > 0 && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
            <div className="flex gap-1">
              {pendingImages.map((imageUrl, index) => (
                <div key={imageUrl} className="relative">
                  <img src={imageUrl} alt={`Screenshot ${index + 1} ready to send`} className="h-12 w-12 rounded object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove screenshot ${index + 1}`}
                    onClick={() => setPendingImages((current) => current.filter((_, currentIndex) => currentIndex !== index))}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background text-muted-foreground shadow hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            <p className="flex-1 text-xs text-muted-foreground">
              {pendingImages.length} screenshot{pendingImages.length === 1 ? "" : "s"} attached — they will not be analyzed until you press Send.
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPendingImages([])} className="h-7 text-xs">Remove all</Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default ContactChatPage;
