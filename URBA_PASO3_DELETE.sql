-- PASO 3 — borrado de los partidos cargados a mano en los 8 torneos de URBA.
-- Acotado por tournament_id Y por external_id IS NULL: nada fuera de esos 8.
-- Respaldo completo en URBA_BACKUP_MANUALES.sql (1.256 INSERT, ids originales).

BEGIN;

-- urba:2025233  URBA: Menores de 17 - G2 NIVEL 1 "B"   esperado: 132 filas
DELETE FROM public.matches WHERE tournament_id = 'c9515ca4-4a69-454c-83ac-1760b1891943'::uuid AND external_id IS NULL;

-- urba:2025178  Primera "B" de la URBA   esperado: 182 filas
DELETE FROM public.matches WHERE tournament_id = '797e1b94-6397-4d73-a676-c166e40be5a9'::uuid AND external_id IS NULL;

-- urba:2025231  URBA: Menores de 17 - G2 NIVEL 1 "A"   esperado: 132 filas
DELETE FROM public.matches WHERE tournament_id = '78d168c6-a71f-4726-89f9-44235dd6e5c4'::uuid AND external_id IS NULL;

-- urba:2025215  URBA: MENORES DE 19 - G2 NIVEL 1 "B"   esperado: 132 filas
DELETE FROM public.matches WHERE tournament_id = '8018994b-15be-4582-a054-ecaae431e60d'::uuid AND external_id IS NULL;

-- urba:2025176  Top 14 de la URBA   esperado: 182 filas
DELETE FROM public.matches WHERE tournament_id = 'd29703d0-125c-44a1-ab38-137450935a6e'::uuid AND external_id IS NULL;

-- urba:2025179  Primera "C" de la URBA   esperado: 182 filas
DELETE FROM public.matches WHERE tournament_id = 'd1c0af07-36ee-4234-8678-53fef1931e4f'::uuid AND external_id IS NULL;

-- urba:2025177  Primera "A" de la URBA   esperado: 182 filas
DELETE FROM public.matches WHERE tournament_id = 'e5c74c61-ff94-4091-9773-ec7303088fdc'::uuid AND external_id IS NULL;

-- urba:2025213  URBA: MENORES DE 19 - G2 NIVEL 1 "A"   esperado: 132 filas
DELETE FROM public.matches WHERE tournament_id = 'b68ceaef-298e-4c63-9964-c9a95ba43822'::uuid AND external_id IS NULL;

-- TOTAL esperado: 1256 filas
-- Verificación: SELECT count(*) FROM public.matches; -- 14815 - 1256 = 13559
COMMIT;
