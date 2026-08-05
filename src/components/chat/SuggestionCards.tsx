import { Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Suggestion = {
  message: string;
  reason: string;
  approach: string;
};

type Persona = "friend" | "promoter" | "streamer";

type Props = {
  suggestions: Suggestion[];
  persona: Persona;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  loading?: boolean;
};

const personaStyles: Record<Persona, { border: string; selected: string; badge: string }> = {
  friend: {
    border: "border-secondary/30",
    selected: "border-secondary ring-2 ring-secondary/40",
    badge: "border-secondary/50 bg-secondary/10 text-secondary",
  },
  promoter: {
    border: "border-primary/30",
    selected: "border-primary ring-2 ring-primary/40",
    badge: "border-primary/50 bg-primary/10 text-primary",
  },
  streamer: {
    border: "border-info/30",
    selected: "border-info ring-2 ring-info/40",
    badge: "border-info/50 bg-info/10 text-info",
  },
};

export const SuggestionCards = ({ suggestions, persona, selectedIndex, onSelect, loading }: Props) => {
  const styles = personaStyles[persona];

  if (loading) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-muted/50 border border-border" />
        ))}
      </div>
    );
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-2">
      {suggestions.map((s, i) => {
        const isSelected = selectedIndex === i;
        return (
          <Card
            key={i}
            className={`cursor-pointer transition-all bg-card hover:bg-accent/30 ${
              isSelected ? styles.selected : styles.border
            }`}
            onClick={() => onSelect(i)}
          >
            <CardContent className="p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${styles.badge}`}>
                      {s.approach}
                    </Badge>
                    {isSelected && (
                      <div className="flex items-center gap-1 text-[10px] font-medium text-primary">
                        <Check className="h-3 w-3" /> Selected
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{s.message}</p>
                  <p className="text-xs text-muted-foreground mt-1.5 italic">💡 {s.reason}</p>
                </div>
                <div className={`mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? "border-primary bg-primary" : "border-muted-foreground/30"
                }`}>
                  {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
