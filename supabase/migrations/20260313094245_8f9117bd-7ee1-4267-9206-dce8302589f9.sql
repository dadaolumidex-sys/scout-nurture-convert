
-- Create ai_conversations table for persistent chat history
CREATE TABLE public.ai_conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Chat',
  persona TEXT NOT NULL DEFAULT 'friend',
  deep_research BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create ai_messages table
CREATE TABLE public.ai_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.ai_conversations(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  content TEXT NOT NULL,
  images TEXT[] DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add user_id to existing tables
ALTER TABLE public.streamer_contacts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.contact_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.knowledge_entries ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.training_conversations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Enable RLS on new tables
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

-- RLS for ai_conversations
CREATE POLICY "Users can manage own conversations" ON public.ai_conversations FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- RLS for ai_messages
CREATE POLICY "Users can manage own messages" ON public.ai_messages FOR ALL TO authenticated USING (conversation_id IN (SELECT id FROM public.ai_conversations WHERE user_id = auth.uid())) WITH CHECK (conversation_id IN (SELECT id FROM public.ai_conversations WHERE user_id = auth.uid()));

-- Update existing RLS policies to be user-scoped
DROP POLICY IF EXISTS "Allow all access to streamer_contacts" ON public.streamer_contacts;
CREATE POLICY "Users manage own contacts" ON public.streamer_contacts FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
-- Allow existing data without user_id to be visible (migration period)
CREATE POLICY "Legacy data visible" ON public.streamer_contacts FOR SELECT TO authenticated USING (user_id IS NULL);

DROP POLICY IF EXISTS "Allow all access to contact_messages" ON public.contact_messages;
CREATE POLICY "Users manage own contact messages" ON public.contact_messages FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Legacy contact messages visible" ON public.contact_messages FOR SELECT TO authenticated USING (user_id IS NULL);

DROP POLICY IF EXISTS "Allow all access to knowledge_entries" ON public.knowledge_entries;
CREATE POLICY "Users manage own knowledge" ON public.knowledge_entries FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Legacy knowledge visible" ON public.knowledge_entries FOR SELECT TO authenticated USING (user_id IS NULL);

DROP POLICY IF EXISTS "Allow all access to training_conversations" ON public.training_conversations;
CREATE POLICY "Users manage own training" ON public.training_conversations FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Legacy training visible" ON public.training_conversations FOR SELECT TO authenticated USING (user_id IS NULL);

DROP POLICY IF EXISTS "Allow all access to analytics_events" ON public.analytics_events;
CREATE POLICY "Users manage own analytics" ON public.analytics_events FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Legacy analytics visible" ON public.analytics_events FOR SELECT TO authenticated USING (user_id IS NULL);

-- Enable realtime for ai_messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_messages;
