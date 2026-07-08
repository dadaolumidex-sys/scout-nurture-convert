ALTER TABLE public.user_memory
ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.ai_conversations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_user_memory_user_conversation_created
ON public.user_memory (user_id, conversation_id, created_at DESC);