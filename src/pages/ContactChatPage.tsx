import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Send, Image, Pencil, Trash2, Check, X, Copy, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { DashboardLayout } from "@/components/DashboardLayout";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ReactMarkdown from "react-markdown";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { SuggestionCards } from "@/components/chat/SuggestionCards";

type Contact = {
  id: string;
  username: string;
  display_name: string | null;
  platform: string;
  profile_image_url: string | null;
  conversation_type: string | null;
  growth_stage: string | null;
  status: string | null;
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

type Persona = "friend" | "promoter";
type Suggestion = { message: string; reason: string; approach: string };

const SUGGESTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-suggestions`;

const personaConfig = {
  friend: { name: "Nifimas", emoji: "🤝", label: "Friend", badgeClass: "border-secondary/50 bg-secondary/10 text-secondary" },
  promoter: { name: "Brozeen", emoji: "💼", label: "Promoter", badgeClass: "border-primary/50 bg-primary/10 text-primary" },
};

const ContactChatPage = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [persona, setPersona] = useState<Persona>("friend");
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [uploading, setUploading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);
  const [suggestionsPersona, setSuggestionsPersona] = useState<Persona | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (contactId) {
      loadContact();
    }
  }, [contactId]);

  useEffect(() => {
    if (contactId) {
      setMessages([]);
      loadMessages(persona);
    }
  }, [contactId, persona]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const loadContact = async () => {
    const { data } = await (supabase.from("streamer_contacts" as any).select("*").eq("id", contactId).single() as any);
    if (data) setContact(data);
  };

  const loadMessages = async (targetPersona: Persona = persona) => {
    const { data } = await (supabase.from("contact_messages" as any)
      .select("*")
      .eq("contact_id", contactId)
      .eq("persona", targetPersona)
      .order("created_at", { ascending: true }) as any);
    if (data) setMessages(data);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `${contactId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("chat-images").upload(path, file);
    if (error) { toast.error("Failed to upload image"); setUploading(false); return; }
    const { data: urlData } = supabase.storage.from("chat-images").getPublicUrl(path);
    await (supabase.from("contact_messages" as any).insert({
      contact_id: contactId, role: "user", content: "[Screenshot]", image_url: urlData.publicUrl, persona,
    }) as any);
    await loadMessages();
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const messageText = input.trim();
    setInput("");
    setSuggestions([]);
    setSelectedSuggestion(null);

    await (supabase.from("contact_messages" as any).insert({
      contact_id: contactId, role: "user", content: messageText, persona,
    }) as any);
    await loadMessages();

    if (contact?.status === "new" || !contact?.status) {
      await (supabase.from("streamer_contacts" as any).update({ status: "in_conversation" }).eq("id", contactId) as any);
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

    const { data: currentMessages } = await (supabase.from("contact_messages" as any).select("*").eq("contact_id", contactId).order("created_at", { ascending: true }) as any);
    const msgs = (currentMessages || []) as ChatMessage[];

    const recentMessages = msgs.slice(-20).map((m) => ({
      role: m.role === "user" ? "user" as const : "assistant" as const,
      content: m.image_url ? `[Image: ${m.image_url}]\n${m.content}` : m.content,
    }));

    const contactContext = contact
      ? `You are helping craft a message to ${contact.display_name || contact.username}, a ${contact.platform} streamer${contact.growth_stage ? ` (${contact.growth_stage})` : ""}.`
      : "";

    try {
      const resp = await fetch(SUGGESTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: recentMessages, persona: targetPersona, contactContext }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Request failed" }));
        toast.error(err.error || `Error ${resp.status}`);
        setLoading(false);
        return;
      }

      const data = await resp.json();
      setSuggestions(data.suggestions || []);
    } catch (e) {
      console.error(e);
      toast.error("Failed to generate suggestions");
    }
    setLoading(false);
  };

  const handleSelectSuggestion = async (index: number) => {
    setSelectedSuggestion(index);
    const suggestion = suggestions[index];
    if (!suggestion || !suggestionsPersona) return;

    // Save selected suggestion as an assistant message marked as selected
    const { data: saved } = await (supabase.from("contact_messages" as any).insert({
      contact_id: contactId,
      role: "assistant",
      content: suggestion.message,
      persona: suggestionsPersona,
      selected: true,
    }).select().single() as any);

    if (saved) {
      await loadMessages();
      // Update contact last_message
      await (supabase.from("streamer_contacts" as any).update({
        last_message: suggestion.message.slice(0, 100),
        conversation_type: suggestionsPersona === "friend" ? "friend_chat" : "promotion",
      }).eq("id", contactId) as any);
      toast.success("Reply selected! Copy it and send to the streamer.");
    }
  };

  const handleEdit = async (id: string) => {
    if (!editContent.trim()) return;
    await (supabase.from("contact_messages" as any).update({ content: editContent, updated_at: new Date().toISOString() }).eq("id", id) as any);
    setEditingId(null);
    setEditContent("");
    await loadMessages();
    toast.success("Message updated");
  };

  const handleDelete = async (id: string) => {
    await (supabase.from("contact_messages" as any).delete().eq("id", id) as any);
    await loadMessages();
    toast.success("Message deleted");
  };

  const config = personaConfig[persona];

  if (!contact) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full text-muted-foreground">Loading...</div>
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

        {/* Messages */}
        <div className="flex-1 overflow-auto space-y-3 mb-4 pr-1">
          {messages.length === 0 && (
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
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`group relative max-w-[80%] rounded-xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "bg-muted text-foreground"
                  : "bg-accent text-accent-foreground border border-border"
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
                      <div className="flex items-center gap-0.5 text-[10px] font-medium text-primary">
                        <Check className="h-3 w-3" /> Used
                      </div>
                    )}
                  </div>
                )}

                {/* Selected blue bar indicator */}
                {msg.role === "assistant" && msg.selected && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-primary" />
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
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </>
                )}

                {editingId !== msg.id && (
                  <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground">
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-card border-border">
                        {msg.role === "assistant" && (
                          <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(msg.content); toast.success("Copied!"); }} className="text-foreground">
                            <Copy className="h-3 w-3 mr-2" /> Copy
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
        <div className="flex gap-2 mb-3 items-center">
          <Button
            onClick={() => generateSuggestions("friend")}
            disabled={loading || messages.length === 0}
            variant="outline"
            size="sm"
            className={`border-secondary/30 text-secondary hover:bg-secondary/10 ${persona === "friend" ? "ring-1 ring-secondary/30" : ""}`}
          >
            🤝 Nifimas Reply
          </Button>
          <Button
            onClick={() => generateSuggestions("promoter")}
            disabled={loading || messages.length === 0}
            variant="outline"
            size="sm"
            className={`border-primary/30 text-primary hover:bg-primary/10 ${persona === "promoter" ? "ring-1 ring-primary/30" : ""}`}
          >
            💼 Brozeen Reply
          </Button>
          <div className="flex-1" />
          <select
            value={contact?.status || "new"}
            onChange={async (e) => {
              const newStatus = e.target.value;
              await (supabase.from("streamer_contacts" as any).update({ status: newStatus }).eq("id", contactId) as any);
              setContact((prev) => prev ? { ...prev, status: newStatus } : prev);
              toast.success(`Status: ${newStatus.replace(/_/g, " ")}`);
            }}
            className="text-xs bg-muted border border-border rounded-md px-2 py-1 text-foreground"
          >
            <option value="new">👋 New friend request</option>
            <option value="in_conversation">💬 In conversation</option>
            <option value="ready_to_pitch">🎯 Ready to pitch</option>
            <option value="converted">✅ Converted</option>
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
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            onClick={handleSend}
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
