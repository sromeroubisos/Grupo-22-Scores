ALTER TABLE public.news
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'news'
          AND column_name = 'created_at'
    ) THEN
        EXECUTE $sql$
            UPDATE public.news
            SET updated_at = COALESCE(updated_at, created_at, NOW())
            WHERE updated_at IS NULL
        $sql$;
    ELSE
        EXECUTE $sql$
            UPDATE public.news
            SET updated_at = COALESCE(updated_at, NOW())
            WHERE updated_at IS NULL
        $sql$;
    END IF;
END $$;

ALTER TABLE public.news
    ALTER COLUMN updated_at SET DEFAULT NOW();

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'news'
          AND column_name = 'updated_at'
    ) THEN
        EXECUTE 'ALTER TABLE public.news ALTER COLUMN updated_at SET NOT NULL';
    END IF;
END $$;

DO $$
BEGIN
    IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS update_news_updated_at ON public.news;
        CREATE TRIGGER update_news_updated_at
            BEFORE UPDATE ON public.news
            FOR EACH ROW
            EXECUTE FUNCTION public.update_updated_at_column();
    ELSIF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
        DROP TRIGGER IF EXISTS update_news_updated_at ON public.news;
        CREATE TRIGGER update_news_updated_at
            BEFORE UPDATE ON public.news
            FOR EACH ROW
            EXECUTE FUNCTION public.set_updated_at();
    END IF;
END $$;
