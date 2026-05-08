ALTER TABLE public.saved_searches ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::text[];
CREATE INDEX IF NOT EXISTS idx_saved_searches_tags ON public.saved_searches USING GIN(tags);