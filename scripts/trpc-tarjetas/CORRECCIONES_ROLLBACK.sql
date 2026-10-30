-- Rollback de las 6 correcciones de marcador hechas con las tarjetas oficiales (2026-10-27).
-- Valores ANTERIORES a la corrección. Después hay que rehacer las tablas (arusa-recalcular.ts).
BEGIN;
-- Chenque 73-3 Las Águilas (Regional Patagónico F2)
UPDATE public.matches SET score = '{"away":3,"home":73,"manualOverride":{"away":3,"home":73,"cutoffMinute":null}}'::jsonb, home_base_points=4, away_base_points=0, home_bonus_points=1, away_bonus_points=0, points_autocalculated=false, points_override_reason=NULL WHERE id='9fe425a0-9fe5-4182-ac15-619405519846';
-- Bigornia 22-17 Chenque (semifinal Regional Patagónico)
UPDATE public.matches SET score = '{"away":17,"home":22,"penalties":null,"manualOverride":{"away":17,"home":22,"cutoffMinute":null}}'::jsonb, home_base_points=4, away_base_points=0, home_bonus_points=0, away_bonus_points=1, points_autocalculated=true, points_override_reason=NULL WHERE id='ca62c8da-f4f4-4c23-831c-54ecc59e55ec';
-- Tolhuin 0-54 Ushuaia (TDF Clausura F1)
UPDATE public.matches SET score = '{"away":54,"home":0}'::jsonb, home_base_points=0, away_base_points=4, home_bonus_points=0, away_bonus_points=1, points_autocalculated=false, points_override_reason='Resultados de la Zona Campeonato de Tierra del Fuego (historias de la URTDF); el bonus ofensivo va declarado porque la fuente da el marcador, no los tries.' WHERE id='337f331b-0b46-4d76-b7c3-8c570ddb4387';
-- Puerto Madryn - Trelew (Austral F8): estaba programado 0-0
UPDATE public.matches SET status='scheduled', score='{"away":0,"home":0}'::jsonb, home_base_points=0, away_base_points=0, home_bonus_points=0, away_bonus_points=0, points_autocalculated=true, points_override_reason=NULL WHERE id='5a96694b-cb84-4c5e-9e01-3ce0e88fb969';
-- Bigornia 33-19 Puerto Madryn (Austral F6)
UPDATE public.matches SET score='{"away":19,"home":33}'::jsonb, home_base_points=4, away_base_points=0, home_bonus_points=0, away_bonus_points=0, points_autocalculated=true, points_override_reason=NULL WHERE id='349698d2-ffe7-4e48-8387-efc19504c830';
-- Patoruzú 57-19 San Jorge (Austral F6)
UPDATE public.matches SET score='{"away":19,"home":57}'::jsonb, home_base_points=4, away_base_points=0, home_bonus_points=0, away_bonus_points=0, points_autocalculated=true, points_override_reason=NULL WHERE id='b0c46515-9c2b-49b1-a242-7f62e4b6a063';
COMMIT;
