import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, MessageSquare, ExternalLink, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
};

const statusColors: Record<string, string> = {
  active: "bg-success/20 text-success border-success/30",
  waiting: "bg-warning/20 text-warning border-warning/30",
  cold: "bg-muted text-muted-foreground border-border",
};

const InboxPage = () => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPlatform, setNewPlatform] = useState<"twitch" | "kick">("twitch");
  const [newUrl, setNewUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
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

  const handleAddContact = async () => {
    if (!newName.trim()) {
      toast.error("Name is required");
      return;
    }
    const { error } = await (supabase.from("streamer_contacts" as any).insert({
      username: newName.toLowerCase().replace(/\s+/g, ""),
      display_name: newName,
      platform: newPlatform,
      channel_url: newUrl || `https://${newPlatform === "twitch" ? "twitch.tv" : "kick.com"}/${newName.toLowerCase()}`,
    }) as any);

    if (error) {
      toast.error("Failed to add contact");
      console.error(error);
    } else {
      toast.success("Contact added!");
      setNewName("");
      setNewUrl("");
      setDialogOpen(false);
      loadContacts();
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 animate-slide-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Conversation Inbox</h1>
            <p className="text-muted-foreground text-sm">Manage your streamer conversations</p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground font-semibold hover:opacity-90">
                <Plus className="h-4 w-4 mr-2" />
                New Contact
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Add Streamer Contact</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label className="text-foreground">Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Streamer name" className="bg-muted border-border text-foreground" />
                </div>
                <div>
                  <Label className="text-foreground">Platform</Label>
                  <Select value={newPlatform} onValueChange={(v) => setNewPlatform(v as "twitch" | "kick")}>
                    <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="twitch">Twitch</SelectItem>
                      <SelectItem value="kick">Kick</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-foreground">Channel URL</Label>
                  <Input value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://twitch.tv/username" className="bg-muted border-border text-foreground" />
                </div>
                <Button onClick={handleAddContact} className="w-full gradient-primary text-primary-foreground">Add Contact</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search contacts..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-muted border-border text-foreground placeholder:text-muted-foreground" />
        </div>

        <div className="space-y-3">
          {loading ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center text-muted-foreground">Loading contacts...</CardContent>
            </Card>
          ) : filteredContacts.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="p-8 text-center text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No contacts yet. Analyze a streamer or add one manually!</p>
              </CardContent>
            </Card>
          ) : (
            filteredContacts.map((contact) => (
              <Card key={contact.id} className="bg-card border-border hover:border-primary/30 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                      {contact.profile_image_url ? (
                        <img src={contact.profile_image_url} alt={contact.display_name || contact.username} className="h-10 w-10 rounded-full" />
                      ) : (
                        <span className="text-sm font-bold text-foreground">{(contact.display_name || contact.username)[0].toUpperCase()}</span>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">{contact.display_name || contact.username}</h3>
                        <Badge variant="outline" className="border-primary/30 text-primary text-xs capitalize">{contact.platform}</Badge>
                        {contact.growth_stage && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">{contact.growth_stage}</Badge>
                        )}
                        <Badge variant="outline" className={`text-xs ${statusColors[contact.status || "active"]}`}>{contact.status || "active"}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-0.5 truncate max-w-md">
                        {contact.avg_viewers ? `Avg viewers: ${contact.avg_viewers}` : "No analysis data yet"}
                      </p>
                    </div>
                  </div>
                  {contact.channel_url && (
                    <a href={contact.channel_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default InboxPage;
