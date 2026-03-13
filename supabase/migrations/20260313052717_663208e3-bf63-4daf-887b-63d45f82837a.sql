
CREATE TABLE public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES public.streamer_contacts(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL DEFAULT 'user',
  content text NOT NULL,
  persona text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to contact_messages" ON public.contact_messages
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Add a conversation_type field to streamer_contacts for tracking outreach stage
ALTER TABLE public.streamer_contacts ADD COLUMN IF NOT EXISTS conversation_type text DEFAULT 'new';

-- Create storage bucket for chat images
INSERT INTO storage.buckets (id, name, public) VALUES ('chat-images', 'chat-images', true);

CREATE POLICY "Allow public uploads to chat-images" ON storage.objects
  FOR INSERT TO public WITH CHECK (bucket_id = 'chat-images');

CREATE POLICY "Allow public reads from chat-images" ON storage.objects
  FOR SELECT TO public USING (bucket_id = 'chat-images');

CREATE POLICY "Allow public deletes from chat-images" ON storage.objects
  FOR DELETE TO public USING (bucket_id = 'chat-images');
