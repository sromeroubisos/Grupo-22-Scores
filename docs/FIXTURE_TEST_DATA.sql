-- ============================================
-- DATOS DE PRUEBA PARA FIXTURE
-- ============================================
-- Ejecutar este SQL en Supabase Studio para crear datos de prueba

-- ─── PASO 1: Crear Torneo de Prueba ──────────────────────────────────────

-- Verificar si ya existe, si no, crear uno
INSERT INTO public.tournaments (id, name, season, sport, status, is_visible)
VALUES (
  '00000000-0000-0000-0000-000000000001', -- UUID fijo para pruebas
  'Torneo del Interior A',
  '2026',
  'rugby',
  'active',
  true
)
ON CONFLICT (id) DO NOTHING;

-- ─── PASO 2: Crear Clubes de Prueba ──────────────────────────────────────

INSERT INTO public.clubs (id, name, short_name, founded, city, country)
VALUES
  ('tala-rc', 'Tala Rugby Club', 'TALA', 1948, 'Córdoba', 'Argentina'),
  ('jockey-cc', 'Jockey Club Córdoba', 'JOCKEY', 1885, 'Córdoba', 'Argentina'),
  ('la-tablada', 'La Tablada', 'TABLADA', 1925, 'Córdoba', 'Argentina'),
  ('uru-cure', 'Universitario Curé', 'URÚ CURÉ', 1945, 'Córdoba', 'Argentina'),
  ('tucuman-rc', 'Tucumán Rugby Club', 'TUCUMÁN', 1944, 'Tucumán', 'Argentina'),
  ('duendes', 'Duendes RC', 'DUENDES', 1978, 'Rosario', 'Argentina'),
  ('marista', 'Marista RC', 'MARISTA', 1960, 'Mendoza', 'Argentina'),
  ('curne', 'CURNE', 'CURNE', 1952, 'Neuquén', 'Argentina')
ON CONFLICT (id) DO NOTHING;

-- ─── PASO 3: Agregar Participantes al Torneo ─────────────────────────────

INSERT INTO public.tournament_participants (tournament_id, club_id, status)
SELECT '00000000-0000-0000-0000-000000000001', id, 'active'
FROM public.clubs
WHERE id IN ('tala-rc', 'jockey-cc', 'la-tablada', 'uru-cure', 'tucuman-rc', 'duendes', 'marista', 'curne')
ON CONFLICT (tournament_id, club_id) DO NOTHING;

-- ─── PASO 4: Crear Fase de Grupos ────────────────────────────────────────

INSERT INTO public.tournament_phases (id, tournament_id, name, phase_type, order_index, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000002', -- UUID fijo para fase
  '00000000-0000-0000-0000-000000000001',
  'Fase de Grupos',
  'group_stage',
  0,
  true
)
ON CONFLICT (id) DO NOTHING;

-- ─── PASO 5: Generar 7 Jornadas Automáticamente ──────────────────────────

SELECT public.generate_rounds_for_phase(
  '00000000-0000-0000-0000-000000000002'::uuid,
  7,
  'Fecha {n}'
);

-- ─── PASO 6: Crear Algunos Partidos de Ejemplo ───────────────────────────

-- Obtener el ID de la primera jornada
DO $$
DECLARE
  v_round_1_id UUID;
  v_round_2_id UUID;
BEGIN
  -- Obtener IDs de las primeras jornadas
  SELECT id INTO v_round_1_id
  FROM public.tournament_rounds
  WHERE phase_id = '00000000-0000-0000-0000-000000000002'
    AND order_index = 1
  LIMIT 1;

  SELECT id INTO v_round_2_id
  FROM public.tournament_rounds
  WHERE phase_id = '00000000-0000-0000-0000-000000000002'
    AND order_index = 2
  LIMIT 1;

  -- Insertar partidos para Fecha 1
  INSERT INTO public.matches (
    tournament_id,
    phase_id,
    round_uuid,
    home_club_id,
    away_club_id,
    date_time,
    venue,
    pitch,
    status,
    score
  )
  VALUES
    -- Partido 1
    (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      v_round_1_id,
      'tala-rc',
      'jockey-cc',
      '2026-04-12 16:00:00+00',
      'Córdoba - Sede Sur',
      'Cancha Principal',
      'scheduled',
      '{"home": 0, "away": 0}'::jsonb
    ),
    -- Partido 2
    (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      v_round_1_id,
      'la-tablada',
      'uru-cure',
      '2026-04-12 16:00:00+00',
      'Córdoba - El Bosque',
      'Cancha 1',
      'live',
      '{"home": 14, "away": 10}'::jsonb
    ),
    -- Partido 3
    (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      v_round_1_id,
      'tucuman-rc',
      'duendes',
      '2026-04-12 16:00:00+00',
      'Tucumán',
      NULL,
      'final',
      '{"home": 21, "away": 18}'::jsonb
    ),
    -- Partido 4
    (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      v_round_1_id,
      'marista',
      'curne',
      '2026-04-13 15:30:00+00',
      'Mendoza',
      'Estadio Marista',
      'suspended',
      '{"home": 0, "away": 0}'::jsonb
    );

  -- Insertar partidos para Fecha 2
  INSERT INTO public.matches (
    tournament_id,
    phase_id,
    round_uuid,
    home_club_id,
    away_club_id,
    date_time,
    venue,
    status,
    score
  )
  VALUES
    (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      v_round_2_id,
      'jockey-cc',
      'la-tablada',
      '2026-04-19 16:00:00+00',
      'Córdoba - Jockey Club',
      'scheduled',
      '{"home": 0, "away": 0}'::jsonb
    ),
    (
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      v_round_2_id,
      'uru-cure',
      'tala-rc',
      '2026-04-19 16:00:00+00',
      'Córdoba - Universitario',
      'scheduled',
      '{"home": 0, "away": 0}'::jsonb
    );

  RAISE NOTICE 'Partidos de ejemplo creados exitosamente';
END;
$$;

-- ─── PASO 7: Crear Fase de Playoffs (Opcional) ───────────────────────────

INSERT INTO public.tournament_phases (id, tournament_id, name, phase_type, order_index, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000003', -- UUID fijo para playoffs
  '00000000-0000-0000-0000-000000000001',
  'Playoffs',
  'playoff',
  1,
  false
)
ON CONFLICT (id) DO NOTHING;

-- Crear rondas de playoffs manualmente
INSERT INTO public.tournament_rounds (phase_id, name, order_index)
VALUES
  ('00000000-0000-0000-0000-000000000003', 'Cuartos de Final', 1),
  ('00000000-0000-0000-0000-000000000003', 'Semifinales', 2),
  ('00000000-0000-0000-0000-000000000003', 'Gran Final', 3)
ON CONFLICT DO NOTHING;

-- ─── VERIFICACIÓN ────────────────────────────────────────────────────────

-- Ver estructura del fixture creado
SELECT * FROM public.get_tournament_fixture('00000000-0000-0000-0000-000000000001');

-- Ver partidos de la primera jornada
SELECT
  r.name as jornada,
  m.date_time,
  hc.name as local,
  ac.name as visitante,
  m.venue as sede,
  m.status as estado,
  m.score
FROM public.matches m
JOIN public.tournament_rounds r ON r.id = m.round_uuid
JOIN public.clubs hc ON hc.id = m.home_club_id
JOIN public.clubs ac ON ac.id = m.away_club_id
WHERE m.tournament_id = '00000000-0000-0000-0000-000000000001'
ORDER BY r.order_index, m.date_time;

-- ============================================
-- LIMPIEZA (Ejecutar si quieres borrar todo)
-- ============================================

/*
-- Descomentar para limpiar datos de prueba
DELETE FROM public.matches WHERE tournament_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM public.tournament_rounds WHERE phase_id IN (
  SELECT id FROM public.tournament_phases WHERE tournament_id = '00000000-0000-0000-0000-000000000001'
);
DELETE FROM public.tournament_phases WHERE tournament_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM public.tournament_participants WHERE tournament_id = '00000000-0000-0000-0000-000000000001';
DELETE FROM public.tournaments WHERE id = '00000000-0000-0000-0000-000000000001';
DELETE FROM public.clubs WHERE id IN ('tala-rc', 'jockey-cc', 'la-tablada', 'uru-cure', 'tucuman-rc', 'duendes', 'marista', 'curne');
*/
