import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Contact = {
  display_name: string | null;
  username: string;
  platform: string;
  profile_image_url: string | null;
  growth_stage: string | null;
};

type Persona = "friend" | "promoter";

type Props = {
  contact: Contact;
  persona: Persona;
  onPersonaChange: (p: Persona) => void;
  onBack: () => void;
};

const personaConfig = {
  friend: { badgeClass: "border-secondary/50 bg-secondary/10 text-secondary" },
  promoter: { badgeClass: "border-primary/50 bg-primary/10 text-primary" },
};

export const ChatHeader = ({ contact, persona, onPersonaChange, onBack }: Props) => (
  <div className="flex items-center gap-3 mb-4 pb-3 border-b border-border">
    <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground hover:text-foreground">
      <ArrowLeft className="h-4 w-4" />
    </Button>
    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
      {contact.profile_image_url ? (
        <img src={contact.profile_image_url} alt="" className="h-10 w-10 rounded-full" />
      ) : (
        <span className="text-sm font-bold text-foreground">{(contact.display_name || contact.username)[0].toUpperCase()}</span>
      )}
    </div>
    <div className="flex-1">
      <h1 className="text-lg font-bold text-foreground">{contact.display_name || contact.username}</h1>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs border-primary/30 text-primary capitalize">{contact.platform}</Badge>
        {contact.growth_stage && <Badge variant="outline" className="text-xs text-muted-foreground">{contact.growth_stage}</Badge>}
      </div>
    </div>
    <div className="flex gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => onPersonaChange("friend")}
        className={persona === "friend" ? personaConfig.friend.badgeClass : "text-muted-foreground"}
      >
        🤝 Nifimas
      </Button>
      <Button
        size="sm"
        variant="outline"
        onClick={() => onPersonaChange("promoter")}
        className={persona === "promoter" ? personaConfig.promoter.badgeClass : "text-muted-foreground"}
      >
        💼 Brozeen
      </Button>
    </div>
  </div>
);
