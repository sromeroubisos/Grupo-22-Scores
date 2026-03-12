# 🚀 Fixture Management - Quick Start

## Guía de Inicio Rápido

### 1️⃣ Aplicar Migración SQL

```bash
# Opción A: Supabase CLI (recomendado)
npx supabase db push

# Opción B: Manualmente en Supabase Studio
# 1. Abrir https://supabase.com/dashboard/project/YOUR_PROJECT/sql/new
# 2. Copiar contenido de: supabase/migrations/20260225000000_add_tournament_rounds.sql
# 3. Ejecutar
```

### 2️⃣ Crear Datos de Prueba

```bash
# Opción A: Ejecutar script completo
# 1. Abrir Supabase Studio SQL Editor
# 2. Copiar contenido de: docs/FIXTURE_TEST_DATA.sql
# 3. Ejecutar

# Opción B: Crear manualmente paso a paso (ver abajo)
```

### 3️⃣ Verificar en la UI

1. Navegar a: `http://localhost:3000/admin/entities/00000000-0000-0000-0000-000000000001/manage`
2. Click en tab **"Fixture"**
3. Deberías ver:
   - Header con "Torneo del Interior A · 2026"
   - Sidebar con "Fase de Grupos" → Fecha 1-7
   - Tabla de partidos
   - Diseño Kinetic Polycarbonate activo

---

## 📝 Creación Manual Paso a Paso

Si prefieres crear datos manualmente:

### A. Crear un Torneo

```sql
INSERT INTO public.tournaments (name, season, sport, status, is_visible)
VALUES ('Mi Torneo', '2026', 'rugby', 'active', true)
RETURNING id; -- Guardar este ID
```

### B. Agregar Clubes Participantes

```sql
-- Primero, asegúrate de tener clubes en tu DB
INSERT INTO public.clubs (id, name, short_name, city, country)
VALUES
  ('club-1', 'Club A', 'CLA', 'Ciudad A', 'Argentina'),
  ('club-2', 'Club B', 'CLB', 'Ciudad B', 'Argentina');

-- Luego, agrégalos al torneo
INSERT INTO public.tournament_participants (tournament_id, club_id)
VALUES
  ('YOUR_TOURNAMENT_ID', 'club-1'),
  ('YOUR_TOURNAMENT_ID', 'club-2');
```

### C. Crear Fase

```sql
INSERT INTO public.tournament_phases (tournament_id, name, phase_type, order_index, is_active)
VALUES ('YOUR_TOURNAMENT_ID', 'Fase Regular', 'league', 0, true)
RETURNING id; -- Guardar este ID
```

### D. Generar Jornadas Automáticamente

```sql
SELECT public.generate_rounds_for_phase(
  'YOUR_PHASE_ID'::uuid,
  7,  -- Número de jornadas
  'Fecha {n}' -- Patrón de nombre
);
```

### E. Crear Partido de Prueba

```sql
-- Primero, obtén el ID de una jornada
SELECT id, name FROM public.tournament_rounds
WHERE phase_id = 'YOUR_PHASE_ID'
ORDER BY order_index
LIMIT 1;

-- Luego, crea un partido
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
VALUES (
  'YOUR_TOURNAMENT_ID',
  'YOUR_PHASE_ID',
  'YOUR_ROUND_ID',
  'club-1',
  'club-2',
  '2026-04-15 16:00:00+00',
  'Estadio Principal',
  'scheduled',
  '{"home": 0, "away": 0}'::jsonb
);
```

---

## 🎯 Casos de Uso Comunes

### Crear Torneo con Fixture Completo

```sql
-- 1. Torneo
INSERT INTO tournaments (id, name, season, sport)
VALUES ('torneo-1', 'Torneo Regional 2026', '2026', 'rugby');

-- 2. Fase
INSERT INTO tournament_phases (id, tournament_id, name, phase_type, order_index)
VALUES ('fase-1', 'torneo-1', 'Liga Regular', 'league', 0);

-- 3. Generar 14 fechas
SELECT generate_rounds_for_phase('fase-1'::uuid, 14, 'Jornada {n}');

-- 4. Agregar equipos (suponiendo que ya existen)
INSERT INTO tournament_participants (tournament_id, club_id)
SELECT 'torneo-1', id FROM clubs WHERE country = 'Argentina' LIMIT 8;
```

### Resetear una Jornada

```sql
-- Eliminar todos los partidos de una jornada
DELETE FROM matches WHERE round_uuid = 'YOUR_ROUND_ID';

-- Marcar jornada como no completada
UPDATE tournament_rounds
SET is_completed = false
WHERE id = 'YOUR_ROUND_ID';
```

### Ver Fixture Completo

```sql
SELECT
  tp.name as fase,
  tr.name as jornada,
  COUNT(m.id) as partidos
FROM tournament_phases tp
LEFT JOIN tournament_rounds tr ON tr.phase_id = tp.id
LEFT JOIN matches m ON m.round_uuid = tr.id
WHERE tp.tournament_id = 'YOUR_TOURNAMENT_ID'
GROUP BY tp.id, tp.name, tr.id, tr.name, tr.order_index
ORDER BY tp.order_index, tr.order_index;
```

---

## 🐛 Solución de Problemas

### "No se muestran las jornadas en el sidebar"

**Causa**: La fase no tiene jornadas creadas

**Solución**:
```sql
-- Verificar que la fase tiene jornadas
SELECT * FROM tournament_rounds WHERE phase_id = 'YOUR_PHASE_ID';

-- Si está vacío, generar jornadas
SELECT generate_rounds_for_phase('YOUR_PHASE_ID'::uuid, 7, 'Fecha {n}');
```

### "No puedo crear partidos desde la UI"

**Causa**: No hay participantes en el torneo

**Solución**:
```sql
-- Verificar participantes
SELECT * FROM tournament_participants WHERE tournament_id = 'YOUR_TOURNAMENT_ID';

-- Agregar participantes
INSERT INTO tournament_participants (tournament_id, club_id, status)
VALUES ('YOUR_TOURNAMENT_ID', 'club-id', 'active');
```

### "Error: round_uuid no es una columna válida"

**Causa**: La migración no se aplicó correctamente

**Solución**:
```bash
# Aplicar migración
npx supabase db push

# O manualmente en Supabase Studio:
# Ejecutar supabase/migrations/20260225000000_add_tournament_rounds.sql
```

### "El diseño no se ve con glass morphism"

**Causa**: CSS no está cargando

**Solución**:
1. Verificar que `fixture-kinetic.css` está en la carpeta correcta
2. Verificar que `TournamentFixtureTab.tsx` tiene: `import './fixture-kinetic.css'`
3. Limpiar cache del navegador: Ctrl+F5
4. Revisar console del navegador para errores CSS

---

## 📸 Vista Previa

Cuando todo está configurado correctamente, deberías ver:

### Header
```
Torneo del Interior A · 2026   [Activo]
Fase Actual: Fase de Grupos · Fecha 3

[Calendario] [Generar Fixture] [+ Crear Partido]
```

### Sidebar
```
FASE DE GRUPOS
  Fecha 1        8
  Fecha 2        8
  Fecha 3        8  ← (activa)
  Fecha 4        0

PLAYOFFS
  Cuartos        4
  Semifinales    2
  Gran Final     1
```

### Tabla de Partidos
```
Fecha/Hora  Local       Visitante   Sede           Estado
12/04       Tala RC     Jockey CC   Córdoba        ● Programado  ✏️
16:00

12/04       La Tablada  Urú Curé    El Bosque      ● En Vivo     ✏️
16:00
```

---

## 🎨 Paleta de Colores

Si quieres personalizar los colores del diseño Kinetic:

```css
/* En fixture-kinetic.css */

:root {
  --fixture-accent-cyan: #00f2ff;     /* Acento principal */
  --fixture-accent-green: #39ff14;    /* Finalizado */
  --fixture-accent-red: #ff3131;      /* Suspendido */
  --fixture-accent-yellow: #faff00;   /* En vivo */
}
```

---

## ✅ Checklist de Verificación

Antes de reportar un problema, verifica:

- [ ] Migración SQL aplicada (`tournament_rounds` existe)
- [ ] Torneo creado y visible
- [ ] Fase creada y activa
- [ ] Jornadas generadas (al menos 1)
- [ ] Participantes agregados al torneo
- [ ] Al menos 1 partido creado
- [ ] CSS cargando correctamente (fondo oscuro visible)
- [ ] No hay errores en console del navegador
- [ ] No hay errores en Network tab (API calls)

---

## 🆘 Ayuda

Si sigues teniendo problemas:

1. **Revisar logs del servidor**: `console.log` en API routes
2. **Revisar console del navegador**: Errores de JavaScript/Network
3. **Verificar base de datos**: Ejecutar queries de verificación arriba
4. **Reiniciar dev server**: `npm run dev`

---

**Happy Coding!** 🏉⚽🏀
