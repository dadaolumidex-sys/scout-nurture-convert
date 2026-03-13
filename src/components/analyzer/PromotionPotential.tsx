import { Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const PromotionPotential = ({ text }: { text: string }) => (
  <Card className="bg-card border-border">
    <CardHeader className="pb-2">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5 text-primary" />
        <CardTitle className="text-sm text-foreground">Promotion Potential</CardTitle>
      </div>
    </CardHeader>
    <CardContent>
      <p className="text-sm text-muted-foreground">{text}</p>
    </CardContent>
  </Card>
);
