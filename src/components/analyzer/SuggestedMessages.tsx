import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = { friendMessage: string; promoterMessage: string };

export const SuggestedMessages = ({ friendMessage, promoterMessage }: Props) => (
  <div className="grid md:grid-cols-2 gap-4">
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-secondary">🤝 Friend Mode (Nifimas)</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground italic">"{friendMessage}"</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-secondary text-secondary hover:bg-secondary/10"
          onClick={() => { navigator.clipboard.writeText(friendMessage); toast.success("Copied!"); }}
        >
          Copy Message
        </Button>
      </CardContent>
    </Card>
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-primary">💼 Promoter Mode (Brozeen)</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground italic">"{promoterMessage}"</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3 border-primary text-primary hover:bg-primary/10"
          onClick={() => { navigator.clipboard.writeText(promoterMessage); toast.success("Copied!"); }}
        >
          Copy Message
        </Button>
      </CardContent>
    </Card>
  </div>
);
