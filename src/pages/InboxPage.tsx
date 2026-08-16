import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MessageSquare, ExternalLink, Search, UserPlus, Upload, Ghost, List, LayoutGrid, Trash2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout } from "@/components/DashboardLayout";
import { RemindersPanel } from "@/components/inbox/RemindersPanel";
import { PipelineBoard } from "@/components/inbox/PipelineBoard";
import { getInboxState, INBOX_STATES, type InboxState } from "@/lib/inboxState";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { guestStorage } from "@/lib/guestStorage";

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
  inbox_state?: string | null;
};

type ConversationType = "new_prospect" | "existing_chat" | "re_engage";
type InboxFilter = "all" | InboxState;

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
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [view, setView] = useState<"list" | "pipeline">("list");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogStep, setDialogStep] = useState<"type" | "details">("type");
  const [selectedType, setSelectedType] = useState<ConversationType | null>(null);
  const [newName, setNewName] = useState("");
  const [newPlatform, setNewPlatform] = useState<"twitch" | "kick">("twitch");
  const [newPersona, setNewPersona] = useState<"friend" | "promoter" | "streamer">("friend");
  const [chatHistory, setChatHistory] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [contactToDelete, setContactToDelete] = useState<Contact | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadContacts();
  }, [user?.id]);

  const loadContacts = async () => {
    setLoading(true);
    setLoadError(null);
    if (!user) {
      setContacts(guestStorage.contacts.list());
      setLoading(false);
      return;
    }

    const { data, error } = await (supabase.from("streamer_contacts" as any).select("*").order("created_at", { ascending: false }) as any);
    if (error) {
      console.error("Failed to load contacts:", error);
      setLoadError(error.message || "The inbox could not be loaded.");
      toast.error(error.message || "Failed to load inbox");
    } else {
      setContacts(data || []);
    }
    setLoading(false);
  };

  const filteredContacts = contacts.filter((c) => {
    const matchesSearch = (c.display_name || c.username).toLowerCase().includes(search.toLowerCase());
    const state = getInboxState(c.inbox_state, c.status);
    return matchesSearch && (filter === "all" || state === filter);
  });

  const filterCount = (next: InboxFilter) => contacts.filter((contact) => {
    return next === "all" || getInboxState(contact.inbox_state, contact.status) === next;
  }).length;

  const resetDialog = () => {
    setDialogStep("type");
    setSelectedType(null);
    setNewName("");
    setNewPersona("friend");
    setChatHistory("");
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
    const contextLabel =
      selectedType === "new_prospect"
        ? "Their reply to my first message"
        : selectedType === "re_engage"
          ? "Our chat so far (they went quiet)"
          : "Our chat so far";

    const baseContact = {
      username: newName.toLowerCase().replace(/\s+/g, ""),
      display_name: newName,
      platform: newPlatform,
      channel_url: null,
      conversation_type: selectedType,
      // Keep the way this Inbox started even after its active reply voice
      // changes from Friendship to Promoter & Closer or Expert Proof.
      growth_stage: selectedType,
      status: statusMap[selectedType || "new_prospect"],
    };

    try {
      let newId: string | null = null;

      if (user) {
        const { data, error } = await (supabase.from("streamer_contacts" as any).insert({
          ...baseContact,
          user_id: user.id,
        }).select().single() as any);

        if (error) throw error;
        newId = data?.id ?? null;

        if (chatHistory.trim() && newId) {
          await (supabase.from("contact_messages" as any).insert({
            contact_id: newId,
            content: `${contextLabel}:\n\n${chatHistory.trim()}`,
            role: "user",
            persona: newPersona,
            user_id: user.id,
          }) as any);
        }

      } else {
        const contact = guestStorage.contacts.insert(baseContact);
        newId = contact.id;

        if (chatHistory.trim()) {
          guestStorage.messages.insert({
            contact_id: contact.id,
            content: `${contextLabel}:\n\n${chatHistory.trim()}`,
            role: "user",
            persona: newPersona,
            image_url: null,
            selected: false,
          });
        }

      }

      const shouldAutogen = chatHistory.trim().length > 0;
      toast.success(user ? "Contact added!" : "Contact added in guest mode!");
      const persona = newPersona;
      resetDialog();
      setDialogOpen(false);
      loadContacts();
      if (newId) navigate(`/inbox/${newId}?persona=${persona}${shouldAutogen ? "&autogen=1" : ""}`);
    } catch (error) {
      toast.error("Failed to add contact");
      console.error(error);
    }
  };

  const deleteContact = async () => {
    if (!contactToDelete) return;
    setDeleting(true);
    try {
      if (user) {
        const { error } = await (supabase.from("streamer_contacts" as any).delete().eq("id", contactToDelete.id) as any);
        if (error) throw error;
      } else {
        guestStorage.contacts.remove(contactToDelete.id);
      }
      toast.success(`${contactToDelete.display_name || contactToDelete.username} removed from Inbox`);
      setContactToDelete(null);
      await loadContacts();
    } catch (error) {
      console.error(error);
      toast.error("Could not delete this Inbox client");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6 animate-slide-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-foreground">Conversation Inbox</h1>
            <p className="text-muted-foreground text-xs sm:text-sm">Choose a client, paste their latest message, then get a reply.</p>
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
                    <div>
                      <Label className="text-foreground text-sm">Conversation style</Label>
                      <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
                        Which voice is this chat coming from? The AI writes every reply in that persona.
                      </p>
                      <Select value={newPersona} onValueChange={(v) => setNewPersona(v as "friend" | "promoter" | "streamer")}>
                        <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-card border-border">
                          <SelectItem value="friend">🤝 Friendship — build trust and rapport</SelectItem>
                          <SelectItem value="promoter">💼 Promoter & Closer — give value, handle objections, close</SelectItem>
                          <SelectItem value="streamer">🎤 Expert Proof — backup authority and success proof</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <Label className="text-foreground text-sm flex items-center gap-1.5">
                          <Upload className="h-3.5 w-3.5" />
                          {selectedType === "new_prospect"
                            ? "Their reply to your first message"
                            : selectedType === "re_engage"
                              ? "Paste the chat that went quiet"
                              : "Paste your chat so far"}
                        </Label>
                        <p className="text-[11px] text-muted-foreground mt-0.5 mb-1.5">
                          {selectedType === "new_prospect"
                            ? "Paste what they replied after your welcome message — the AI writes the next message for you. Leave empty to start cold."
                            : "Paste the Discord/DM conversation so the AI knows exactly where you left off."}
                        </p>
                        <Textarea
                          value={chatHistory}
                          onChange={(e) => setChatHistory(e.target.value)}
                          placeholder={"Example:\nYou: yo that last clutch was nasty\nThem: haha thanks man appreciate it"}
                          className="bg-muted border-border text-foreground min-h-[100px] text-sm"
                        />
                      </div>

                    </div>


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
        {loadError && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <p className="text-sm font-semibold text-destructive">Inbox could not load</p>
                <p className="text-xs text-muted-foreground mt-1">{loadError}</p>
              </div>
              <Button variant="outline" size="sm" onClick={loadContacts}>Try again</Button>
            </CardContent>
          </Card>
        )}

        {/* Reminders */}
        <RemindersPanel contacts={contacts.map(c => ({ id: c.id, username: c.username, display_name: c.display_name }))} />

        {/* Find and focus */}
        <div className="space-y-2">
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
        <div className="flex gap-2 overflow-x-auto pb-1">
          {([
            ["all", "All"],
            ["needs_reply", "Needs reply"],
            ["waiting", "Waiting"],
            ["finished", "Finished"],
          ] as [InboxFilter, string][]).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={filter === value ? "default" : "outline"}
              onClick={() => setFilter(value)}
              className={filter === value ? "shrink-0 gradient-primary text-primary-foreground" : "shrink-0 border-border text-muted-foreground"}
            >
              {label} ({filterCount(value)})
            </Button>
          ))}
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
                          const stage = INBOX_STATES[getInboxState(contact.inbox_state, contact.status)];
                          return (
                            <Badge variant="outline" className={`text-[10px] sm:text-xs shrink-0 ${stage.className}`}>
                              {stage.emoji} <span className="hidden sm:inline ml-1">{stage.label}</span>
                            </Badge>
                          );
                        })()}
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
                        {contact.last_message?.trim() || (contact.avg_viewers ? `Avg viewers: ${contact.avg_viewers}` : "Open to paste a message and get a reply")}
                      </p>
                    </div>
                  </div>
                  {contact.channel_url && (
                    <a href={contact.channel_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary shrink-0">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${contact.display_name || contact.username} from Inbox`}
                    title="Delete this Inbox client"
                    onClick={(event) => { event.stopPropagation(); setContactToDelete(contact); }}
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))
          )}
        </div>
        )}
      </div>
      <AlertDialog open={!!contactToDelete} onOpenChange={(open) => { if (!open && !deleting) setContactToDelete(null); }}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this Inbox client?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete {contactToDelete?.display_name || contactToDelete?.username} and their Inbox messages? This cannot be undone. Your separate AI Chat conversations will stay safe.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(event) => { event.preventDefault(); void deleteContact(); }} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting..." : "Delete client"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
};

export default InboxPage;
