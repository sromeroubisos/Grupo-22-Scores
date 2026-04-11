-- Clean up duplicate favorites created under multiple alias forms
-- (for example: fs-team-123, fs-123, 123) for the same user/entity family.

WITH normalized AS (
    SELECT
        f.id,
        f.user_id,
        CASE
            WHEN f.entity_type IN ('league', 'tournament') THEN 'competition'
            ELSE f.entity_type
        END AS entity_family,
        CASE
            WHEN f.entity_type = 'club' THEN lower(regexp_replace(f.entity_id, '^(fs-team-|fs-|ras-team-|espn-team-)', ''))
            WHEN f.entity_type IN ('league', 'tournament') THEN lower(regexp_replace(f.entity_id, '^(fs-|ras-league-|espn-league-)', ''))
            ELSE lower(f.entity_id)
        END AS canonical_entity_id,
        f.created_at
    FROM public.favorites f
),
ranked AS (
    SELECT
        n.id,
        row_number() OVER (
            PARTITION BY n.user_id, n.entity_family, n.canonical_entity_id
            ORDER BY n.created_at DESC, n.id DESC
        ) AS row_num
    FROM normalized n
)
DELETE FROM public.favorites f
USING ranked r
WHERE f.id = r.id
  AND r.row_num > 1;
