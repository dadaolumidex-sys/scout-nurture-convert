import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings } from "lucide-react";

const SettingsPage = () => {
  return (
    <DashboardLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-slide-in">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-muted-foreground text-sm">Configure your StreamScout AI workspace</p>
        </div>

        <Card className="bg-card border-border">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Settings className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p>Settings will be available once Lovable Cloud is connected.</p>
            <p className="text-xs mt-1">Configure AI personas, default outreach templates, and more.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default SettingsPage;
