
-- Knowledge base entries (URLs, PDFs, text content with extracted insights)
CREATE TABLE public.knowledge_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'text', -- 'url', 'pdf', 'text'
  source_url TEXT,
  content TEXT NOT NULL,
  persona TEXT NOT NULL DEFAULT 'shared', -- 'nifimas', 'brozeen', 'shared'
  category TEXT NOT NULL DEFAULT 'General',
  insights JSONB DEFAULT '[]'::jsonb, -- extracted insights array
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to knowledge_entries" ON public.knowledge_entries FOR ALL TO public USING (true) WITH CHECK (true);

-- Training conversations per persona
CREATE TABLE public.training_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  persona TEXT NOT NULL DEFAULT 'nifimas', -- 'nifimas' or 'brozeen'
  source_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'pdf', 'screenshot'
  content TEXT NOT NULL,
  style_analysis TEXT, -- AI-extracted style fingerprint
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'ready'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.training_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to training_conversations" ON public.training_conversations FOR ALL TO public USING (true) WITH CHECK (true);

-- Analytics events for tracking outreach funnel
CREATE TABLE public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL, -- 'scouted', 'contacted', 'responded', 'converted'
  persona TEXT, -- 'nifimas' or 'brozeen'
  streamer_username TEXT,
  platform TEXT DEFAULT 'twitch',
  revenue NUMERIC(10,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to analytics_events" ON public.analytics_events FOR ALL TO public USING (true) WITH CHECK (true);
