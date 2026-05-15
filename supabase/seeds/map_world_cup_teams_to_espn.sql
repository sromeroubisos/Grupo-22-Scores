-- Mapea selecciones nacionales locales (tabla public.clubs) al equipo
-- correspondiente en ESPN para que /api/teams traiga fixtures/results/squad
-- automaticamente desde la API de ESPN.
--
-- Formato del external_id: espn-soccer-team-{leagueSlug}-{espnTeamId}
-- Liga primaria usada para la resolucion: fifa.world (Mundial). El servicio
-- agrega ademas fifa.world + conmebol.fifa.worldq + fifa.friendly + fifa.cwc
-- al traer el calendario, asi que con un solo mapeo se ven amistosos,
-- eliminatorias y partidos del Mundial juntos.
--
-- Solo escribe sobre filas cuya external_id este vacia o aun no tenga el
-- prefijo ESPN, asi no piso mapeos manuales previos.
--
-- Cubre tanto el nombre en ingles (como viene de ESPN) como el nombre en
-- castellano (como suele estar guardado localmente).

UPDATE public.clubs
SET external_id = v.ext
FROM (VALUES
    ('Algeria',            'espn-soccer-team-fifa.world-624'),
    ('Argelia',            'espn-soccer-team-fifa.world-624'),
    ('Argentina',          'espn-soccer-team-fifa.world-202'),
    ('Australia',          'espn-soccer-team-fifa.world-628'),
    ('Austria',            'espn-soccer-team-fifa.world-474'),
    ('Belgium',            'espn-soccer-team-fifa.world-459'),
    ('Belgica',            'espn-soccer-team-fifa.world-459'),
    ('Bélgica',            'espn-soccer-team-fifa.world-459'),
    ('Bosnia-Herzegovina', 'espn-soccer-team-fifa.world-452'),
    ('Bosnia y Herzegovina','espn-soccer-team-fifa.world-452'),
    ('Brazil',             'espn-soccer-team-fifa.world-205'),
    ('Brasil',             'espn-soccer-team-fifa.world-205'),
    ('Canada',             'espn-soccer-team-fifa.world-206'),
    ('Canadá',             'espn-soccer-team-fifa.world-206'),
    ('Cape Verde',         'espn-soccer-team-fifa.world-2597'),
    ('Cabo Verde',         'espn-soccer-team-fifa.world-2597'),
    ('Colombia',           'espn-soccer-team-fifa.world-208'),
    ('Congo DR',           'espn-soccer-team-fifa.world-2850'),
    ('RD Congo',           'espn-soccer-team-fifa.world-2850'),
    ('Croatia',            'espn-soccer-team-fifa.world-477'),
    ('Croacia',            'espn-soccer-team-fifa.world-477'),
    ('Curacao',            'espn-soccer-team-fifa.world-11678'),
    ('Curazao',            'espn-soccer-team-fifa.world-11678'),
    ('Czechia',            'espn-soccer-team-fifa.world-450'),
    ('Republica Checa',    'espn-soccer-team-fifa.world-450'),
    ('República Checa',    'espn-soccer-team-fifa.world-450'),
    ('Ecuador',            'espn-soccer-team-fifa.world-209'),
    ('Egypt',              'espn-soccer-team-fifa.world-2620'),
    ('Egipto',             'espn-soccer-team-fifa.world-2620'),
    ('England',            'espn-soccer-team-fifa.world-448'),
    ('Inglaterra',         'espn-soccer-team-fifa.world-448'),
    ('France',             'espn-soccer-team-fifa.world-478'),
    ('Francia',            'espn-soccer-team-fifa.world-478'),
    ('Germany',            'espn-soccer-team-fifa.world-481'),
    ('Alemania',           'espn-soccer-team-fifa.world-481'),
    ('Ghana',              'espn-soccer-team-fifa.world-4469'),
    ('Haiti',              'espn-soccer-team-fifa.world-2654'),
    ('Haití',              'espn-soccer-team-fifa.world-2654'),
    ('Iran',               'espn-soccer-team-fifa.world-469'),
    ('Irán',               'espn-soccer-team-fifa.world-469'),
    ('Iraq',               'espn-soccer-team-fifa.world-4375'),
    ('Irak',               'espn-soccer-team-fifa.world-4375'),
    ('Ivory Coast',        'espn-soccer-team-fifa.world-4789'),
    ('Costa de Marfil',    'espn-soccer-team-fifa.world-4789'),
    ('Japan',              'espn-soccer-team-fifa.world-627'),
    ('Japón',              'espn-soccer-team-fifa.world-627'),
    ('Jordan',             'espn-soccer-team-fifa.world-2917'),
    ('Jordania',           'espn-soccer-team-fifa.world-2917'),
    ('Mexico',             'espn-soccer-team-fifa.world-203'),
    ('México',             'espn-soccer-team-fifa.world-203'),
    ('Morocco',            'espn-soccer-team-fifa.world-2869'),
    ('Marruecos',          'espn-soccer-team-fifa.world-2869'),
    ('Netherlands',        'espn-soccer-team-fifa.world-449'),
    ('Paises Bajos',       'espn-soccer-team-fifa.world-449'),
    ('Países Bajos',       'espn-soccer-team-fifa.world-449'),
    ('Holanda',            'espn-soccer-team-fifa.world-449'),
    ('New Zealand',        'espn-soccer-team-fifa.world-2666'),
    ('Nueva Zelanda',      'espn-soccer-team-fifa.world-2666'),
    ('Norway',             'espn-soccer-team-fifa.world-464'),
    ('Noruega',            'espn-soccer-team-fifa.world-464'),
    ('Panama',             'espn-soccer-team-fifa.world-2659'),
    ('Panamá',             'espn-soccer-team-fifa.world-2659'),
    ('Paraguay',           'espn-soccer-team-fifa.world-210'),
    ('Portugal',           'espn-soccer-team-fifa.world-482'),
    ('Qatar',              'espn-soccer-team-fifa.world-4398'),
    ('Saudi Arabia',       'espn-soccer-team-fifa.world-655'),
    ('Arabia Saudita',     'espn-soccer-team-fifa.world-655'),
    ('Scotland',           'espn-soccer-team-fifa.world-580'),
    ('Escocia',            'espn-soccer-team-fifa.world-580'),
    ('Senegal',            'espn-soccer-team-fifa.world-654'),
    ('South Africa',       'espn-soccer-team-fifa.world-467'),
    ('Sudafrica',          'espn-soccer-team-fifa.world-467'),
    ('Sudáfrica',          'espn-soccer-team-fifa.world-467'),
    ('South Korea',        'espn-soccer-team-fifa.world-451'),
    ('Corea del Sur',      'espn-soccer-team-fifa.world-451'),
    ('Spain',              'espn-soccer-team-fifa.world-164'),
    ('Espana',             'espn-soccer-team-fifa.world-164'),
    ('España',             'espn-soccer-team-fifa.world-164'),
    ('Sweden',             'espn-soccer-team-fifa.world-466'),
    ('Suecia',             'espn-soccer-team-fifa.world-466'),
    ('Switzerland',        'espn-soccer-team-fifa.world-475'),
    ('Suiza',              'espn-soccer-team-fifa.world-475'),
    ('Tunisia',            'espn-soccer-team-fifa.world-659'),
    ('Tunez',              'espn-soccer-team-fifa.world-659'),
    ('Túnez',              'espn-soccer-team-fifa.world-659'),
    ('Türkiye',            'espn-soccer-team-fifa.world-465'),
    ('Turkey',             'espn-soccer-team-fifa.world-465'),
    ('Turquia',            'espn-soccer-team-fifa.world-465'),
    ('Turquía',            'espn-soccer-team-fifa.world-465'),
    ('United States',      'espn-soccer-team-fifa.world-660'),
    ('Estados Unidos',     'espn-soccer-team-fifa.world-660'),
    ('Uruguay',            'espn-soccer-team-fifa.world-212'),
    ('Uzbekistan',         'espn-soccer-team-fifa.world-2570'),
    ('Uzbekistán',         'espn-soccer-team-fifa.world-2570')
) AS v(name, ext)
WHERE LOWER(UNACCENT(public.clubs.name)) = LOWER(UNACCENT(v.name))
  AND (public.clubs.external_id IS NULL OR public.clubs.external_id NOT LIKE 'espn-soccer-team-%');

-- Si UNACCENT no esta habilitado en tu proyecto, ejecuta esto antes:
-- CREATE EXTENSION IF NOT EXISTS unaccent;

-- Verificacion: lista las selecciones que quedaron mapeadas a ESPN
SELECT id, name, external_id
FROM public.clubs
WHERE external_id LIKE 'espn-soccer-team-%'
ORDER BY name;
