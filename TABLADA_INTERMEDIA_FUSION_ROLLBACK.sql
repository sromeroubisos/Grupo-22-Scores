-- Revierte la fusión de las dos Intermedia de La Tablada.
-- Recrea club-la-tablada-intermedia y le devuelve sus partidos.
BEGIN;

INSERT INTO public.clubs (id, union_id, name, short_name, city, region, country, logo_url, primary_color, slug, is_visible, created_at, entity_type, updated_at, sport, category, sport_id, status, visibility, external_id, categories, created_by_club_id, created_by_user_id, claim_status)
VALUES ('club-la-tablada-intermedia', '0c515ac1-af49-4699-b3c5-7273bc424357', 'Club La Tablada Intermedia', 'Intermedia', NULL, NULL, 'ARG', NULL, NULL, 'club-la-tablada-intermedia', 'true', '2026-08-24T13:35:14.263068+00:00', 'club', '2026-08-24T13:35:14.263068+00:00', 'rugby', NULL, 'rugby', 'active', 'visible', NULL, '[]', 'tala-rugby-club', '981ea9f8-015c-4b30-994a-f3d4b0430a54', 'proposed')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.club_derivatives (base_club_id, derived_club_id, derivative_type) VALUES ('club-la-tablada', 'club-la-tablada-intermedia', 'divisions') ON CONFLICT DO NOTHING;

UPDATE public.matches SET away_club_id = 'club-la-tablada-intermedia' WHERE id = '8a3241b0-10ab-41a9-90cf-d863351bf49c';

COMMIT;
