-- CHECK de formato sobre club_external_ids.external_id para el proveedor URBA.
--
-- Va en migración aparte porque la tabla ya está creada en la base: el
-- `CREATE TABLE IF NOT EXISTS` de 20260804140000 no vuelve a correr y por lo
-- tanto no agregaría la restricción. Ese archivo también la lleva inline, para
-- que un deploy limpio la tenga desde el principio; esta migración es idempotente
-- y en ese caso no hace nada.
--
-- Formato exigido: {urba_club_id}|{categoria}|{sufijo}
--   · urba_club_id: uno o más dígitos
--   · categoria:    no vacía y sin separadores
--   · sufijo:       una letra de A a H, o vacío
--
-- Validado contra los 1.532 external_id del inventario: los 1.532 pasan, y
-- rechaza '30|mayores', '30|mayores|B|x', '30||B', 'x|mayores|' y '30|mayores|Z'.
-- Los otros proveedores (flashscore, espn) quedan fuera del CHECK a propósito:
-- su id externo es opaco y no tiene esta forma.

DO $$
BEGIN
    IF to_regclass('public.club_external_ids') IS NULL THEN
        RAISE NOTICE 'club_external_ids no existe; se omite el CHECK de formato.';
    ELSIF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'club_external_ids_urba_format_check'
          AND conrelid = 'public.club_external_ids'::regclass
    ) THEN
        RAISE NOTICE 'club_external_ids_urba_format_check ya existe; nada que hacer.';
    ELSIF EXISTS (
        SELECT 1 FROM public.club_external_ids
        WHERE provider = 'urba'
          AND external_id !~ '^[0-9]+\|[^|]+\|[A-H]?$'
    ) THEN
        -- No se fuerza sobre datos que ya violarían la regla: primero hay que
        -- ver qué se cargó mal, y eso es una decisión, no algo que resuelva
        -- una migración.
        RAISE NOTICE 'Hay external_id de URBA que no cumplen el formato; no se crea el CHECK. Revisar con: SELECT * FROM public.club_external_ids WHERE provider = ''urba'' AND external_id !~ ''^[0-9]+\|[^|]+\|[A-H]?$'';';
    ELSE
        ALTER TABLE public.club_external_ids
            ADD CONSTRAINT club_external_ids_urba_format_check
            CHECK (provider <> 'urba' OR external_id ~ '^[0-9]+\|[^|]+\|[A-H]?$');
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
