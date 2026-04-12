-- Collapse duplicate favorites that point to the same club/tournament through
-- internal ids, external ids, or provider-prefixed aliases.

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
            OR t.external_id = regexp_replace(
                f.entity_id,
                '^(fs-|ras-league-|espn-league-)',
                '',
                'i'
            )
       )
    LEFT JOIN public.clubs c
        ON f.entity_type IN ('club', 'team')
       AND (
            c.id = f.entity_id
            OR c.external_id = f.entity_id
            OR c.external_id = regexp_replace(
                f.entity_id,
                '^(fs-team-|fs-|ras-team-|espn-team-)',
                '',
                'i'
            )
       )
),
ranked AS (
    SELECT
        id,
        row_number() OVER (
            PARTITION BY user_id, entity_family, canonical_entity_id
            ORDER BY created_at DESC, id DESC
        ) AS row_num
    FROM favorite_identity
)
DELETE FROM public.favorites f
USING ranked r
WHERE f.id = r.id
  AND r.row_num > 1;
