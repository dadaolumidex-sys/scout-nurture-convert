DELETE FROM public.analytics_events WHERE user_id IS NULL;
DELETE FROM public.contact_messages WHERE user_id IS NULL;
DELETE FROM public.knowledge_entries WHERE user_id IS NULL;
DELETE FROM public.streamer_contacts WHERE user_id IS NULL;
DELETE FROM public.training_conversations WHERE user_id IS NULL;

ALTER TABLE public.analytics_events ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.contact_messages ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.knowledge_entries ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.streamer_contacts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE public.training_conversations ALTER COLUMN user_id SET NOT NULL;