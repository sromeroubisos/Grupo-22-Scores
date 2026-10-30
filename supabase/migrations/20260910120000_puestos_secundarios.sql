-- Un jugador tiene puestos, en plural: un pilar que también hace de hooker, un
-- central que juega de lateral. Hasta acá la ficha guardaba UN texto en
-- `position`, y el segundo puesto se perdía o se escribía a mano en el mismo
-- campo ("Pilar/Hooker"), que después no matcheaba con nada.
--
-- Dónde vive: en la MEMBRESÍA, no en la persona. El puesto es de la persona
-- dentro de una categoría (y la categoría dice el deporte: un club
-- polideportivo tiene categorías de rugby y de hockey). `team_memberships` es
-- la membresía por categoría; `club_person_roles` es el camino legado que
-- personService lee cuando `team_memberships` no está (PGRST205), y ya duplica
-- `position` por el mismo motivo. Se agrega en las dos para que los dos caminos
-- de lectura devuelvan lo mismo. `people.position` NO recibe la columna: es la
-- copia que sobra y no se va a extender.
--
-- Qué se guarda: ETIQUETAS del catálogo de src/lib/data/playerPositions.ts
-- ("Hooker", "Segunda Línea", "Defensora/or"), igual que `position`. No códigos:
-- todo lo que imprime el puesto (planilla oficial, formaciones, ficha pública)
-- lee el texto tal cual, y pasar a códigos pide migrar datos y tocar cada
-- consumidor. `position` sigue siendo el puesto PRINCIPAL; acá van los otros.
--
-- Límite: tres puestos secundarios. Más que eso ya no es un puesto, es
-- "juega de cualquier cosa", y la planilla no tiene lugar para listarlos.
--
-- Código: personService.ts tiene que tolerar que la columna todavía no exista
-- (PGRST204) con el mismo reintento que hace con front_row_certified en
-- insertPersonAssignmentsInClub, porque la base viva arrastra migraciones sin
-- correr. Sin ese reintento, isMissingTableError daría el error por "tabla
-- ausente" y la membresía entera quedaría sin escribir.

ALTER TABLE public.team_memberships
    ADD COLUMN IF NOT EXISTS secondary_positions TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.team_memberships
    DROP CONSTRAINT IF EXISTS team_memberships_secondary_positions_check;

ALTER TABLE public.team_memberships
    ADD CONSTRAINT team_memberships_secondary_positions_check CHECK (
        cardinality(secondary_positions) <= 3
        AND array_position(secondary_positions, NULL) IS NULL
        AND NOT (position IS NOT NULL AND position = ANY (secondary_positions))
    );

COMMENT ON COLUMN public.team_memberships.secondary_positions IS
    'Puestos secundarios del jugador en esta categoría, como etiquetas del catálogo por deporte (playerPositions.ts). `position` es el principal y no se repite acá. Máximo 3. Ver 20260910120000.';

ALTER TABLE public.club_person_roles
    ADD COLUMN IF NOT EXISTS secondary_positions TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE public.club_person_roles
    DROP CONSTRAINT IF EXISTS club_person_roles_secondary_positions_check;

ALTER TABLE public.club_person_roles
    ADD CONSTRAINT club_person_roles_secondary_positions_check CHECK (
        cardinality(secondary_positions) <= 3
        AND array_position(secondary_positions, NULL) IS NULL
        AND NOT (position IS NOT NULL AND position = ANY (secondary_positions))
    );

COMMENT ON COLUMN public.club_person_roles.secondary_positions IS
    'Copia legada de team_memberships.secondary_positions, por el mismo motivo que `position` está en las dos tablas: es lo que lee personService cuando team_memberships no existe. Ver 20260910120000.';

NOTIFY pgrst, 'reload schema';
