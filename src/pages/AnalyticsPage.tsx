import { useState, useEffect, useMemo } from "react";
import { BarChart3, TrendingUp, Users, DollarSign, Zap, Plus, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardLayout } from "@/components/DashboardLayout";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from "recharts";

type AnalyticsEvent = {
  id: string;
  event_type: string;
  persona: string | null;
  streamer_username: string | null;
  platform: string | null;
  revenue: number;
  created_at: string;
};

const EVENT_TYPES = ["scouted", "contacted", "responded", "converted"];
const COLORS = {
  scouted: "hsl(175, 80%, 50%)",
  contacted: "hsl(210, 80%, 55%)",
  responded: "hsl(260, 60%, 55%)",
  converted: "hsl(145, 65%, 45%)",
};

const AnalyticsPage = () => {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newEvent, setNewEvent] = useState({
    event_type: "scouted",
    persona: "nifimas",
    streamer_username: "",
    platform: "twitch",
    revenue: "",
  });

  useEffect(() => {
    fetchEvents();
  }, []);

  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load analytics");
    } else {
      setEvents((data || []).map((d: any) => ({ ...d, revenue: Number(d.revenue) || 0 })));
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    const { error } = await supabase.from("analytics_events").insert({
      event_type: newEvent.event_type,
      persona: newEvent.persona,
      streamer_username: newEvent.streamer_username || null,
      platform: newEvent.platform,
      revenue: newEvent.event_type === "converted" ? parseFloat(newEvent.revenue) || 0 : 0,
    });
    if (error) {
      toast.error("Failed to log event");
    } else {
      toast.success("Event logged!");
      setDialogOpen(false);
      setNewEvent({ event_type: "scouted", persona: "nifimas", streamer_username: "", platform: "twitch", revenue: "" });
      fetchEvents();
    }
  };

  // Stats
  const stats = useMemo(() => {
    const funnel = EVENT_TYPES.map((type) => ({
      name: type.charAt(0).toUpperCase() + type.slice(1),
      count: events.filter((e) => e.event_type === type).length,
    }));

    const totalRevenue = events.filter((e) => e.event_type === "converted").reduce((sum, e) => sum + e.revenue, 0);

    const personaPerf = [
      { name: "Nifimas", converted: events.filter((e) => e.persona === "nifimas" && e.event_type === "converted").length, contacted: events.filter((e) => e.persona === "nifimas" && e.event_type === "contacted").length },
      { name: "Brozeen", converted: events.filter((e) => e.persona === "brozeen" && e.event_type === "converted").length, contacted: events.filter((e) => e.persona === "brozeen" && e.event_type === "contacted").length },
    ];

    // Activity by day (last 7 days)
    const now = new Date();
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (6 - i));
      return d.toISOString().split("T")[0];
    });
    const activity = days.map((day) => ({
      day: day.slice(5),
      events: events.filter((e) => e.created_at.startsWith(day)).length,
    }));

    const conversionRate = funnel[1].count > 0
      ? ((funnel[3].count / funnel[1].count) * 100).toFixed(1)
      : "0";

    return { funnel, totalRevenue, personaPerf, activity, conversionRate };
  }, [events]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto space-y-6 animate-slide-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
            <p className="text-muted-foreground text-sm">
              Track performance for Streamer Promotion Services
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gradient-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-2" /> Log Event
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle className="text-foreground">Log Outreach Event</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 mt-2">
                <div>
                  <Label className="text-foreground">Event Type</Label>
                  <Select value={newEvent.event_type} onValueChange={(v) => setNewEvent({ ...newEvent, event_type: v })}>
                    <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      {EVENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-foreground">Persona</Label>
                  <Select value={newEvent.persona} onValueChange={(v) => setNewEvent({ ...newEvent, persona: v })}>
                    <SelectTrigger className="bg-muted border-border text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-card border-border">
                      <SelectItem value="nifimas">🤝 Nifimas</SelectItem>
                      <SelectItem value="brozeen">💼 Brozeen</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-foreground">Streamer Username (optional)</Label>
                  <Input value={newEvent.streamer_username} onChange={(e) => setNewEvent({ ...newEvent, streamer_username: e.target.value })} placeholder="username" className="bg-muted border-border text-foreground" />
                </div>
                {newEvent.event_type === "converted" && (
                  <div>
                    <Label className="text-foreground">Revenue ($)</Label>
                    <Input type="number" value={newEvent.revenue} onChange={(e) => setNewEvent({ ...newEvent, revenue: e.target.value })} placeholder="0.00" className="bg-muted border-border text-foreground" />
                  </div>
                )}
                <Button onClick={handleAdd} className="w-full gradient-primary text-primary-foreground">Log Event</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.funnel[0].count}</p>
                <p className="text-xs text-muted-foreground">Scouted</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <Zap className="h-8 w-8 text-info" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.funnel[1].count}</p>
                <p className="text-xs text-muted-foreground">Contacted</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <TrendingUp className="h-8 w-8 text-secondary" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.conversionRate}%</p>
                <p className="text-xs text-muted-foreground">Conversion</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <DollarSign className="h-8 w-8 text-success" />
              <div>
                <p className="text-2xl font-bold text-foreground">${stats.totalRevenue.toFixed(0)}</p>
                <p className="text-xs text-muted-foreground">Revenue</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-4">
          {/* Funnel */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm text-foreground">Outreach Funnel</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.funnel}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 18%)" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 15%, 18%)", color: "hsl(210, 20%, 92%)" }} />
                  <Bar dataKey="count" fill="hsl(175, 80%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card className="bg-card border-border">
            <CardHeader><CardTitle className="text-sm text-foreground">Activity (Last 7 Days)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={stats.activity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 18%)" />
                  <XAxis dataKey="day" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 15%, 18%)", color: "hsl(210, 20%, 92%)" }} />
                  <Line type="monotone" dataKey="events" stroke="hsl(260, 60%, 55%)" strokeWidth={2} dot={{ fill: "hsl(260, 60%, 55%)" }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Persona Performance */}
          <Card className="bg-card border-border md:col-span-2">
            <CardHeader><CardTitle className="text-sm text-foreground">Persona Performance</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={stats.personaPerf}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 15%, 18%)" />
                  <XAxis dataKey="name" tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <YAxis tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "hsl(220, 18%, 10%)", border: "1px solid hsl(220, 15%, 18%)", color: "hsl(210, 20%, 92%)" }} />
                  <Bar dataKey="contacted" fill="hsl(210, 80%, 55%)" radius={[4, 4, 0, 0]} name="Contacted" />
                  <Bar dataKey="converted" fill="hsl(145, 65%, 45%)" radius={[4, 4, 0, 0]} name="Converted" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default AnalyticsPage;
