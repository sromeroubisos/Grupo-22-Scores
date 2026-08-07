-- Rollback de la normalización de los 8 torneos preexistentes de URBA.
BEGIN;
UPDATE public.tournaments SET category = 'Primera B', age_grade = 'Mayores', gender = NULL WHERE external_id = 'urba:2025178';
UPDATE public.tournaments SET category = 'Menores de 17', age_grade = 'Juveniles', gender = NULL WHERE external_id = 'urba:2025231';
UPDATE public.tournaments SET category = 'Menores de 17', age_grade = 'Juveniles', gender = NULL WHERE external_id = 'urba:2025233';
UPDATE public.tournaments SET category = 'Top 14', age_grade = 'Mayores', gender = NULL WHERE external_id = 'urba:2025176';
UPDATE public.tournaments SET category = 'Menores de 19', age_grade = 'Juveniles', gender = NULL WHERE external_id = 'urba:2025213';
UPDATE public.tournaments SET category = 'Menores de 19', age_grade = 'Juveniles', gender = NULL WHERE external_id = 'urba:2025215';
UPDATE public.tournaments SET category = 'Primera C', age_grade = 'Mayores', gender = NULL WHERE external_id = 'urba:2025179';
UPDATE public.tournaments SET category = 'Primera A', age_grade = 'Mayores (Adults)', gender = NULL WHERE external_id = 'urba:2025177';
COMMIT;
