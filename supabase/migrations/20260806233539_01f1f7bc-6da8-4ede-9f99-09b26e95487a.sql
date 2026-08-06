ALTER TABLE public.streamer_contacts
  ADD COLUMN IF NOT EXISTS discord_channel_id text,
  ADD COLUMN IF NOT EXISTS discord_user_id text,
  ADD COLUMN IF NOT EXISTS discord_sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discord_last_message_id text,
  ADD COLUMN IF NOT EXISTS discord_persona text NOT NULL DEFAULT 'friend',
  ADD COLUMN IF NOT EXISTS discord_last_synced_at timestamptz;

ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS discord_message_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app';

CREATE UNIQUE INDEX IF NOT EXISTS contact_messages_discord_unique
  ON public.contact_messages (contact_id, discord_message_id)
  WHERE discord_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS streamer_contacts_discord_sync_idx
  ON public.streamer_contacts (discord_sync_enabled)
  WHERE discord_sync_enabled = true;