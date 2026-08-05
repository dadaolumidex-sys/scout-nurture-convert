ALTER TABLE public.streamer_contacts
  ADD COLUMN IF NOT EXISTS streamer_message TEXT,
  ADD COLUMN IF NOT EXISTS audit_summary TEXT,
  ADD COLUMN IF NOT EXISTS content_category TEXT;