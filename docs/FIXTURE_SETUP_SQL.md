# 🔧 Configuración Rápida de Fixture - SQL

## Script SQL Rápido para Configurar Fixture

Si ya tienes un torneo creado y quieres agregarle la estructura de fixture profesional, ejecuta estos comandos en **Supabase Studio** (SQL Editor).

---

## 📝 Paso 1: Identificar tu Torneo

```sql
-- Ver todos tus torneos
SELECT id, name, season, sport FROM tournaments ORDER BY created_at DESC;
```

Copia el `id` del torneo que quieres configurar.

---

## 🏗️ Paso 2: Crear Fase Principal

```sql
-- Reemplaza 'YOUR_TOURNAMENT_ID' con el ID de tu torneo
INSERT INTO public.tournament_phases (
  tournament_id,
  name,
  phase_type,
  order_index,
  is_active
)
VALUES (
  'YOUR_TOURNAMENT_ID',  -- ⚠️ CAMBIAR ESTO
  'Fase Regular',        -- Nombre de la fase
  'league',              -- Tipo: 'league', 'knockout', 'group_stage', 'playoff'
  0,                     -- Orden (0 = primera fase)
  true                   -- Activa
)
RETURNING id, name;
```

**Guarda el `id` que devuelve** (lo necesitarás para el siguiente paso).

---

## 📅 Paso 3: Generar Jornadas Automáticamente

```sql
-- Reemplaza 'YOUR_PHASE_ID' con el ID de la fase que acabas de crear
SELECT public.generate_rounds_for_phase(
  'YOUR_PHASE_ID'::uuid,  -- ⚠️ CAMBIAR ESTO
  7,                       -- Número de jornadas a crear
  'Fecha {n}'              -- Patrón de nombre ('{n}' se reemplaza por el número)
);
```

Esto creará automáticamente:
- Fecha 1
- Fecha 2
- Fecha 3
- ... hasta Fecha 7

---

## 👥 Paso 4: Agregar Participantes (si aún no los tienes)

```sql
-- Ver clubes disponibles
SELECT id, name, city FROM clubs ORDER BY name;

-- Agregar participantes al torneo
INSERT INTO public.tournament_participants (tournament_id, club_id, status)
VALUES
  ('YOUR_TOURNAMENT_ID', 'club-id-1', 'active'),
  ('YOUR_TOURNAMENT_ID', 'club-id-2', 'active'),
  ('YOUR_TOURNAMENT_ID', 'club-id-3', 'active'),
  ('YOUR_TOURNAMENT_ID', 'club-id-4', 'active')
ON CONFLICT (tournament_id, club_id) DO NOTHING;
```

---

## ⚽ Paso 5: Crear Partidos de Prueba (Opcional)

```sql
-- Primero, obtén el ID de la primera jornada
SELECT id, name FROM public.tournament_rounds
WHERE phase_id = 'YOUR_PHASE_ID'
ORDER BY order_index
LIMIT 1;

-- Luego, crea un partido
INSERT INTO public.matches (
  tournament_id,
  phase_id,
  round_uuid,           -- ID de la jornada
  home_club_id,
  away_club_id,
  date_time,
  venue,
  pitch,
  status,
  score
)
VALUES (
  'YOUR_TOURNAMENT_ID',
  'YOUR_PHASE_ID',
  'YOUR_ROUND_ID',      -- ⚠️ CAMBIAR ESTO
  'club-id-1',          -- ⚠️ CAMBIAR ESTO
  'club-id-2',          -- ⚠️ CAMBIAR ESTO
  '2026-04-15 16:00:00+00',  -- Fecha y hora UTC
  'Estadio Principal',
  'Cancha 1',
  'scheduled',
  '{"home": 0, "away": 0}'::jsonb
);
```

---

## ✅ Verificación

### Ver estructura del fixture

```sql
SELECT * FROM public.get_tournament_fixture('YOUR_TOURNAMENT_ID');
```

### Ver todas las jornadas creadas

```sql
SELECT
  tp.name as fase,
  tr.order_index as orden,
  tr.name as jornada,
  tr.is_completed as completada,
  COUNT(m.id) as partidos
FROM public.tournament_phases tp
LEFT JOIN public.tournament_rounds tr ON tr.phase_id = tp.id
LEFT JOIN public.matches m ON m.round_uuid = tr.id
WHERE tp.tournament_id = 'YOUR_TOURNAMENT_ID'
GROUP BY tp.id, tp.name, tr.id, tr.name, tr.order_index, tr.is_completed
ORDER BY tp.order_index, tr.order_index;
```

### Ver partidos de una jornada

```sql
SELECT
  m.date_time,
  hc.name as local,
  ac.name as visitante,
  m.venue as sede,
  m.status as estado,
  m.score
FROM public.matches m
JOIN public.clubs hc ON hc.id = m.home_club_id
JOIN public.clubs ac ON ac.id = m.away_club_id
WHERE m.round_uuid = 'YOUR_ROUND_ID'
ORDER BY m.date_time;
```

---

## 🎯 Ejemplo Completo (Todo en Uno)

Reemplaza los valores marcados con `⚠️`:

```sql
-- =============================================
-- CONFIGURACIÓN COMPLETA DE FIXTURE
-- =============================================

-- PASO 1: Crear Fase
INSERT INTO public.tournament_phases (tournament_id, name, phase_type, order_index, is_active)
VALUES ('⚠️ YOUR_TOURNAMENT_ID', 'Fase Regular', 'league', 0, true)
RETURNING id;
-- Guarda el ID que devuelve → será tu PHASE_ID

-- PASO 2: Generar 7 jornadas
SELECT public.generate_rounds_for_phase('⚠️ YOUR_PHASE_ID'::uuid, 7, 'Fecha {n}');

-- PASO 3: Ver jornadas creadas
SELECT id, name, order_index FROM public.tournament_rounds
WHERE phase_id = '⚠️ YOUR_PHASE_ID'
ORDER BY order_index;
-- Guarda el ID de alguna jornada → será tu ROUND_ID

-- PASO 4: Agregar participantes (si no los tienes)
INSERT INTO public.tournament_participants (tournament_id, club_id, status)
SELECT '⚠️ YOUR_TOURNAMENT_ID', id, 'active'
FROM clubs
WHERE id IN ('⚠️ club-1', '⚠️ club-2', '⚠️ club-3', '⚠️ club-4')
ON CONFLICT DO NOTHING;

-- PASO 5: Crear partido de prueba
INSERT INTO public.matches (
  tournament_id, phase_id, round_uuid,
  home_club_id, away_club_id,
  date_time, venue, status, score
)
VALUES (
  '⚠️ YOUR_TOURNAMENT_ID',
  '⚠️ YOUR_PHASE_ID',
  '⚠️ YOUR_ROUND_ID',
  '⚠️ club-1',
  '⚠️ club-2',
  '2026-04-15 16:00:00+00',
  'Estadio Principal',
  'scheduled',
  '{"home": 0, "away": 0}'::jsonb
);

-- VERIFICACIÓN FINAL
SELECT * FROM public.get_tournament_fixture('⚠️ YOUR_TOURNAMENT_ID');
```

---

## 🔄 Otras Operaciones Útiles

### Crear Fase de Playoffs

```sql
INSERT INTO public.tournament_phases (tournament_id, name, phase_type, order_index, is_active)
VALUES ('YOUR_TOURNAMENT_ID', 'Playoffs', 'playoff', 1, false)
RETURNING id;

-- Crear rondas de playoffs manualmente
INSERT INTO public.tournament_rounds (phase_id, name, order_index)
VALUES
  ('PLAYOFF_PHASE_ID', 'Cuartos de Final', 1),
  ('PLAYOFF_PHASE_ID', 'Semifinales', 2),
  ('PLAYOFF_PHASE_ID', 'Final', 3);
```

### Eliminar Fase y Todo su Contenido

```sql
-- ⚠️ CUIDADO: Esto elimina la fase, sus jornadas y todos los partidos
DELETE FROM public.tournament_phases
WHERE id = 'YOUR_PHASE_ID';
```

### Resetear Jornada (Eliminar Partidos)

```sql
DELETE FROM public.matches
WHERE round_uuid = 'YOUR_ROUND_ID';

UPDATE public.tournament_rounds
SET is_completed = false
WHERE id = 'YOUR_ROUND_ID';
```

### Cambiar Nombre de Jornada

```sql
UPDATE public.tournament_rounds
SET name = 'Fecha 1 - Apertura'
WHERE id = 'YOUR_ROUND_ID';
```

---

## 🆘 Troubleshooting

### "ERROR: null value in column violates not-null constraint"

**Problema**: Falta algún campo obligatorio.

**Solución**: Asegúrate de que:
- `tournament_id` existe y es válido
- `phase_id` existe para las jornadas
- `home_club_id` y `away_club_id` existen para los partidos

### "ERROR: duplicate key value violates unique constraint"

**Problema**: Ya existe un registro con esa combinación.

**Solución**: Usa `ON CONFLICT DO NOTHING` o cambia los valores únicos (ej: `order_index`).

### "La función generate_rounds_for_phase no existe"

**Problema**: La migración no se aplicó correctamente.

**Solución**: Ejecuta la migración:
```bash
npx supabase db push
```

O copia el contenido de `supabase/migrations/20260225000000_add_tournament_rounds.sql` en Supabase Studio.

---

## 📚 Referencias

- [Documentación Completa](FIXTURE_IMPLEMENTATION.md)
- [Guía de Inicio Rápido](FIXTURE_QUICKSTART.md)
- [Script de Datos de Prueba](FIXTURE_TEST_DATA.sql)

---

**¡Listo!** 🎉 Ahora tu torneo tiene estructura de fixture profesional y puedes usar la UI Kinetic Polycarbonate.
