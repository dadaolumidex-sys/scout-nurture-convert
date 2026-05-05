DROP TRIGGER IF EXISTS create_profile_after_signup ON auth.users;
DROP FUNCTION IF EXISTS public.create_profile_for_new_user();