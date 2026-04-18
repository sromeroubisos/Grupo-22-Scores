CREATE OR REPLACE FUNCTION public.is_super_admin_exact(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.users
        WHERE id = p_user_id
          AND role = 'super_admin'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_super_admin_exact(UUID) TO anon, authenticated, service_role;

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read News" ON public.news;
CREATE POLICY "Public Read News"
ON public.news
FOR SELECT
USING (status = 'published');

DROP POLICY IF EXISTS "Super Admin News" ON public.news;
DROP POLICY IF EXISTS "news_super_admin_manage" ON public.news;
CREATE POLICY "news_super_admin_manage"
ON public.news
FOR ALL
TO authenticated
USING (public.is_super_admin_exact())
WITH CHECK (public.is_super_admin_exact());

DROP POLICY IF EXISTS "news_auth_upload" ON storage.objects;
DROP POLICY IF EXISTS "news_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "news_auth_delete" ON storage.objects;
DROP POLICY IF EXISTS "news_super_admin_upload" ON storage.objects;
DROP POLICY IF EXISTS "news_super_admin_update" ON storage.objects;
DROP POLICY IF EXISTS "news_super_admin_delete" ON storage.objects;

CREATE POLICY "news_super_admin_upload"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
    bucket_id = 'news'
    AND public.is_super_admin_exact()
);

CREATE POLICY "news_super_admin_update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
    bucket_id = 'news'
    AND public.is_super_admin_exact()
)
WITH CHECK (
    bucket_id = 'news'
    AND public.is_super_admin_exact()
);

CREATE POLICY "news_super_admin_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
    bucket_id = 'news'
    AND public.is_super_admin_exact()
);
