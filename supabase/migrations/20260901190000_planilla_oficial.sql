-- Datos que faltaban para exportar la planilla oficial de partido (formato UAR):
--
--   1. people.doc_country — el país que emitió el documento. La identidad de un
--      jugador es (doc_country, id_number): un DNI argentino repetido entre
--      partidos es el mismo jugador; el mismo número emitido por otro país es
--      otra persona. El matching vive en findPotentialPersonIdentityMatches
--      (personService.ts), no en un unique index: `people` arrastra fichas
--      duplicadas históricas y un índice único fallaría al crearse.
--
--   2. team_memberships.front_row_certified — la marca ① de la planilla: el
--      manager del club marca, en la gestión de plantel, qué jugadores tienen
--      el curso de primeras líneas.
--
--   3. matches.official_sheet_number — el N° de partido del sistema de la unión
--      (BD UAR o el que corresponda). Opcional; lo carga el torneo y sale
--      impreso como "Planilla de equipo LOCAL para el partido N°: X".
--
-- Privacidad: 20260804170000_people_column_privileges.sql revocó el SELECT de
-- tabla de `people` para anon/authenticated y otorga por columna. Una columna
-- nueva NO queda incluida en esos GRANT, así que doc_country nace cerrada igual
-- que id_number: sólo la lee service_role desde rutas de servidor. No agregar
-- un GRANT acá.

ALTER TABLE public.people
    ADD COLUMN IF NOT EXISTS doc_country TEXT;

COMMENT ON COLUMN public.people.doc_country IS
    'País emisor del documento (id_number). La identidad es (doc_country, id_number). NO legible por anon ni authenticated, igual que id_number. Ver 20260901190000.';

ALTER TABLE public.team_memberships
    ADD COLUMN IF NOT EXISTS front_row_certified BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.team_memberships.front_row_certified IS
    'Curso de primeras líneas aprobado (la marca ① de la planilla oficial). La asigna el manager del club en la gestión de plantel.';

ALTER TABLE public.matches
    ADD COLUMN IF NOT EXISTS official_sheet_number TEXT;

COMMENT ON COLUMN public.matches.official_sheet_number IS
    'N° de partido en el sistema de la unión (BD UAR u otro). Opcional; se usa al exportar la planilla oficial.';

NOTIFY pgrst, 'reload schema';
