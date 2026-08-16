-- Keep a simple daily Inbox state separate from the detailed sales pipeline.
-- Existing client records and their current pipeline status are preserved.
ALTER TABLE public.streamer_contacts
  ADD COLUMN IF NOT EXISTS inbox_state text NOT NULL DEFAULT 'needs_reply'
  CHECK (inbox_state IN ('needs_reply', 'waiting', 'finished'));

UPDATE public.streamer_contacts
SET inbox_state = 'finished'
WHERE status IN ('converted', 'not_interested', 'blocked');

CREATE INDEX IF NOT EXISTS streamer_contacts_inbox_state_idx
  ON public.streamer_contacts (inbox_state);
