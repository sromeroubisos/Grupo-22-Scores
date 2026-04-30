BEGIN;

-- Some Club Admin-created matches were inserted before the match review
-- columns existed. The original review migration backfilled legacy rows as
-- approved/visible, so these rows can leak into the public feed. They carry
-- the Club Admin note signature but have no creator/reviewer metadata.
UPDATE public.matches
SET
    is_visible = FALSE,
    review_status = 'pending',
    review_notes = COALESCE(
        NULLIF(review_notes, ''),
        'Detectado como partido legacy de Club Admin. Pendiente de aprobacion de Super Admin.'
    )
WHERE COALESCE(is_visible, TRUE) = TRUE
  AND COALESCE(review_status, 'approved') = 'approved'
  AND created_by_user_id IS NULL
  AND created_by_club_id IS NULL
  AND reviewed_at IS NULL
  AND created_at >= TIMESTAMPTZ '2026-04-28 00:00:00+00'
  AND (
      notes ILIKE '%Rival externo:%'
      OR notes ILIKE '%Tipo:%'
  );

DELETE FROM public.matches_feed_cache
WHERE cache_key LIKE 'matches-response:v5:%';

NOTIFY pgrst, 'reload schema';

COMMIT;
