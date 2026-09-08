CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Only admins can read database export files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id IN ('database_export_17_08_26', 'database_export_18_08_26', 'database_export_22_08_26')
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Only admins can add database export files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('database_export_17_08_26', 'database_export_18_08_26', 'database_export_22_08_26')
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Only admins can change database export files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('database_export_17_08_26', 'database_export_18_08_26', 'database_export_22_08_26')
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  bucket_id IN ('database_export_17_08_26', 'database_export_18_08_26', 'database_export_22_08_26')
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Only admins can delete database export files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('database_export_17_08_26', 'database_export_18_08_26', 'database_export_22_08_26')
  AND public.has_role(auth.uid(), 'admin')
);