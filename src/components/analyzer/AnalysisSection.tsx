import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { title: string; items: string[]; color: string };

export const AnalysisSection = ({ title, items, color }: Props) => (
  <Card className="bg-card border-border">
    <CardHeader className="pb-2">
      <CardTitle className={`text-sm ${color}`}>{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-muted-foreground flex gap-2">
            <span className={color}>•</span>
            {item}
          </li>
        ))}
      </ul>
    </CardContent>
  </Card>
);
