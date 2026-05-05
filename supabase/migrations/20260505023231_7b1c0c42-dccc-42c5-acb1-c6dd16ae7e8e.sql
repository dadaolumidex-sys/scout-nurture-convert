UPDATE storage.buckets
SET public = false
WHERE id = 'chat-images';

DROP POLICY IF EXISTS "Allow public reads from chat-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to chat-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow public deletes from chat-images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own chat images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own chat images" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own chat images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own chat images" ON storage.objects;

CREATE POLICY "Users can view own chat images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload own chat images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update own chat images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'chat-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete own chat images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);