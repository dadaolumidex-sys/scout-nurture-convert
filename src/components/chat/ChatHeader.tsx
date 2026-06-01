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
    <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to inbox" className="text-muted-foreground hover:text-foreground shrink-0">
      <ArrowLeft className="h-4 w-4" />
    </Button>
    <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden shrink-0">
      {contact.profile_image_url ? (
        <img src={contact.profile_image_url} alt={`${contact.display_name || contact.username} avatar`} className="h-10 w-10 rounded-full" />
      ) : (
        <span className="text-sm font-bold text-foreground" aria-hidden="true">{(contact.display_name || contact.username)[0].toUpperCase()}</span>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <h1 className="text-lg font-bold text-foreground truncate">{contact.display_name || contact.username}</h1>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="text-xs border-primary/30 text-primary capitalize">{contact.platform}</Badge>
        {contact.growth_stage && <Badge variant="outline" className="text-xs text-muted-foreground">{contact.growth_stage}</Badge>}
      </div>
    </div>
    <div className="flex gap-2" role="radiogroup" aria-label="AI persona">
      <Button
        size="sm"
        variant="outline"
        role="radio"
        aria-checked={persona === "friend"}
        aria-label="Nifimas, friendly persona"
        onClick={() => onPersonaChange("friend")}
        className={persona === "friend" ? personaConfig.friend.badgeClass : "text-muted-foreground"}
      >
        <span aria-hidden="true">🤝</span> Nifimas
      </Button>
      <Button
        size="sm"
        variant="outline"
        role="radio"
        aria-checked={persona === "promoter"}
        aria-label="Brozeen, promoter persona"
        onClick={() => onPersonaChange("promoter")}
        className={persona === "promoter" ? personaConfig.promoter.badgeClass : "text-muted-foreground"}
      >
        <span aria-hidden="true">💼</span> Brozeen
      </Button>
    </div>
  </div>
);
