REVOKE ALL ON FUNCTION public.create_profile_for_new_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_profile_for_new_user() FROM anon;
REVOKE ALL ON FUNCTION public.create_profile_for_new_user() FROM authenticated;