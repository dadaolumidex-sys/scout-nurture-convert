
CREATE TABLE public.streamer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  platform text NOT NULL DEFAULT 'twitch',
  channel_url text,
  display_name text,
  description text,
  profile_image_url text,
  broadcaster_type text,
  created_at_twitch timestamptz,
  followers_estimate text,
  avg_viewers text,
  streaming_frequency text,
  growth_stage text,
  strengths text[] DEFAULT '{}',
  weaknesses text[] DEFAULT '{}',
  opportunities text[] DEFAULT '{}',
  promotion_potential text,
  friend_message text,
  promoter_message text,
  is_live boolean DEFAULT false,
  live_title text,
  live_game text,
  live_viewers integer,
  status text DEFAULT 'active',
  last_message text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.streamer_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to streamer_contacts"
  ON public.streamer_contacts
  FOR ALL
  USING (true)
  WITH CHECK (true);
