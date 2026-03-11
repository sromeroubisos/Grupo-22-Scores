DO $$
BEGIN
    INSERT INTO storage.buckets (id, name, public) 
    VALUES ('news', 'news', true)
    ON CONFLICT (id) DO NOTHING;
END $$;

DROP POLICY IF EXISTS "news_public_access" ON storage.objects;
DROP POLICY IF EXISTS "news_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "news_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "news_auth_delete" ON storage.objects;

CREATE POLICY "news_public_access" ON storage.objects FOR SELECT USING (bucket_id = 'news');
CREATE POLICY "news_auth_upload" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'news');
CREATE POLICY "news_auth_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'news');
CREATE POLICY "news_auth_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'news');
