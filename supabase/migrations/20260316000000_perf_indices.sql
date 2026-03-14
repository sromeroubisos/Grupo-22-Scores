-- ============================================
-- OPTIMIZACIÓN DE RENDIMIENTO: ÍNDICES
-- ============================================

-- Índices para la tabla matches (Filtros comunes en el API)
CREATE INDEX IF NOT EXISTS idx_matches_date_time ON public.matches (date_time);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches (status);
CREATE INDEX IF NOT EXISTS idx_matches_tournament_id ON public.matches (tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_home_club_id ON public.matches (home_club_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_club_id ON public.matches (away_club_id);

-- Índices para la tabla tournaments (Búsquedas por deporte y estado)
CREATE INDEX IF NOT EXISTS idx_tournaments_sport ON public.tournaments (sport);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON public.tournaments (status);
CREATE INDEX IF NOT EXISTS idx_tournaments_union_id ON public.tournaments (union_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_season_id ON public.tournaments (season_id);

-- Índices para la tabla clubs (Joins frecuentes)
CREATE INDEX IF NOT EXISTS idx_clubs_union_id ON public.clubs (union_id);
CREATE INDEX IF NOT EXISTS idx_clubs_slug ON public.clubs (slug);

-- Índices para la tabla favorites (Consultas de favoritos del usuario)
-- Nota: Ya existen algunos en 20260219000000_perf_favorites.sql, aseguramos los básicos
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_entity ON public.favorites (entity_type, entity_id);

-- Estadística para optimizar los planes de consulta
ANALYZE public.matches;
ANALYZE public.tournaments;
ANALYZE public.clubs;
