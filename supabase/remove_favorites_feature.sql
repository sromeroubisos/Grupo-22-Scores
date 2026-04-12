BEGIN;

-- Disable and remove the favorites/follows feature storage.
-- Keep user_favorite_sports and sports onboarding intact.

DROP FUNCTION IF EXISTS public.get_my_favorites_enriched();
DROP FUNCTION IF EXISTS public.get_my_favorites_enriched_v2(INT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.get_user_favorites(TEXT);
DROP FUNCTION IF EXISTS public.is_favorited(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.toggle_favorite(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.toggle_tournament_follow(UUID);

DROP TABLE IF EXISTS public.user_favorite_leagues;
DROP TABLE IF EXISTS public.tournament_followers;
DROP TABLE IF EXISTS public.favorites;

COMMIT;
