-- =====================================================================
-- Performance Indexes for G22-Scores
-- Ejecutar en Supabase SQL Editor
-- Estos índices acelleran las queries más frecuentes del admin console
-- =====================================================================

-- CLUBS: búsqueda por union_id (join frecuente), nombre y visibilidad
CREATE INDEX IF NOT EXISTS idx_clubs_union_id       ON clubs (union_id);
CREATE INDEX IF NOT EXISTS idx_clubs_name           ON clubs (name);
CREATE INDEX IF NOT EXISTS idx_clubs_is_visible     ON clubs (is_visible);
CREATE INDEX IF NOT EXISTS idx_clubs_country        ON clubs (country);

-- MATCHES: ordenar por fecha (primary sort), filtrar por status y torneo
CREATE INDEX IF NOT EXISTS idx_matches_date_time    ON matches (date_time DESC);
CREATE INDEX IF NOT EXISTS idx_matches_status       ON matches (status);
CREATE INDEX IF NOT EXISTS idx_matches_tournament   ON matches (tournament_id);
CREATE INDEX IF NOT EXISTS idx_matches_home_club    ON matches (home_club_id);
CREATE INDEX IF NOT EXISTS idx_matches_away_club    ON matches (away_club_id);

-- TOURNAMENTS: ordenar por created_at, filtrar por sport / status / union
CREATE INDEX IF NOT EXISTS idx_tournaments_union_id   ON tournaments (union_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_sport      ON tournaments (sport);
CREATE INDEX IF NOT EXISTS idx_tournaments_status     ON tournaments (status);
CREATE INDEX IF NOT EXISTS idx_tournaments_season_id  ON tournaments (season_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_country    ON tournaments (country);
CREATE INDEX IF NOT EXISTS idx_tournaments_created_at ON tournaments (created_at DESC);

-- UNIONS: pocas filas, pero usadas frecuentemente como lookup
CREATE INDEX IF NOT EXISTS idx_unions_name            ON unions (name);

-- USERS (auth lookups)
CREATE INDEX IF NOT EXISTS idx_users_email            ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role             ON users (role);

-- FAVORITES: queries por user_id (perfil) y entity
CREATE INDEX IF NOT EXISTS idx_favorites_user_id      ON favorites (user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_entity       ON favorites (entity_type, entity_id);
