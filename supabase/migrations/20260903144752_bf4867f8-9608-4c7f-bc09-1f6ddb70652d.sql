CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_created ON public.ai_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated ON public.ai_conversations (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_contact_created ON public.contact_messages (contact_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contact_messages_user_created ON public.contact_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_streamer_contacts_user_updated ON public.streamer_contacts (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_created ON public.analytics_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_user_created ON public.knowledge_entries (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_app_notifications_user_unread ON public.app_notifications (user_id, created_at DESC) WHERE read = false;