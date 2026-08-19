-- Cerrar la exposición de datos personales de `people` a la clave anónima.
--
-- ESTADO ACTUAL (verificado 2026-08-04 contra la base):
--   · La política `people_select` (20260410123000_rls_lint_cleanup.sql:1006) es
--     `FOR SELECT TO anon, authenticated USING (true)`: lectura pública de TODA
--     la tabla, y sin GRANT de columna, o sea TODAS las columnas.
--   · 1.479 filas legibles con la anon key, que va embebida en el frontend y por
--     lo tanto es pública.
--   · Columnas abiertas: id_number (DNI), birth_date, email, phone, además de
--     nombre y foto. En una muestra de 200: 200 nombres, 1 fecha de nacimiento,
--     0 DNIs y 0 contactos.
--   · El padrón incluye juveniles M15 a M19: son menores.
--
-- Que hoy esas columnas estén casi vacías no es una defensa: están abiertas, así
-- que filtran solas el día que alguien cargue un DNI o un teléfono, sin que nadie
-- toque una línea de código.
--
-- RLS filtra FILAS, no columnas. Lo que acota columnas es el privilegio de
-- columna, y por eso esta migración va por GRANT/REVOKE y no por política.

-- ── anon ──────────────────────────────────────────────────────────────────────
-- Se revoca el SELECT de tabla completa y se otorga sólo sobre las columnas que
-- el producto muestra en público. NUNCA: id_number, birth_date, email, phone.
-- Tampoco weight ni height: en un padrón con menores son dato biométrico y no
-- hacen falta para ninguna pantalla pública.
REVOKE SELECT ON public.people FROM anon;
GRANT SELECT (
    id,
    club_id,
    full_name,
    first_name,
    last_name,
    name,
    photo_url,
    avatar_url,
    position,
    role,
    status
) ON public.people TO anon;

-- ── authenticated ─────────────────────────────────────────────────────────────
-- Mismo agujero, y más grande: hay 1.227 usuarios registrados, y la política
-- `people_select` también los alcanza. Sin esto, cualquier cuenta logueada lee
-- los 1.479 DNIs desde el navegador. Lo que necesite el dato completo va por una
-- ruta de servidor con service_role, que no pasa por estos privilegios.
REVOKE SELECT ON public.people FROM authenticated;
GRANT SELECT (
    id,
    club_id,
    full_name,
    first_name,
    last_name,
    name,
    photo_url,
    avatar_url,
    position,
    role,
    status
) ON public.people TO authenticated;

-- ── club_profile ──────────────────────────────────────────────────────────────
-- Mismo agujero, menos filas: 2 hoy, con admin_contact_email, admin_contact_phone
-- y venue_address legibles por anon. Están vacías, pero por eso mismo conviene
-- cerrarlo ahora: se llenan y filtran sin que nadie toque una línea de código.
-- El contacto del administrador del club no es dato público.
REVOKE SELECT ON public.club_profile FROM anon, authenticated;
-- Quedan afuera: admin_contact_name, admin_contact_email, admin_contact_phone
-- (contacto de una persona) y venue_address, venue_notes (domicilio).
GRANT SELECT (
    club_id,
    website,
    instagram,
    x_url,
    youtube,
    tiktok,
    venue_name,
    venue_capacity,
    created_at,
    updated_at
) ON public.club_profile TO anon, authenticated;

-- ── club_venues ───────────────────────────────────────────────────────────────
-- Tercer caso del mismo patrón, confirmado sobre pg_policies:
--   venues_select | SELECT | {anon,authenticated} | qual: true
-- Lectura pública sin filtro. Hoy tiene 0 filas, y justamente por eso conviene
-- cerrarla ahora: guarda direcciones de canchas, que en un padrón con juveniles es
-- "dónde encontrar a los chicos un sábado a la mañana".
--
-- Criterio: LA UBICACIÓN EXACTA NO VA A anon. Público queda `name` y `city`, que
-- alcanzan para "dónde juega"; la dirección la ve quien tiene que ir, por ruta
-- autenticada.
--
-- Por eso se cierra `maps_link` junto con `address`: un link de Maps apunta al
-- mismo punto en el mapa. Dejar uno abierto y cerrar el otro era aplicar dos
-- criterios distintos al mismo dato, y el que quedaba abierto entregaba lo mismo
-- que el cerrado.
REVOKE SELECT ON public.club_venues FROM anon, authenticated;
GRANT SELECT (
    id,
    club_id,
    name,
    city,
    is_primary,
    created_at,
    updated_at
) ON public.club_venues TO anon, authenticated;

COMMENT ON COLUMN public.club_venues.address IS
    'Dirección exacta de la cancha. NO legible por anon ni authenticated. Ver 20260804170000.';
COMMENT ON COLUMN public.club_venues.maps_link IS
    'Link a la ubicación exacta: mismo dato que address, mismo tratamiento. NO legible por anon ni authenticated. Ver 20260804170000.';

COMMENT ON COLUMN public.people.id_number IS
    'DNI. NO legible por anon ni authenticated: sólo por service_role desde una ruta de servidor. Ver 20260804170000.';
COMMENT ON COLUMN public.people.birth_date IS
    'Fecha de nacimiento. NO legible por anon ni authenticated. Ver 20260804170000.';

NOTIFY pgrst, 'reload schema';

-- ── ROLLBACK ──────────────────────────────────────────────────────────────────
-- Devuelve el acceso a toda la tabla. Correr sólo si algo se rompió y hace falta
-- volver atrás mientras se corrige el llamador:
--
--   REVOKE SELECT ON public.people FROM anon, authenticated;
--   GRANT SELECT ON public.people TO anon, authenticated;
--   NOTIFY pgrst, 'reload schema';
--
-- El REVOKE previo es necesario: sin él quedan conviviendo los privilegios de
-- columna con el de tabla, que es un estado confuso de auditar.
