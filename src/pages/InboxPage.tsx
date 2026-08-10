import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MessageSquare, ExternalLink, Search, UserPlus, Upload, Ghost, ImagePlus, X, List, LayoutGrid } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout } from "@/components/DashboardLayout";
import { RemindersPanel } from "@/components/inbox/RemindersPanel";
import { PipelineBoard } from "@/components/inbox/PipelineBoard";
import { LEAD_STATUSES } from "@/lib/leadStatus";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { guestStorage, readFileAsDataUrl } from "@/lib/guestStorage";

type Contact = {
  id: string;
  username: string;
  display_name: string | null;
  platform: string;
  channel_url: string | null;
  growth_stage: string | null;
  avg_viewers: string | null;
  status: string | null;
  last_message: string | null;
  profile_image_url: string | null;
  conversation_type: string | null;
};

type ConversationType = "new_prospect" | "existing_chat" | "re_engage";

const conversationStages: Record<string, { label: string; emoji: string; className: string }> =
  Object.fromEntries(LEAD_STATUSES.map((s) => [s.id, { label: s.label, emoji: s.emoji, className: s.className }]));


const conversationTypes: Record<ConversationType, { label: string; description: string; icon: React.ReactNode }> = {
  new_prospect: { label: "New Prospect", description: "Cold outreach — start fresh", icon: <UserPlus className="h-6 w-6" /> },
  existing_chat: { label: "Existing Chat", description: "Upload DMs to continue", icon: <Upload className="h-6 w-6" /> },
  re_engage: { label: "Re-engage", description: "They saw but didn't reply", icon: <Ghost className="h-6 w-6" /> },
};

const InboxPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"list" | "pipeline">("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<"type" | "details">("type");
  const [selectedType, setSelectedType] = useState<ConversationType | null>(null);
  const [newName, setNewName] = useState("");
  const [newPlatform, setNewPlatform] = useState<"twitch" | "kick">("twitch");
  const [newPersona, setNewPersona] = useState<"friend" | "promoter" | "streamer">("friend");
  const [chatHistory, setChatHistory] = useState("");
  const [chatImages, setChatImages] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContacts();
  }, [user?.id]);

  const loadContacts = async () => {
    if (!user) {
      setContacts(guestStorage.contacts.list());
      setLoading(false);
      return;
    }

    const { data, error } = await (supabase.from("streamer_contacts" as any).select("*").order("created_at", { ascending: false }) as any);
    if (error) {
      console.error("Failed to load contacts:", error);
    } else {
      setContacts(data || []);
    }
    setLoading(false);
  };

  const filteredContacts = contacts.filter((c) =>
    (c.display_name || c.username).toLowerCase().includes(search.toLowerCase())
  );

  const resetDialog = () => {
    setDialogStep("type");
    setSelectedType(null);
    setNewName("");
    setNewUrl("");
    setChatHistory("");
    setChatImages([]);
  };

  const handleAddContact = async () => {
    if (!newName.trim()) {
      toast.error("Name is required");
      return;
    }
    const statusMap: Record<ConversationType, string> = {
      new_prospect: "new",
      existing_chat: "in_conversation",
      re_engage: "new",
    };
    const baseContact = {
      username: newName.toLowerCase().replace(/\s+/g, ""),
      display_name: newName,
      platform: newPlatform,
      channel_url: newUrl || (selectedType === "new_prospect" ? `https://${newPlatform === "twitch" ? "twitch.tv" : "kick.com"}/${newName.toLowerCase()}` : null),
      conversation_type: selectedType,
      status: statusMap[selectedType || "new_prospect"],
    };

    try {
      if (user) {
        const { data, error } = await (supabase.from("streamer_contacts" as any).insert({
          ...baseContact,
          user_id: user.id,
        }).select().single() as any);

        if (error) throw error;

        if (chatHistory.trim() && data?.id) {
          await (supabase.from("contact_messages" as any).insert({
            contact_id: data.id,
            content: `📋 Previous chat history:\n\n${chatHistory}`,
            role: "context",
            persona: "nifimas",
            user_id: user.id,
          }) as any);
        }

        if (chatImages.length > 0 && data?.id) {
          for (const file of chatImages) {
            const imageUrl = await readFileAsDataUrl(file);
            await (supabase.from("contact_messages" as any).insert({
              contact_id: data.id,
              content: "📸 Chat screenshot uploaded for context",
              role: "context",
              persona: "nifimas",
              image_url: imageUrl,
              user_id: user.id,
            }) as any);
          }
        }
      } else {
        const contact = guestStorage.contacts.insert(baseContact);

        if (chatHistory.trim()) {
          guestStorage.messages.insert({
            contact_id: contact.id,
            content: `📋 Previous chat history:\n\n${chatHistory}`,
            role: "context",
            persona: "nifimas",
            image_url: null,
            selected: false,
          });
        }

        for (const file of chatImages) {
          const imageUrl = await readFileAsDataUrl(file);
          guestStorage.messages.insert({
            contact_id: contact.id,
            content: "📸 Chat screenshot uploaded for context",
            role: "context",
            persona: "nifimas",
            image_url: imageUrl,
            selected: false,
          });
        }
      }

      toast.success(user ? "Contact added!" : "Contact added in guest mode!");
      resetDialog();
      setDialogOpen(false);
      loadContacts();
    } catch (error) {
      toast.error("Failed to add contact");
      console.error(error);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6 animate-slide-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Conversation Inbox</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">Manage your streamer conversations</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetDialog(); }}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground font-semibold hover:opacity-90 w-full sm:w-auto">
                <Plus className="h-4 w-4 mr-2" />
                New Chat
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-md mx-auto">
              {dialogStep === "type" ? (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-foreground">New Chat</DialogTitle>
                    <DialogDescription className="text-muted-foreground">What type of conversation is this?</DialogDescription>
                  </DialogHeader>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {(Object.entries(conversationTypes) as [ConversationType, typeof conversationTypes[ConversationType]][]).map(([key, type]) => (
                      <button
                        key={key}
                        onClick={() => { setSelectedType(key); setDialogStep("details"); }}
                        className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border bg-muted/50 hover:border-primary/50 hover:bg-accent/30 transition-all text-center group"
                      >
                        <div className="text-muted-foreground group-hover:text-primary transition-colors">
                          {type.icon}
                        </div>
                        <span className="text-xs sm:text-sm font-semibold text-foreground">{type.label}</span>
                        <span className="text-[10px] sm:text-xs text-muted-foreground leading-tight">{type.description}</span>
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-foreground flex items-center gap-2">
                      {selectedType && conversationTypes[selectedType].icon}
                      {selectedType && conversationTypes[selectedType].label}
                    </DialogTitle>
                    <DialogDescription className="text-muted-foreground">
                      {selectedType === "new_prospect" && "Add the streamer you want to reach out to"}
                      {selectedType === "existing_chat" && "Continue a conversation you've already started"}
                      {selectedType === "re_engage" && "Re-engage a streamer who hasn't replied"}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 mt-2 max-h-[60vh] overflow-y-auto pr-1">
                    <div>
                      <Label className="text-foreground text-sm">Name</Label>
                      <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Streamer name" className="bg-muted border-border text-foreground mt-1" />
                    </div>
                    <div>
                      <Label className="text-foreground text-sm">Platform</Label>
                      <Select value={newPlatform} onValueChange={(v) => setNewPlatform(v as "twitch" | "kick")}>
                        <SelectTrigger className="bg-muted border-border text-foreground mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="twitch">Twitch</SelectItem>
                          <SelectItem value="kick">Kick</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {selectedType === "new_prospect" && (
                      <div>
                        <Label className="text-foreground text-sm">Channel URL</Label>
                        <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://twitch.tv/username" className="bg-muted border-border text-foreground mt-1" />
                      </div>
                    )}
                    {(selectedType === "existing_chat" || selectedType === "re_engage") && (
                      <div>
                        <Label className="text-foreground text-sm">Channel URL <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://twitch.tv/username" className="bg-muted border-border text-foreground mt-1" />
                      </div>
                    )}

                    {/* Chat history paste area for Existing Chat & Re-engage */}
                     {(selectedType === "existing_chat" || selectedType === "re_engage") && (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-foreground text-sm flex items-center gap-1.5">
                            <Upload className="h-3.5 w-3.5" />
                            Paste Previous Chat
                          </Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
                            Paste your Discord/DM conversation so the AI knows the context
                          </p>
                          <Textarea
                            value={chatHistory}
                            onChange={(e) => setChatHistory(e.target.value)}
                            placeholder={"Example:\nYou: Hey bro, love your streams!\nStreamer: Thanks man!\nYou: I've got something that could help grow your channel..."}
                            className="bg-muted border-border text-foreground min-h-[100px] text-sm"
                          />
                        </div>
                        <div>
                          <Label className="text-foreground text-sm flex items-center gap-1.5">
                            <ImagePlus className="h-3.5 w-3.5" />
                            Upload Chat Screenshots
                          </Label>
                          <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
                            Upload screenshots of your DMs for the AI to analyze
                          </p>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            id="chat-screenshot-upload"
                            onChange={(e) => {
                              if (e.target.files) {
                                setChatImages(prev => [...prev, ...Array.from(e.target.files!)]);
                              }
                            }}
                          />
                          <label
                            htmlFor="chat-screenshot-upload"
                            className="flex items-center justify-center gap-2 w-full p-3 rounded-lg border border-dashed border-border bg-muted/50 hover:border-primary/50 hover:bg-accent/20 transition-all cursor-pointer text-sm text-muted-foreground"
                          >
                            <ImagePlus className="h-4 w-4" />
                            Click to upload screenshots
                          </label>
                          {chatImages.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-2">
                              {chatImages.map((file, i) => (
                                <div key={i} className="relative group">
                                  <img
                                    src={URL.createObjectURL(file)}
                                    alt={`Screenshot ${i + 1}`}
                                    className="h-16 w-16 rounded-md object-cover border border-border"
                                  />
                                  <button
                                    onClick={() => setChatImages(prev => prev.filter((_, idx) => idx !== i))}
                                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button variant="outline" onClick={() => setDialogStep("type")} className="flex-1 border-border text-muted-foreground hover:text-foreground">Back</Button>
                      <Button onClick={handleAddContact} className="flex-1 gradient-primary text-primary-foreground">
                        {selectedType === "new_prospect" ? "Add & Start Chat" : "Add & Continue"}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </div>

        {/* Reminders */}
        <RemindersPanel contacts={contacts.map(c => ({ id: c.id, username: c.username, display_name: c.display_name }))} />

        {/* Search + view toggle */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-muted border-border text-foreground placeholder:text-muted-foreground" />
          </div>
          <div className="flex items-center rounded-md border border-border bg-muted p-0.5 shrink-0">
            <button onClick={() => setView("list")} className={`p-1.5 rounded ${view === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} title="List">
              <List className="h-4 w-4" />
            </button>
            <button onClick={() => setView("pipeline")} className={`p-1.5 rounded ${view === "pipeline" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`} title="Pipeline">
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Pipeline view */}
        {view === "pipeline" && !loading && (
          <PipelineBoard contacts={filteredContacts as any} onRefresh={loadContacts} />
        )}

        {/* List view */}
        {view === "list" && (
        <div className="space-y-2 sm:space-y-3">
          {loading ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center text-muted-foreground">Loading contacts...</CardContent>
            </Card>
          ) : filteredContacts.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No contacts yet. Add a new chat to get started!</p>
              </CardContent>
            </Card>
          ) : (
            filteredContacts.map((contact) => (
              <Card key={contact.id} className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer" onClick={() => navigate(`/inbox/${contact.id}`)}>
                <CardContent className="p-3 sm:p-4 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
                      {contact.profile_image_url ? (
                        <img src={contact.profile_image_url} alt={contact.display_name || contact.username} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        <span className="text-xs sm:text-sm font-bold text-foreground">{(contact.display_name || contact.username)[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <h3 className="font-semibold text-sm sm:text-base text-foreground truncate">{contact.display_name || contact.username}</h3>
                        <Badge variant="outline" className="border-primary/30 text-primary text-[10px] sm:text-xs capitalize shrink-0">{contact.platform}</Badge>
                        {(() => {
                          const stage = conversationStages[contact.status || "new"] || conversationStages.new;
                          return (
                            <Badge variant="outline" className={`text-[10px] sm:text-xs shrink-0 ${stage.className}`}>
                              {stage.emoji} <span className="hidden sm:inline ml-1">{stage.label}</span>
                            </Badge>
                          );
                        })()}
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
                        {contact.avg_viewers ? `Avg viewers: ${contact.avg_viewers}` : "No analysis data yet"}
                      </p>
                    </div>
                  </div>
                  {contact.channel_url && (
                    <a href={contact.channel_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary shrink-0">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default InboxPage;
