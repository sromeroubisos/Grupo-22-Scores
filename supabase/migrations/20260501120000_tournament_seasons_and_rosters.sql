-- ============================================================
-- Tournament seasons and season-scoped rosters
-- ============================================================
-- This migration is intentionally additive. Existing tournament_id based
-- screens keep working, while new code can scope mutable sporting data by
-- tournament_seasons.id.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1. Permanent tournament editions
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tournament_seasons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    legacy_tournament_id UUID NULL REFERENCES public.tournaments(id) ON DELETE SET NULL,
    season_code TEXT NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT,
    slug TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'completed', 'archived')),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    start_date DATE,
    end_date DATE,
    format TEXT,
    ruleset JSONB NOT NULL DEFAULT '{}'::jsonb,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    champion_club_id TEXT NULL REFERENCES public.clubs(id) ON DELETE SET NULL,
    champion_team_id UUID NULL,
    copied_from_season_id UUID NULL REFERENCES public.tournament_seasons(id) ON DELETE SET NULL,
    created_by_user_id UUID NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT tournament_seasons_dates_check CHECK (
        start_date IS NULL OR end_date IS NULL OR start_date <= end_date
    ),
    CONSTRAINT tournament_seasons_unique_code UNIQUE (tournament_id, season_code)
);

DO $$
BEGIN
    IF to_regclass('public.club_teams') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'tournament_seasons_champion_team_id_fkey'
              AND conrelid = 'public.tournament_seasons'::regclass
       ) THEN
        ALTER TABLE public.tournament_seasons
            ADD CONSTRAINT tournament_seasons_champion_team_id_fkey
            FOREIGN KEY (champion_team_id)
            REFERENCES public.club_teams(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS tournament_seasons_tournament_idx
    ON public.tournament_seasons(tournament_id, status, season_code DESC);

CREATE INDEX IF NOT EXISTS tournament_seasons_legacy_tournament_idx
    ON public.tournament_seasons(legacy_tournament_id)
    WHERE legacy_tournament_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tournament_seasons_one_active_idx
    ON public.tournament_seasons(tournament_id)
    WHERE is_active = TRUE;

ALTER TABLE public.tournaments
    ADD COLUMN IF NOT EXISTS current_season_id UUID NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tournaments_current_season_id_fkey'
          AND conrelid = 'public.tournaments'::regclass
    ) THEN
        ALTER TABLE public.tournaments
            ADD CONSTRAINT tournaments_current_season_id_fkey
            FOREIGN KEY (current_season_id)
            REFERENCES public.tournament_seasons(id)
            ON DELETE SET NULL;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 2. Team/club participation in a season
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.team_season_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES public.tournament_seasons(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    team_id UUID NULL,
    source_participant_id UUID NULL,
    group_id UUID NULL,
    zone TEXT,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'pending', 'withdrawn', 'disqualified', 'archived')),
    seed INTEGER,
    notes TEXT,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF to_regclass('public.club_teams') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'team_season_entries_team_id_fkey'
              AND conrelid = 'public.team_season_entries'::regclass
       ) THEN
        ALTER TABLE public.team_season_entries
            ADD CONSTRAINT team_season_entries_team_id_fkey
            FOREIGN KEY (team_id)
            REFERENCES public.club_teams(id)
            ON DELETE SET NULL;
    END IF;

    IF to_regclass('public.tournament_participants') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'team_season_entries_source_participant_id_fkey'
              AND conrelid = 'public.team_season_entries'::regclass
       ) THEN
        ALTER TABLE public.team_season_entries
            ADD CONSTRAINT team_season_entries_source_participant_id_fkey
            FOREIGN KEY (source_participant_id)
            REFERENCES public.tournament_participants(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS team_season_entries_season_idx
    ON public.team_season_entries(season_id, status, seed);

CREATE INDEX IF NOT EXISTS team_season_entries_tournament_idx
    ON public.team_season_entries(tournament_id);

CREATE INDEX IF NOT EXISTS team_season_entries_club_idx
    ON public.team_season_entries(club_id);

CREATE INDEX IF NOT EXISTS team_season_entries_team_idx
    ON public.team_season_entries(team_id)
    WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS team_season_entries_unique_team
    ON public.team_season_entries(season_id, team_id)
    WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS team_season_entries_unique_club_without_team
    ON public.team_season_entries(season_id, club_id)
    WHERE team_id IS NULL;

-- ------------------------------------------------------------
-- 3. Season rosters and player registrations
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.season_rosters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES public.tournament_seasons(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    team_season_entry_id UUID NULL REFERENCES public.team_season_entries(id) ON DELETE SET NULL,
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    team_id UUID NULL,
    name TEXT NOT NULL,
    roster_type TEXT NOT NULL DEFAULT 'official',
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'locked', 'archived')),
    copied_from_roster_id UUID NULL REFERENCES public.season_rosters(id) ON DELETE SET NULL,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF to_regclass('public.club_teams') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'season_rosters_team_id_fkey'
              AND conrelid = 'public.season_rosters'::regclass
       ) THEN
        ALTER TABLE public.season_rosters
            ADD CONSTRAINT season_rosters_team_id_fkey
            FOREIGN KEY (team_id)
            REFERENCES public.club_teams(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS season_rosters_season_idx
    ON public.season_rosters(season_id, status);

CREATE INDEX IF NOT EXISTS season_rosters_club_idx
    ON public.season_rosters(club_id);

CREATE INDEX IF NOT EXISTS season_rosters_team_idx
    ON public.season_rosters(team_id)
    WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS season_rosters_unique_team_type
    ON public.season_rosters(season_id, team_id, roster_type)
    WHERE team_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS season_rosters_unique_club_type_without_team
    ON public.season_rosters(season_id, club_id, roster_type)
    WHERE team_id IS NULL;

CREATE TABLE IF NOT EXISTS public.roster_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roster_id UUID NOT NULL REFERENCES public.season_rosters(id) ON DELETE CASCADE,
    season_id UUID NOT NULL REFERENCES public.tournament_seasons(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    team_id UUID NULL,
    player_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
    left_at DATE,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'transferred', 'released', 'suspended', 'guest', 'historical', 'injured')),
    jersey_number INTEGER,
    position TEXT,
    role TEXT,
    notes TEXT,
    eligibility JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_continuity BOOLEAN NOT NULL DEFAULT FALSE,
    copied_from_membership_id UUID NULL REFERENCES public.roster_memberships(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT roster_memberships_dates_check CHECK (
        left_at IS NULL OR joined_at <= left_at
    ),
    CONSTRAINT roster_memberships_unique_player_in_roster UNIQUE (roster_id, player_id)
);

DO $$
BEGIN
    IF to_regclass('public.club_teams') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'roster_memberships_team_id_fkey'
              AND conrelid = 'public.roster_memberships'::regclass
       ) THEN
        ALTER TABLE public.roster_memberships
            ADD CONSTRAINT roster_memberships_team_id_fkey
            FOREIGN KEY (team_id)
            REFERENCES public.club_teams(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS roster_memberships_roster_idx
    ON public.roster_memberships(roster_id, status);

CREATE INDEX IF NOT EXISTS roster_memberships_player_idx
    ON public.roster_memberships(player_id, season_id);

CREATE INDEX IF NOT EXISTS roster_memberships_season_club_idx
    ON public.roster_memberships(season_id, club_id);

CREATE INDEX IF NOT EXISTS roster_memberships_season_team_idx
    ON public.roster_memberships(season_id, team_id)
    WHERE team_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4. Season context on existing sporting data
-- ------------------------------------------------------------

ALTER TABLE public.tournament_phases
    ADD COLUMN IF NOT EXISTS season_id UUID NULL REFERENCES public.tournament_seasons(id) ON DELETE SET NULL;

ALTER TABLE public.tournament_groups
    ADD COLUMN IF NOT EXISTS season_id UUID NULL REFERENCES public.tournament_seasons(id) ON DELETE SET NULL;

ALTER TABLE public.tournament_rounds
    ADD COLUMN IF NOT EXISTS season_id UUID NULL REFERENCES public.tournament_seasons(id) ON DELETE SET NULL;

ALTER TABLE public.tournament_participants
    ADD COLUMN IF NOT EXISTS season_id UUID NULL REFERENCES public.tournament_seasons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS team_id UUID NULL,
    ADD COLUMN IF NOT EXISTS season_entry_id UUID NULL REFERENCES public.team_season_entries(id) ON DELETE SET NULL;

ALTER TABLE public.tournament_participants
    DROP CONSTRAINT IF EXISTS tournament_participants_tournament_id_club_id_key,
    DROP CONSTRAINT IF EXISTS tournament_participants_unique_entry;

ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS season_id UUID NULL REFERENCES public.tournament_seasons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS home_team_id UUID NULL,
    ADD COLUMN IF NOT EXISTS away_team_id UUID NULL,
    ADD COLUMN IF NOT EXISTS home_season_entry_id UUID NULL REFERENCES public.team_season_entries(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS away_season_entry_id UUID NULL REFERENCES public.team_season_entries(id) ON DELETE SET NULL;

ALTER TABLE public.tournament_standings
    ADD COLUMN IF NOT EXISTS season_id UUID NULL REFERENCES public.tournament_seasons(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS team_id UUID NULL,
    ADD COLUMN IF NOT EXISTS season_entry_id UUID NULL REFERENCES public.team_season_entries(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF to_regclass('public.club_teams') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'tournament_participants_team_id_fkey'
              AND conrelid = 'public.tournament_participants'::regclass
        ) THEN
            ALTER TABLE public.tournament_participants
                ADD CONSTRAINT tournament_participants_team_id_fkey
                FOREIGN KEY (team_id)
                REFERENCES public.club_teams(id)
                ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'matches_home_team_id_fkey'
              AND conrelid = 'public.matches'::regclass
        ) THEN
            ALTER TABLE public.matches
                ADD CONSTRAINT matches_home_team_id_fkey
                FOREIGN KEY (home_team_id)
                REFERENCES public.club_teams(id)
                ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'matches_away_team_id_fkey'
              AND conrelid = 'public.matches'::regclass
        ) THEN
            ALTER TABLE public.matches
                ADD CONSTRAINT matches_away_team_id_fkey
                FOREIGN KEY (away_team_id)
                REFERENCES public.club_teams(id)
                ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'tournament_standings_team_id_fkey'
              AND conrelid = 'public.tournament_standings'::regclass
        ) THEN
            ALTER TABLE public.tournament_standings
                ADD CONSTRAINT tournament_standings_team_id_fkey
                FOREIGN KEY (team_id)
                REFERENCES public.club_teams(id)
                ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.match_events') IS NOT NULL THEN
        ALTER TABLE public.match_events
            ADD COLUMN IF NOT EXISTS season_id UUID NULL REFERENCES public.tournament_seasons(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS team_id UUID NULL,
            ADD COLUMN IF NOT EXISTS roster_id UUID NULL REFERENCES public.season_rosters(id) ON DELETE SET NULL,
            ADD COLUMN IF NOT EXISTS roster_membership_id UUID NULL REFERENCES public.roster_memberships(id) ON DELETE SET NULL;

        IF to_regclass('public.club_teams') IS NOT NULL
           AND NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'match_events_team_id_fkey'
                  AND conrelid = 'public.match_events'::regclass
           ) THEN
            ALTER TABLE public.match_events
                ADD CONSTRAINT match_events_team_id_fkey
                FOREIGN KEY (team_id)
                REFERENCES public.club_teams(id)
                ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.discipline_incidents') IS NOT NULL THEN
        ALTER TABLE public.discipline_incidents
            ADD COLUMN IF NOT EXISTS season_id UUID NULL REFERENCES public.tournament_seasons(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS tournament_phases_season_idx
    ON public.tournament_phases(season_id);

CREATE INDEX IF NOT EXISTS tournament_groups_season_idx
    ON public.tournament_groups(season_id);

CREATE INDEX IF NOT EXISTS tournament_rounds_season_idx
    ON public.tournament_rounds(season_id);

CREATE INDEX IF NOT EXISTS tournament_participants_season_idx
    ON public.tournament_participants(season_id);

CREATE UNIQUE INDEX IF NOT EXISTS tournament_participants_unique_season_team
    ON public.tournament_participants(season_id, team_id)
    WHERE season_id IS NOT NULL AND team_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tournament_participants_unique_season_club_without_team
    ON public.tournament_participants(season_id, club_id)
    WHERE season_id IS NOT NULL AND team_id IS NULL AND club_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS matches_season_idx
    ON public.matches(season_id, date_time);

CREATE INDEX IF NOT EXISTS tournament_standings_season_idx
    ON public.tournament_standings(season_id, phase_id, group_id, position);

DO $$
BEGIN
    IF to_regclass('public.match_events') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS match_events_season_idx
            ON public.match_events(season_id, match_id);
        CREATE INDEX IF NOT EXISTS match_events_roster_membership_idx
            ON public.match_events(roster_membership_id)
            WHERE roster_membership_id IS NOT NULL;
    END IF;

    IF to_regclass('public.discipline_incidents') IS NOT NULL THEN
        CREATE INDEX IF NOT EXISTS discipline_incidents_season_idx
            ON public.discipline_incidents(season_id, club_id);
    END IF;
END $$;

-- ------------------------------------------------------------
-- 5. Base stats tables. Historical stats are aggregation outputs;
-- raw season-scoped events and matches remain the source of truth.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.player_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES public.tournament_seasons(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
    club_id TEXT NULL REFERENCES public.clubs(id) ON DELETE SET NULL,
    team_id UUID NULL,
    roster_id UUID NULL REFERENCES public.season_rosters(id) ON DELETE SET NULL,
    roster_membership_id UUID NULL REFERENCES public.roster_memberships(id) ON DELETE SET NULL,
    scope TEXT NOT NULL DEFAULT 'season',
    matches_played INTEGER NOT NULL DEFAULT 0,
    stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.team_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NOT NULL REFERENCES public.tournament_seasons(id) ON DELETE CASCADE,
    tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    team_id UUID NULL,
    season_entry_id UUID NULL REFERENCES public.team_season_entries(id) ON DELETE SET NULL,
    scope TEXT NOT NULL DEFAULT 'season',
    matches_played INTEGER NOT NULL DEFAULT 0,
    stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.club_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id UUID NULL REFERENCES public.tournament_seasons(id) ON DELETE CASCADE,
    tournament_id UUID NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
    club_id TEXT NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
    scope TEXT NOT NULL DEFAULT 'season',
    matches_played INTEGER NOT NULL DEFAULT 0,
    stats JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
    IF to_regclass('public.club_teams') IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'player_stats_team_id_fkey'
              AND conrelid = 'public.player_stats'::regclass
        ) THEN
            ALTER TABLE public.player_stats
                ADD CONSTRAINT player_stats_team_id_fkey
                FOREIGN KEY (team_id)
                REFERENCES public.club_teams(id)
                ON DELETE SET NULL;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'team_stats_team_id_fkey'
              AND conrelid = 'public.team_stats'::regclass
        ) THEN
            ALTER TABLE public.team_stats
                ADD CONSTRAINT team_stats_team_id_fkey
                FOREIGN KEY (team_id)
                REFERENCES public.club_teams(id)
                ON DELETE SET NULL;
        END IF;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS player_stats_season_player_idx
    ON public.player_stats(season_id, player_id);

CREATE INDEX IF NOT EXISTS player_stats_season_club_team_idx
    ON public.player_stats(season_id, club_id, team_id);

CREATE INDEX IF NOT EXISTS team_stats_season_team_idx
    ON public.team_stats(season_id, team_id);

CREATE INDEX IF NOT EXISTS team_stats_season_club_idx
    ON public.team_stats(season_id, club_id);

CREATE INDEX IF NOT EXISTS club_stats_club_scope_idx
    ON public.club_stats(club_id, scope, tournament_id, season_id);

-- ------------------------------------------------------------
-- 6. Backfill current data into the new model
-- ------------------------------------------------------------

WITH source_tournaments AS (
    SELECT
        t.id,
        COALESCE(NULLIF(t.season_id, ''), EXTRACT(YEAR FROM COALESCE(t.created_at, NOW()))::TEXT) AS season_code,
        COALESCE(NULLIF(t.display_name, ''), t.name) AS display_name,
        t.name,
        t.slug,
        t.status,
        t.format,
        COALESCE(t.ruleset, '{}'::jsonb) AS ruleset,
        t.created_at,
        t.updated_at
    FROM public.tournaments t
)
INSERT INTO public.tournament_seasons (
    tournament_id,
    legacy_tournament_id,
    season_code,
    name,
    display_name,
    slug,
    status,
    is_active,
    format,
    ruleset,
    settings,
    created_at,
    updated_at
)
SELECT
    st.id,
    st.id,
    st.season_code,
    COALESCE(st.display_name, st.name),
    st.display_name,
    st.slug,
    CASE
        WHEN lower(COALESCE(st.status, '')) = 'draft' THEN 'draft'
        WHEN lower(COALESCE(st.status, '')) = 'archived' THEN 'archived'
        WHEN lower(COALESCE(st.status, '')) IN ('completed', 'finalizada', 'finished') THEN 'completed'
        ELSE 'active'
    END,
    CASE
        WHEN lower(COALESCE(st.status, '')) IN ('draft', 'archived', 'completed', 'finalizada', 'finished') THEN FALSE
        ELSE TRUE
    END,
    st.format,
    st.ruleset,
    jsonb_build_object('source', 'legacy_tournaments_backfill'),
    COALESCE(st.created_at, NOW()),
    COALESCE(st.updated_at, NOW())
FROM source_tournaments st
ON CONFLICT (tournament_id, season_code) DO NOTHING;

UPDATE public.tournaments t
SET current_season_id = picked.id
FROM (
    SELECT DISTINCT ON (ts.tournament_id)
        ts.tournament_id,
        ts.id
    FROM public.tournament_seasons ts
    ORDER BY ts.tournament_id, ts.is_active DESC, ts.season_code DESC, ts.created_at DESC
) picked
WHERE t.id = picked.tournament_id
  AND t.current_season_id IS NULL;

UPDATE public.tournament_phases p
SET season_id = COALESCE(p.season_id, t.current_season_id)
FROM public.tournaments t
WHERE p.tournament_id = t.id
  AND p.season_id IS NULL
  AND t.current_season_id IS NOT NULL;

UPDATE public.tournament_groups g
SET season_id = COALESCE(g.season_id, p.season_id)
FROM public.tournament_phases p
WHERE g.phase_id = p.id
  AND g.season_id IS NULL
  AND p.season_id IS NOT NULL;

UPDATE public.tournament_rounds r
SET season_id = COALESCE(r.season_id, p.season_id)
FROM public.tournament_phases p
WHERE r.phase_id = p.id
  AND r.season_id IS NULL
  AND p.season_id IS NOT NULL;

UPDATE public.tournament_participants tp
SET season_id = COALESCE(tp.season_id, t.current_season_id)
FROM public.tournaments t
WHERE tp.tournament_id = t.id
  AND tp.season_id IS NULL
  AND t.current_season_id IS NOT NULL;

UPDATE public.matches m
SET season_id = COALESCE(m.season_id, t.current_season_id)
FROM public.tournaments t
WHERE m.tournament_id = t.id
  AND m.season_id IS NULL
  AND t.current_season_id IS NOT NULL;

UPDATE public.tournament_standings s
SET season_id = COALESCE(s.season_id, t.current_season_id)
FROM public.tournaments t
WHERE s.tournament_id = t.id
  AND s.season_id IS NULL
  AND t.current_season_id IS NOT NULL;

DO $$
BEGIN
    IF to_regclass('public.match_events') IS NOT NULL THEN
        UPDATE public.match_events me
        SET season_id = COALESCE(me.season_id, m.season_id)
        FROM public.matches m
        WHERE me.match_id = m.id
          AND me.season_id IS NULL
          AND m.season_id IS NOT NULL;
    END IF;
END $$;

DO $$
BEGIN
    IF to_regclass('public.discipline_incidents') IS NOT NULL THEN
        UPDATE public.discipline_incidents di
        SET season_id = COALESCE(di.season_id, t.current_season_id)
        FROM public.tournaments t
        WHERE di.tournament_id = t.id
          AND di.season_id IS NULL
          AND t.current_season_id IS NOT NULL;
    END IF;
END $$;

INSERT INTO public.team_season_entries (
    season_id,
    tournament_id,
    club_id,
    team_id,
    source_participant_id,
    group_id,
    status,
    seed,
    notes,
    settings,
    created_at,
    updated_at
)
SELECT
    tp.season_id,
    tp.tournament_id,
    tp.club_id,
    tp.team_id,
    tp.id,
    tp.group_id,
    COALESCE(tp.status, 'active'),
    tp.seed,
    tp.notes,
    jsonb_build_object('source', 'tournament_participants_backfill', 'participant_type', tp.type),
    COALESCE(tp.created_at, NOW()),
    COALESCE(tp.updated_at, NOW())
FROM public.tournament_participants tp
WHERE tp.season_id IS NOT NULL
  AND tp.club_id IS NOT NULL
ON CONFLICT DO NOTHING;

UPDATE public.tournament_participants tp
SET season_entry_id = tse.id
FROM public.team_season_entries tse
WHERE tp.season_entry_id IS NULL
  AND tp.id = tse.source_participant_id;

INSERT INTO public.season_rosters (
    season_id,
    tournament_id,
    team_season_entry_id,
    club_id,
    team_id,
    name,
    roster_type,
    status,
    settings,
    created_at,
    updated_at
)
SELECT
    tse.season_id,
    tse.tournament_id,
    tse.id,
    tse.club_id,
    tse.team_id,
    COALESCE(ct.name, c.name, 'Plantel') || ' - ' || ts.season_code,
    'official',
    CASE WHEN ts.status IN ('active', 'completed', 'archived') THEN 'active' ELSE 'draft' END,
    jsonb_build_object('source', 'team_season_entries_backfill'),
    NOW(),
    NOW()
FROM public.team_season_entries tse
JOIN public.tournament_seasons ts ON ts.id = tse.season_id
JOIN public.clubs c ON c.id = tse.club_id
LEFT JOIN public.club_teams ct ON ct.id = tse.team_id
ON CONFLICT DO NOTHING;

DO $$
BEGIN
    IF to_regclass('public.squad_members') IS NOT NULL
       AND to_regclass('public.club_divisions') IS NOT NULL THEN
        INSERT INTO public.roster_memberships (
            roster_id,
            season_id,
            tournament_id,
            club_id,
            team_id,
            player_id,
            joined_at,
            status,
            jersey_number,
            position,
            role,
            notes,
            eligibility,
            created_at,
            updated_at
        )
        SELECT DISTINCT ON (sr.id, sm.person_id)
            sr.id,
            sr.season_id,
            sr.tournament_id,
            sr.club_id,
            sr.team_id,
            sm.person_id,
            COALESCE(sm.created_at::date, CURRENT_DATE),
            CASE
                WHEN sm.status = 'baja' THEN 'released'
                WHEN sm.status = 'suspendido' THEN 'suspended'
                WHEN sm.status = 'lesionado' THEN 'injured'
                ELSE 'active'
            END,
            sm.jersey_number,
            sm.position,
            sm.role,
            sm.notes,
            jsonb_build_object('source', 'legacy_squad_members', 'legacy_division_id', sm.division_id),
            COALESCE(sm.created_at, NOW()),
            COALESCE(sm.updated_at, NOW())
        FROM public.season_rosters sr
        JOIN public.club_divisions d ON d.club_id = sr.club_id
        JOIN public.squad_members sm ON sm.division_id = d.id
        ON CONFLICT (roster_id, player_id) DO NOTHING;
    END IF;
END $$;

-- ------------------------------------------------------------
-- 7. RLS and updated_at triggers
-- ------------------------------------------------------------

DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'tournament_seasons',
        'team_season_entries',
        'season_rosters',
        'roster_memberships',
        'player_stats',
        'team_stats',
        'club_stats'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_public_read', table_name);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT USING (true)',
            table_name || '_public_read',
            table_name
        );

        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', table_name || '_admin_manage', table_name);
        IF to_regprocedure('public.authorize_admin()') IS NOT NULL THEN
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.authorize_admin()) WITH CHECK (public.authorize_admin())',
                table_name || '_admin_manage',
                table_name
            );
        ELSIF to_regprocedure('public.is_admin()') IS NOT NULL THEN
            EXECUTE format(
                'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
                table_name || '_admin_manage',
                table_name
            );
        END IF;

        IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', table_name || '_updated_at', table_name);
            EXECUTE format(
                'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
                table_name || '_updated_at',
                table_name
            );
        END IF;
    END LOOP;
END $$;

COMMENT ON TABLE public.tournament_seasons IS 'Season/edition of a permanent tournament. Variable sporting data should point here.';
COMMENT ON TABLE public.team_season_entries IS 'Participation of a club/team in a tournament season.';
COMMENT ON TABLE public.season_rosters IS 'Roster for a club/team inside a specific tournament season.';
COMMENT ON TABLE public.roster_memberships IS 'Player registration in a season roster. Allows the same player in multiple rosters; unique only within one roster.';
COMMENT ON COLUMN public.people.club_id IS 'Current/default club only. Historical affiliation is derived from roster_memberships and legacy role tables.';

NOTIFY pgrst, 'reload schema';

COMMIT;
