-- ═══════════════════════════════════════════════════════════════════════
-- URBA — unir las fases de definición al torneo del que son fase.
--
-- 9 competencias-temporada · 17 filas de tournaments que se borran
-- · 70 partidos que cambian de tournament_id.
--
-- Generado por src/scripts/urba-fases-unir.ts --sql. No editar a mano: si hay
-- que cambiar algo, se cambia el script y se vuelve a generar.
--
-- Los partidos NO cambian de phase_id. Lo que se muda es la fase entera, así
-- que ningún partido cambia de tabla de posiciones: cambia de torneo la tabla.
--
-- Va en UNA transacción a propósito. Si una FK que no está contemplada frena
-- un DELETE, no queda nada a medio aplicar.
--
-- Rollback: URBA_FASES_UNIR_ROLLBACK.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 2021|Top 12|Preintermedia|mayores|masculino
--    Top 12 - Preintermedia - Clasificación  ->  Top 12 - Preintermedia
--    la fase del torneo base toma el nombre de su instancia
UPDATE public.tournament_phases SET name = 'Clasificación', order_index = 1, is_active = true WHERE id = '99ac561c-fe70-4548-82ff-7ba7e6d787ce';
--    Semifinal (urba:2021129, 16 partidos)
UPDATE public.tournament_phases SET tournament_id = '6d97a0c5-d74d-437d-a454-a843b8097ff6', name = 'Semifinal', phase_type = 'playoff', order_index = 2, is_active = false WHERE id = 'c1fe4401-9396-4d2a-a683-c9b31cc2e78e';
UPDATE public.matches SET tournament_id = '6d97a0c5-d74d-437d-a454-a843b8097ff6' WHERE phase_id = 'c1fe4401-9396-4d2a-a683-c9b31cc2e78e';
DELETE FROM public.tournament_participants WHERE tournament_id = '00933e52-b165-47a6-8526-a6be0a1b2b21';
UPDATE public.tournaments SET name = 'URBA: Top 12 - Preintermedia' WHERE id = '6d97a0c5-d74d-437d-a454-a843b8097ff6';
DELETE FROM public.tournaments WHERE id IN ('00933e52-b165-47a6-8526-a6be0a1b2b21');

-- ── 2022|Desarrollo|Intermedia|mayores|masculino
--    Desarrollo - Intermedia - Clasificación  ->  Desarrollo - Intermedia
--    la fase del torneo base toma el nombre de su instancia
UPDATE public.tournament_phases SET name = 'Clasificación', order_index = 1, is_active = true WHERE id = '8972ba2d-c537-44f8-8219-b3cee8507d20';
--    Torneo final A (urba:2022002, 10 partidos)
UPDATE public.tournament_phases SET tournament_id = 'a7feaffa-a199-4afc-b018-217ed34d7fba', name = 'Torneo final A', phase_type = 'playoff', order_index = 2, is_active = false WHERE id = '8ee8a878-08d2-4e6d-b9de-ec048fb8480f';
UPDATE public.matches SET tournament_id = 'a7feaffa-a199-4afc-b018-217ed34d7fba' WHERE phase_id = '8ee8a878-08d2-4e6d-b9de-ec048fb8480f';
DELETE FROM public.tournament_participants WHERE tournament_id = 'a651be42-235f-4a9e-adf2-5fb3cdb85745';
--    Torneo final B (urba:2022003, 6 partidos)
UPDATE public.tournament_phases SET tournament_id = 'a7feaffa-a199-4afc-b018-217ed34d7fba', name = 'Torneo final B', phase_type = 'playoff', order_index = 3, is_active = false WHERE id = 'c8bdde3f-5bd5-4dfc-8a96-4417ccd9b4e3';
UPDATE public.matches SET tournament_id = 'a7feaffa-a199-4afc-b018-217ed34d7fba' WHERE phase_id = 'c8bdde3f-5bd5-4dfc-8a96-4417ccd9b4e3';
DELETE FROM public.tournament_participants WHERE tournament_id = '731f01b5-22b7-49af-b56c-bd0b008b1db0';
UPDATE public.tournaments SET name = 'URBA: Desarrollo - Intermedia' WHERE id = 'a7feaffa-a199-4afc-b018-217ed34d7fba';
DELETE FROM public.tournaments WHERE id IN ('a651be42-235f-4a9e-adf2-5fb3cdb85745', '731f01b5-22b7-49af-b56c-bd0b008b1db0');

-- ── 2022|Desarrollo|Superior|mayores|masculino
--    Desarrollo - Superior - Clasificación  ->  Desarrollo - Superior
--    la fase del torneo base toma el nombre de su instancia
UPDATE public.tournament_phases SET name = 'Clasificación', order_index = 1, is_active = true WHERE id = '4cb3f14c-e022-4999-b470-086222eb8b3a';
--    Torneo final A (urba:2022005, 10 partidos)
UPDATE public.tournament_phases SET tournament_id = 'ff7bfa39-4f26-405d-b2d3-6edfbe44925d', name = 'Torneo final A', phase_type = 'playoff', order_index = 2, is_active = false WHERE id = '5ccd2a2a-89a7-4811-abc3-9bad39455f97';
UPDATE public.matches SET tournament_id = 'ff7bfa39-4f26-405d-b2d3-6edfbe44925d' WHERE phase_id = '5ccd2a2a-89a7-4811-abc3-9bad39455f97';
DELETE FROM public.tournament_participants WHERE tournament_id = 'ebc115a0-1ed4-4939-954c-4f3de042c2b7';
--    Torneo final B (urba:2022006, 10 partidos)
UPDATE public.tournament_phases SET tournament_id = 'ff7bfa39-4f26-405d-b2d3-6edfbe44925d', name = 'Torneo final B', phase_type = 'playoff', order_index = 3, is_active = false WHERE id = '304da681-7b2e-4cfb-983b-cb56cba30cb6';
UPDATE public.matches SET tournament_id = 'ff7bfa39-4f26-405d-b2d3-6edfbe44925d' WHERE phase_id = '304da681-7b2e-4cfb-983b-cb56cba30cb6';
DELETE FROM public.tournament_participants WHERE tournament_id = 'f9290513-43ce-4182-94e7-d6ba50c71024';
UPDATE public.tournaments SET name = 'URBA: Desarrollo - Superior' WHERE id = 'ff7bfa39-4f26-405d-b2d3-6edfbe44925d';
DELETE FROM public.tournaments WHERE id IN ('ebc115a0-1ed4-4939-954c-4f3de042c2b7', 'f9290513-43ce-4182-94e7-d6ba50c71024');

-- ── 2022|Top 13|Intermedia|mayores|masculino
--    Top 13 - Intermedia - Clasificación  ->  Top 13 - Intermedia
--    la fase del torneo base toma el nombre de su instancia
UPDATE public.tournament_phases SET name = 'Clasificación', order_index = 1, is_active = true WHERE id = 'da3526a6-16aa-4805-9653-517d22d32c8a';
--    Semifinal (urba:2022119, 2 partidos)
UPDATE public.tournament_phases SET tournament_id = 'f496fe1d-6bf3-46b1-97b9-3520134bc36c', name = 'Semifinal', phase_type = 'playoff', order_index = 2, is_active = false WHERE id = '6fe7d62c-3a72-4cc4-a7cf-00ec4f9a2862';
UPDATE public.matches SET tournament_id = 'f496fe1d-6bf3-46b1-97b9-3520134bc36c' WHERE phase_id = '6fe7d62c-3a72-4cc4-a7cf-00ec4f9a2862';
DELETE FROM public.tournament_participants WHERE tournament_id = 'e86e49fd-8c55-43bf-bb0d-9a1ce51e10ae';
--    Final (urba:2022118, 1 partidos)
UPDATE public.tournament_phases SET tournament_id = 'f496fe1d-6bf3-46b1-97b9-3520134bc36c', name = 'Final', phase_type = 'playoff', order_index = 3, is_active = false WHERE id = 'f9a2ab41-a1e1-497c-8885-8135efb55b5a';
UPDATE public.matches SET tournament_id = 'f496fe1d-6bf3-46b1-97b9-3520134bc36c' WHERE phase_id = 'f9a2ab41-a1e1-497c-8885-8135efb55b5a';
DELETE FROM public.tournament_participants WHERE tournament_id = 'd3c6f415-fd88-4621-a37c-c20a298141d3';
UPDATE public.tournaments SET name = 'URBA: Top 13 - Intermedia' WHERE id = 'f496fe1d-6bf3-46b1-97b9-3520134bc36c';
DELETE FROM public.tournaments WHERE id IN ('e86e49fd-8c55-43bf-bb0d-9a1ce51e10ae', 'd3c6f415-fd88-4621-a37c-c20a298141d3');

-- ── 2022|Top 13|Preintermedia A|mayores|masculino
--    Top 13 - Preintermedia A
--    la fase del torneo base se queda como está, activa y primera
UPDATE public.tournament_phases SET order_index = 1, is_active = true WHERE id = 'ad1b4ee2-78f6-474a-9b07-fd2b130053a9';
--    Semifinal (urba:2022122, 2 partidos)
UPDATE public.tournament_phases SET tournament_id = '0fbb06e1-c1a1-4a46-965d-920fe3d8c0c5', name = 'Semifinal', phase_type = 'playoff', order_index = 2, is_active = false WHERE id = '422bd1ea-30f6-4b82-b58e-432a5a8c784b';
UPDATE public.matches SET tournament_id = '0fbb06e1-c1a1-4a46-965d-920fe3d8c0c5' WHERE phase_id = '422bd1ea-30f6-4b82-b58e-432a5a8c784b';
DELETE FROM public.tournament_participants WHERE tournament_id = '2aaefcd2-7738-4083-82bb-01c4a3b9ce1c';
--    Final (urba:2022121, 1 partidos)
UPDATE public.tournament_phases SET tournament_id = '0fbb06e1-c1a1-4a46-965d-920fe3d8c0c5', name = 'Final', phase_type = 'playoff', order_index = 3, is_active = false WHERE id = '2c5365cd-c8be-4987-b5f1-fefbbfea7c55';
UPDATE public.matches SET tournament_id = '0fbb06e1-c1a1-4a46-965d-920fe3d8c0c5' WHERE phase_id = '2c5365cd-c8be-4987-b5f1-fefbbfea7c55';
DELETE FROM public.tournament_participants WHERE tournament_id = '35f459b0-42cf-4a64-af2b-4967d76c8af0';
DELETE FROM public.tournaments WHERE id IN ('2aaefcd2-7738-4083-82bb-01c4a3b9ce1c', '35f459b0-42cf-4a64-af2b-4967d76c8af0');

-- ── 2022|Top 13|Preintermedia B|mayores|masculino
--    Top 13 - Preintermedia B
--    la fase del torneo base se queda como está, activa y primera
UPDATE public.tournament_phases SET order_index = 1, is_active = true WHERE id = 'b4f237d4-9737-45f0-8642-bb2a799e3b7d';
--    Semifinal (urba:2022125, 2 partidos)
UPDATE public.tournament_phases SET tournament_id = '59a8c409-90e5-4a27-a95d-dfbc477843b0', name = 'Semifinal', phase_type = 'playoff', order_index = 2, is_active = false WHERE id = '40337872-8268-4564-90aa-fdbac6d6086b';
UPDATE public.matches SET tournament_id = '59a8c409-90e5-4a27-a95d-dfbc477843b0' WHERE phase_id = '40337872-8268-4564-90aa-fdbac6d6086b';
DELETE FROM public.tournament_participants WHERE tournament_id = 'c9fa38c0-703d-4ee0-b192-3a76662834df';
--    Final (urba:2022124, 1 partidos)
UPDATE public.tournament_phases SET tournament_id = '59a8c409-90e5-4a27-a95d-dfbc477843b0', name = 'Final', phase_type = 'playoff', order_index = 3, is_active = false WHERE id = 'f9dedc8b-eb26-44f2-b033-279e8b68a03d';
UPDATE public.matches SET tournament_id = '59a8c409-90e5-4a27-a95d-dfbc477843b0' WHERE phase_id = 'f9dedc8b-eb26-44f2-b033-279e8b68a03d';
DELETE FROM public.tournament_participants WHERE tournament_id = 'c45cbee9-5881-49c9-898b-729fb1763a69';
DELETE FROM public.tournaments WHERE id IN ('c9fa38c0-703d-4ee0-b192-3a76662834df', 'c45cbee9-5881-49c9-898b-729fb1763a69');

-- ── 2022|Top 13|Preintermedia C|mayores|masculino
--    Top 13 - Preintermedia C
--    la fase del torneo base se queda como está, activa y primera
UPDATE public.tournament_phases SET order_index = 1, is_active = true WHERE id = '1938ff24-156e-4ea3-9931-3a2e52ffe5f3';
--    Semifinal (urba:2022128, 2 partidos)
UPDATE public.tournament_phases SET tournament_id = 'e754d713-43c1-4c84-a452-6c09efb71d70', name = 'Semifinal', phase_type = 'playoff', order_index = 2, is_active = false WHERE id = '0c8a71fd-ce8a-49ae-a924-e92a2dcee88b';
UPDATE public.matches SET tournament_id = 'e754d713-43c1-4c84-a452-6c09efb71d70' WHERE phase_id = '0c8a71fd-ce8a-49ae-a924-e92a2dcee88b';
DELETE FROM public.tournament_participants WHERE tournament_id = '72492542-5370-4537-be85-011028f60f1d';
--    Final (urba:2022127, 1 partidos)
UPDATE public.tournament_phases SET tournament_id = 'e754d713-43c1-4c84-a452-6c09efb71d70', name = 'Final', phase_type = 'playoff', order_index = 3, is_active = false WHERE id = '820e55c0-ce69-493c-8f3f-a96b83e0e955';
UPDATE public.matches SET tournament_id = 'e754d713-43c1-4c84-a452-6c09efb71d70' WHERE phase_id = '820e55c0-ce69-493c-8f3f-a96b83e0e955';
DELETE FROM public.tournament_participants WHERE tournament_id = '1c2c3656-71cd-4f32-a06b-5c82687d9095';
DELETE FROM public.tournaments WHERE id IN ('72492542-5370-4537-be85-011028f60f1d', '1c2c3656-71cd-4f32-a06b-5c82687d9095');

-- ── 2022|Top 13|Preintermedia D|mayores|masculino
--    Top 13 - Preintermedia D
--    la fase del torneo base se queda como está, activa y primera
UPDATE public.tournament_phases SET order_index = 1, is_active = true WHERE id = '901f901d-bde6-4f8a-a3a5-70582d3e6301';
--    Semifinal (urba:2022131, 2 partidos)
UPDATE public.tournament_phases SET tournament_id = '7cf266f3-d8a9-4496-afb2-2c86eb2c5b3d', name = 'Semifinal', phase_type = 'playoff', order_index = 2, is_active = false WHERE id = '7f1fcc91-8253-4eb2-bac8-ecf8842935f7';
UPDATE public.matches SET tournament_id = '7cf266f3-d8a9-4496-afb2-2c86eb2c5b3d' WHERE phase_id = '7f1fcc91-8253-4eb2-bac8-ecf8842935f7';
DELETE FROM public.tournament_participants WHERE tournament_id = 'aab008ef-f96e-43fa-901f-230601aef361';
--    Final (urba:2022130, 1 partidos)
UPDATE public.tournament_phases SET tournament_id = '7cf266f3-d8a9-4496-afb2-2c86eb2c5b3d', name = 'Final', phase_type = 'playoff', order_index = 3, is_active = false WHERE id = 'b11bf94c-0bcb-4714-a5e9-2b265d596ae5';
UPDATE public.matches SET tournament_id = '7cf266f3-d8a9-4496-afb2-2c86eb2c5b3d' WHERE phase_id = 'b11bf94c-0bcb-4714-a5e9-2b265d596ae5';
DELETE FROM public.tournament_participants WHERE tournament_id = '71e6ea14-127d-4587-8cbd-3fdc1c7b3289';
DELETE FROM public.tournaments WHERE id IN ('aab008ef-f96e-43fa-901f-230601aef361', '71e6ea14-127d-4587-8cbd-3fdc1c7b3289');

-- ── 2022|Top 13|Superior|mayores|masculino
--    Top 13 - Superior - Clasificación  ->  Top 13 - Superior
--    la fase del torneo base toma el nombre de su instancia
UPDATE public.tournament_phases SET name = 'Clasificación', order_index = 1, is_active = true WHERE id = '68f978d4-f650-48bd-8094-54b1dacf942e';
--    Semifinal (urba:2022134, 2 partidos)
UPDATE public.tournament_phases SET tournament_id = '5966f562-60d2-4b05-bdc2-1e85f54c3635', name = 'Semifinal', phase_type = 'playoff', order_index = 2, is_active = false WHERE id = '7f018361-9104-4ac9-89a0-dff1a378f3ea';
UPDATE public.matches SET tournament_id = '5966f562-60d2-4b05-bdc2-1e85f54c3635' WHERE phase_id = '7f018361-9104-4ac9-89a0-dff1a378f3ea';
DELETE FROM public.tournament_participants WHERE tournament_id = '003879ba-ccea-48e4-a4cd-cf3c7a5673ae';
--    Final (urba:2022133, 1 partidos)
UPDATE public.tournament_phases SET tournament_id = '5966f562-60d2-4b05-bdc2-1e85f54c3635', name = 'Final', phase_type = 'playoff', order_index = 3, is_active = false WHERE id = 'c6a14a4f-5405-4e6f-83a9-783b08f60ca1';
UPDATE public.matches SET tournament_id = '5966f562-60d2-4b05-bdc2-1e85f54c3635' WHERE phase_id = 'c6a14a4f-5405-4e6f-83a9-783b08f60ca1';
DELETE FROM public.tournament_participants WHERE tournament_id = '9e3d8c5a-357c-4f81-9619-13dd3f8deade';
UPDATE public.tournaments SET name = 'URBA: Top 13 - Superior' WHERE id = '5966f562-60d2-4b05-bdc2-1e85f54c3635';
DELETE FROM public.tournaments WHERE id IN ('003879ba-ccea-48e4-a4cd-cf3c7a5673ae', '9e3d8c5a-357c-4f81-9619-13dd3f8deade');

COMMIT;

-- ── Verificación, para correr DESPUÉS del COMMIT ───────────────────────
-- Tiene que devolver 0 filas: ninguna competencia unida ofrece su año dos veces.
-- SELECT season_id, category, subcategory, count(*)
--   FROM public.tournaments WHERE union_id = 'urba'
--  GROUP BY 1, 2, 3 HAVING count(*) > 1
--     AND (season_id, category) IN (('2021', 'Top 12'), ('2022', 'Desarrollo'), ('2022', 'Top 13'));

-- Y los partidos tienen que seguir teniendo fase:
-- SELECT count(*) FROM public.matches m
--  WHERE m.tournament_id IN ('6d97a0c5-d74d-437d-a454-a843b8097ff6', 'a7feaffa-a199-4afc-b018-217ed34d7fba', 'ff7bfa39-4f26-405d-b2d3-6edfbe44925d', 'f496fe1d-6bf3-46b1-97b9-3520134bc36c', '0fbb06e1-c1a1-4a46-965d-920fe3d8c0c5', '59a8c409-90e5-4a27-a95d-dfbc477843b0', 'e754d713-43c1-4c84-a452-6c09efb71d70', '7cf266f3-d8a9-4496-afb2-2c86eb2c5b3d', '5966f562-60d2-4b05-bdc2-1e85f54c3635') AND m.phase_id IS NULL;
