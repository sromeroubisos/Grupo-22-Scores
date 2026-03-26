-- ============================================
-- TEAM LABELS BY STANDINGS POSITION
-- Link table labels to standings positions,
-- not to clubs.
-- ============================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'team_labels'
      AND column_name = 'position'
  ) THEN
    ALTER TABLE public.team_labels
      ADD COLUMN position INTEGER;
  END IF;
END
$$;

ALTER TABLE public.team_labels
  ALTER COLUMN club_id DROP NOT NULL;

-- Drop the legacy unique constraint by definition because Postgres may
-- truncate its generated name differently across environments.
DO $$
DECLARE
  legacy_constraint_name TEXT;
BEGIN
  FOR legacy_constraint_name IN
    SELECT con.conname
    FROM pg_constraint AS con
    JOIN pg_class AS rel
      ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp
      ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'team_labels'
      AND con.contype = 'u'
      AND pg_get_constraintdef(con.oid) IN (
        'UNIQUE NULLS NOT DISTINCT (label_id, club_id, tournament_id, phase_id, group_id)',
        'UNIQUE (label_id, club_id, tournament_id, phase_id, group_id)'
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.team_labels DROP CONSTRAINT %I',
      legacy_constraint_name
    );
  END LOOP;
END
$$;

-- Backfill the standings position for existing label assignments.
UPDATE public.team_labels AS tl
SET position = ts.position
FROM public.tournament_standings AS ts
WHERE tl.position IS NULL
  AND tl.club_id IS NOT NULL
  AND tl.tournament_id IS NOT DISTINCT FROM ts.tournament_id
  AND tl.phase_id IS NOT DISTINCT FROM ts.phase_id
  AND tl.group_id IS NOT DISTINCT FROM ts.group_id
  AND tl.club_id = ts.club_id;

-- Once a position is resolved, the assignment becomes position-based.
UPDATE public.team_labels
SET club_id = NULL
WHERE position IS NOT NULL
  AND club_id IS NOT NULL;

WITH ranked_duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY label_id, position, tournament_id, phase_id, group_id
      ORDER BY created_at NULLS LAST, id
    ) AS duplicate_rank
  FROM public.team_labels
  WHERE position IS NOT NULL
)
DELETE FROM public.team_labels AS tl
USING ranked_duplicates
WHERE tl.id = ranked_duplicates.id
  AND ranked_duplicates.duplicate_rank > 1;

DROP INDEX IF EXISTS public.idx_team_labels_label_position_context;
CREATE UNIQUE INDEX idx_team_labels_label_position_context
  ON public.team_labels (
    label_id,
    position,
    COALESCE(tournament_id::text, ''),
    COALESCE(phase_id::text, ''),
    COALESCE(group_id::text, '')
  )
  WHERE position IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_team_labels_position_context
  ON public.team_labels (tournament_id, phase_id, group_id, position);

ALTER TABLE public.team_labels
  DROP CONSTRAINT IF EXISTS team_labels_position_positive;

ALTER TABLE public.team_labels
  ADD CONSTRAINT team_labels_position_positive
  CHECK (position IS NULL OR position > 0);

ALTER TABLE public.team_labels
  DROP CONSTRAINT IF EXISTS team_labels_position_or_club_required;

ALTER TABLE public.team_labels
  ADD CONSTRAINT team_labels_position_or_club_required
  CHECK (position IS NOT NULL OR club_id IS NOT NULL);
