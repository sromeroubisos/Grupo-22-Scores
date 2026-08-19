BEGIN;

-- Limpieza del feature LEGACY de favoritos (tabla `favorites` + RPCs enriched).
-- En la base activa estos objetos nunca existieron (los DROP IF EXISTS son no-op);
-- el script queda por si alguna base derivada de las migraciones del repo los tiene.
--
-- OJO: la versión anterior de este script también dropeaba `user_favorite_clubs`,
-- `user_favorite_leagues` y `tournament_followers`. Esas tablas son el sistema
-- VIVO de favoritos/seguidos (followingService) — no volver a incluirlas acá.
-- Tampoco se tocan `get_user_favorites` / `is_favorited` / `toggle_favorite` /
-- `toggle_tournament_follow`: figuran en database.types y pueden respaldar RPCs
-- construidas a mano en la base.

DROP FUNCTION IF EXISTS public.get_my_favorites_enriched();
DROP FUNCTION IF EXISTS public.get_my_favorites_enriched_v2(INT, TIMESTAMPTZ);

DROP TABLE IF EXISTS public.favorites;

COMMIT;
