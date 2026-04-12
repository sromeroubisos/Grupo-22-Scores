-- Harden favorites/unfollow flows for clubs and tournaments.
-- Goals:
-- 1. Remove historical duplicates left by alias ids.
-- 2. Ensure unique constraints exist on follower/preference tables.
-- 3. Keep unfollow operations idempotent and clean.

-- ---------------------------------------------------------------------------
-- favorites: collapse internal/external/provider-prefixed duplicates
-- ---------------------------------------------------------------------------
WITH favorite_identity AS (
    SELECT
        f.id,
        f.user_id,
        CASE
            WHEN f.entity_type IN ('league', 'tournament') THEN 'competition'
            WHEN f.entity_type IN ('club', 'team') THEN 'club'
            ELSE f.entity_type
        END AS entity_family,
        COALESCE(
            CASE
                WHEN f.entity_type IN ('league', 'tournament') THEN COALESCE(t.id::text, t.external_id)
                ELSE NULL
            END,
            CASE
                WHEN f.entity_type IN ('club', 'team') THEN COALESCE(c.id, c.external_id)
                ELSE NULL
            END,
            lower(
                CASE
                    WHEN f.entity_type IN ('league', 'tournament') THEN regexp_replace(
                        f.entity_id,
                        '^(fs-|ras-league-|espn-league-)',
                        '',
                        'i'
                    )
                    WHEN f.entity_type IN ('club', 'team') THEN regexp_replace(
                        f.entity_id,
                        '^(fs-team-|fs-|ras-team-|espn-team-)',
                        '',
                        'i'
                    )
                    ELSE f.entity_id
                END
            )
        ) AS canonical_entity_id,
        f.created_at
    FROM public.favorites f
    LEFT JOIN public.tournaments t
        ON f.entity_type IN ('league', 'tournament')
       AND (
            t.id::text = f.entity_id
            OR t.external_id = f.entity_id
            OR t.external_id = regexp_replace(f.entity_id, '^(fs-|ras-league-|espn-league-)', '', 'i')
       )
    LEFT JOIN public.clubs c
        ON f.entity_type IN ('club', 'team')
       AND (
            c.id = f.entity_id
            OR c.external_id = f.entity_id
            OR c.external_id = regexp_replace(f.entity_id, '^(fs-team-|fs-|ras-team-|espn-team-)', '', 'i')
       )
),
ranked_favorites AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY user_id, entity_family, canonical_entity_id
            ORDER BY created_at DESC, id DESC
        ) AS row_num
    FROM favorite_identity
)
DELETE FROM public.favorites f
USING ranked_favorites r
WHERE f.id = r.id
  AND r.row_num > 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'favorites_user_entity_unique'
          AND conrelid = 'public.favorites'::regclass
    ) THEN
        ALTER TABLE public.favorites
            ADD CONSTRAINT favorites_user_entity_unique
            UNIQUE (user_id, entity_type, entity_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_entity ON public.favorites (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_favorites_user_created ON public.favorites (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- user_favorite_leagues: collapse duplicates from aliases of the same tournament
-- ---------------------------------------------------------------------------
WITH league_identity AS (
    SELECT
        ufl.id,
        ufl.user_id,
        ufl.sort_order,
        ufl.created_at,
        COALESCE(
            t.id::text,
            t.external_id,
            lower(regexp_replace(ufl.league_id, '^(fs-|ras-league-|espn-league-)', '', 'i'))
        ) AS canonical_league_id
    FROM public.user_favorite_leagues ufl
    LEFT JOIN public.tournaments t
        ON t.id::text = ufl.league_id
        OR t.external_id = ufl.league_id
        OR t.external_id = regexp_replace(ufl.league_id, '^(fs-|ras-league-|espn-league-)', '', 'i')
),
ranked_leagues AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY user_id, canonical_league_id
            ORDER BY sort_order ASC, created_at DESC, id DESC
        ) AS row_num
    FROM league_identity
)
DELETE FROM public.user_favorite_leagues ufl
USING ranked_leagues r
WHERE ufl.id = r.id
  AND r.row_num > 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'user_favorite_leagues_user_id_league_id_key'
          AND conrelid = 'public.user_favorite_leagues'::regclass
    ) THEN
        ALTER TABLE public.user_favorite_leagues
            ADD CONSTRAINT user_favorite_leagues_user_id_league_id_key
            UNIQUE (user_id, league_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_favorite_leagues_user_id ON public.user_favorite_leagues (user_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_leagues_sport_id ON public.user_favorite_leagues (sport_id);
CREATE INDEX IF NOT EXISTS idx_user_favorite_leagues_user_sort ON public.user_favorite_leagues (user_id, sort_order ASC);

-- ---------------------------------------------------------------------------
-- tournament_followers: remove historical duplicates and enforce uniqueness
-- ---------------------------------------------------------------------------
WITH ranked_followers AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY user_id, tournament_id
            ORDER BY created_at DESC, id DESC
        ) AS row_num
    FROM public.tournament_followers
)
DELETE FROM public.tournament_followers tf
USING ranked_followers r
WHERE tf.id = r.id
  AND r.row_num > 1;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tournament_followers_user_id_tournament_id_key'
          AND conrelid = 'public.tournament_followers'::regclass
    ) THEN
        ALTER TABLE public.tournament_followers
            ADD CONSTRAINT tournament_followers_user_id_tournament_id_key
            UNIQUE (user_id, tournament_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tournament_followers_user_id ON public.tournament_followers (user_id);
CREATE INDEX IF NOT EXISTS idx_tournament_followers_tournament_id ON public.tournament_followers (tournament_id);
