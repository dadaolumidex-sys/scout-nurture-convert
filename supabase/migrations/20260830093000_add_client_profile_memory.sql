-- Private notes that describe a specific client. They are used as AI context
-- for that client's Inbox only; they are never sent to the client themselves.
ALTER TABLE public.streamer_contacts
  ADD COLUMN IF NOT EXISTS client_profile jsonb NOT NULL DEFAULT '{}'::jsonb;
