-- Los 7 triples que la corrida en seco no pudo resolver — 60 partidos.
--
-- OJO: NO es un archivo de mapeo listo para aplicar. Al deducir el destino de
-- cada triple apareció que los 7 clubes de G22 **no existen**. No falta la fila
-- que ata el equipo al triple: falta el equipo.
--
-- Son equipos que URBA publicó en los 35 torneos de segunda rueda posteriores a
-- la generación de las altas. Por eso el bloque 1 crea clubes y el bloque 2 los
-- mapea, EN ESE ORDEN. Se revisa y se aplica a mano; nada de esto corrió.
--
-- Los nombres siguen la convención heredada de los hermanos ya cargados
-- (`SIC M16 "A"` -> `SIC M16 "E"`), no una regla inventada acá.

-- ════════════════════════════════════════════════════════════════════════════
-- BLOQUE 1 — los 7 clubes que faltan
--
-- `is_visible = FALSE` como el resto de la carga: se prenden en la etapa 6, y
-- sólo los que tengan partidos.
--
-- DOS CASOS PIDEN TU CRITERIO ANTES DE CORRER ESTO:
--
--   a) `g-y-e-de-ituzaingo-m17` ya existe SIN sufijo, y ahora URBA publica
--      "G y E de Ituzaingo A" y "B". ¿El registro sin letra pasa a ser el "A",
--      o quedan tres (sin letra + A + B)? Acá se asume lo segundo —crear A y B
--      y dejar el viejo quieto— porque nunca inventamos la letra. Si preferís
--      renombrar el existente, este bloque cambia.
--
--   b) Sociedad Hebraica, Rivadavia de Lobos y Obras Sanitarias no tienen NINGÚN
--      juvenil cargado: hoy sólo existen como institución. Sus equipos vienen
--      sin sufijo, así que el registro va sin letra.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO public.clubs (id, name, short_name, slug, union_id, sport, sport_id, logo_url, is_visible)
SELECT v.id, v.name, v.name, v.id, 'urba', 'rugby', 'rugby', c.logo_url, FALSE
FROM (VALUES
  ('club-pucara-m15-d',        'Club Pucará M15 "D"',        'club-pucara-m15-a'),
  ('sic-m16-e',                'SIC M16 "E"',                'sic-m16-a'),
  ('g-y-e-de-ituzaingo-m17-a', 'G y E de Ituzaingo M17 "A"', 'g-y-e-de-ituzaingo-m17'),
  ('g-y-e-de-ituzaingo-m17-b', 'G y E de Ituzaingo M17 "B"', 'g-y-e-de-ituzaingo-m17'),
  ('sociedad-hebraica-m16',    'Sociedad Hebraica M16',      'sociedad-hebraica'),
  ('rivadavia-de-lobos-m15',   'Rivadavia de Lobos M15',     'rivadavia-de-lobos'),
  ('obras-sanitarias-m17',     'Obras Sanitarias M17',       'obras-sanitarias')
) AS v(id, name, modelo)
JOIN public.clubs c ON c.id = v.modelo   -- hereda el logo del club de referencia
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- VERIFICACIÓN DEL BLOQUE 1
-- SELECT id, name, union_id, is_visible, logo_url IS NOT NULL AS con_logo
-- FROM public.clubs
-- WHERE id IN ('club-pucara-m15-d','sic-m16-e','g-y-e-de-ituzaingo-m17-a',
--              'g-y-e-de-ituzaingo-m17-b','sociedad-hebraica-m16',
--              'rivadavia-de-lobos-m15','obras-sanitarias-m17');
-- esperado: 7 filas, union_id='urba', is_visible=false, con_logo=true


-- ════════════════════════════════════════════════════════════════════════════
-- BLOQUE 2 — el mapeo, DESPUÉS del bloque 1
--
-- El FK a clubs(id) hace de red: si el bloque 1 no corrió, esto falla en vez de
-- dejar un mapeo colgado.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO public.club_external_ids (provider, external_id, club_id, urba_club_id, categoria, sufijo, confidence) VALUES
  ('urba', '16|M15|D', 'club-pucara-m15-d',        16, 'M15', 'D', 'exacto'),  -- "Pucara D"
  ('urba', '1|M16|E',  'sic-m16-e',                 1, 'M16', 'E', 'exacto'),  -- "SIC E"
  ('urba', '59|M17|A', 'g-y-e-de-ituzaingo-m17-a', 59, 'M17', 'A', 'exacto'),  -- "G y E de Ituzaingo A"
  ('urba', '59|M17|B', 'g-y-e-de-ituzaingo-m17-b', 59, 'M17', 'B', 'exacto'),  -- "G y E de Ituzaingo B"
  ('urba', '81|M16|',  'sociedad-hebraica-m16',    81, 'M16', '',  'exacto'),  -- "Socidad Hebraica" (sic, así lo publica URBA)
  ('urba', '88|M15|',  'rivadavia-de-lobos-m15',   88, 'M15', '',  'exacto'),  -- "Rivadavia de Lobos"
  ('urba', '90|M17|',  'obras-sanitarias-m17',     90, 'M17', '',  'exacto')   -- "Obras Sanitarias"
ON CONFLICT (provider, external_id) DO NOTHING;

COMMIT;

-- VERIFICACIÓN DEL BLOQUE 2
-- SELECT count(*) FROM public.club_external_ids WHERE provider = 'urba';
-- esperado: 1532 + 7 = 1539
--
-- Después de esto, volver a correr la corrida en seco: los 60 partidos omitidos
-- por equipo no resuelto tienen que bajar a 0.

-- ROLLBACK (en orden inverso: primero el mapeo, después los clubes)
-- DELETE FROM public.club_external_ids WHERE provider='urba' AND external_id IN
--   ('16|M15|D','1|M16|E','59|M17|A','59|M17|B','81|M16|','88|M15|','90|M17|');
-- DELETE FROM public.clubs WHERE id IN
--   ('club-pucara-m15-d','sic-m16-e','g-y-e-de-ituzaingo-m17-a',
--    'g-y-e-de-ituzaingo-m17-b','sociedad-hebraica-m16',
--    'rivadavia-de-lobos-m15','obras-sanitarias-m17');
