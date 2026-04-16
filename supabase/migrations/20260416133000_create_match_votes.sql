CREATE TABLE IF NOT EXISTS public.match_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    match_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    choice TEXT NOT NULL CHECK (choice IN ('home', 'away')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT match_votes_unique_match_user UNIQUE (match_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_match_votes_match_id
    ON public.match_votes(match_id);

CREATE INDEX IF NOT EXISTS idx_match_votes_user_id
    ON public.match_votes(user_id);

DROP TRIGGER IF EXISTS trg_match_votes_updated_at ON public.match_votes;
CREATE TRIGGER trg_match_votes_updated_at
    BEFORE UPDATE ON public.match_votes
    FOR EACH ROW
    EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.match_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_match_votes" ON public.match_votes;
CREATE POLICY "public_read_match_votes"
    ON public.match_votes
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "users_insert_own_match_votes" ON public.match_votes;
CREATE POLICY "users_insert_own_match_votes"
    ON public.match_votes
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_match_votes" ON public.match_votes;
CREATE POLICY "users_update_own_match_votes"
    ON public.match_votes
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_delete_own_match_votes" ON public.match_votes;
CREATE POLICY "users_delete_own_match_votes"
    ON public.match_votes
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
