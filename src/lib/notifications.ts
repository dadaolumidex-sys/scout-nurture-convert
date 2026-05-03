import { supabase } from "@/integrations/supabase/client";

export interface AppNotification {
  id: string;
  user_id: string;
  kind: "info" | "success" | "warning" | "error";
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

export async function notify(kind: AppNotification["kind"], title: string, body?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await (supabase.from("app_notifications" as any) as any).insert({ user_id: user.id, kind, title, body: body ?? null });
}

export async function listNotifications(limit = 30): Promise<AppNotification[]> {
  const { data, error } = await (supabase.from("app_notifications" as any) as any)
    .select("*").order("created_at", { ascending: false }).limit(limit);
  if (error) return [];
  return (data || []) as AppNotification[];
}

export async function markAllRead() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await (supabase.from("app_notifications" as any) as any).update({ read: true }).eq("user_id", user.id).eq("read", false);
}

export async function unreadCount(): Promise<number> {
  const { count } = await (supabase.from("app_notifications" as any) as any)
    .select("id", { count: "exact", head: true }).eq("read", false);
  return count ?? 0;
}
