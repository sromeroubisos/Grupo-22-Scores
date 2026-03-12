# Arquitectura Profesional de Clubs

## 📋 Tabla de Contenidos

1. [El Problema](#el-problema)
2. [La Solución](#la-solución)
3. [Estructura de Datos](#estructura-de-datos)
4. [Flujo de Trabajo](#flujo-de-trabajo)
5. [Ejemplos de Uso](#ejemplos-de-uso)
6. [Validaciones](#validaciones)
7. [Best Practices](#best-practices)

---

## El Problema

### ❌ Lo que NO hacer

```typescript
// MAL: Enviar todo el objeto con 60 campos (muchos vacíos)
const handleSave = async () => {
  await supabase.from('clubs').update({
    name: form.name,
    short_name: form.short_name,
    city: form.city,
    // ... 57 campos más
    website: '', // ⚠️ Pisás el valor existente con ""
    instagram: '', // ⚠️ Pisás el valor existente con ""
    // ... etc
  }).eq('id', clubId);
};
```

**Consecuencias:**
- ❌ Pisás datos existentes con `null` o `""` sin querer
- ❌ Es difícil saber qué cambió y qué no
- ❌ La DB termina con datos inconsistentes (URLs sin https, country inválidos, slug con espacios, etc.)
- ❌ Performance malo (envías 60 campos cuando solo cambiaron 2)

---

## La Solución

### ✅ Diseño Profesional por Capas

```
┌─────────────────────────────────────────┐
│  CAPA 1: CLUBS (CORE)                  │
│  Campos esenciales + búsqueda frecuente │
│  - name, slug, entity_type, country     │
│  - logo_url, union_id, visibility       │
│  - source, lifecycle, etc.              │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  CAPA 2: CLUB_PROFILE                  │
│  Datos extensos (contacto, redes, venue)│
│  - admin_contact_email, phone           │
│  - website, instagram, x, youtube       │
│  - venue_name, capacity, notes          │
└─────────────────────────────────────────┘
              ↓
┌─────────────────────────────────────────┐
│  CAPA 3: ARRAYS NORMALIZADOS           │
│  - club_aliases (nombres alternativos)  │
│  - club_secondary_unions (uniones extra)│
└─────────────────────────────────────────┘
```

### Principios Clave

1. **CREATE mínimo**: Solo campos esenciales
2. **UPDATE parcial (PATCH)**: Solo campos modificados
3. **Normalización centralizada**: Antes de comparar y guardar
4. **Validaciones en frontend + DB**: Seguridad en capas
5. **Dirty tracking por sección**: Cada card maneja su estado

---

## Estructura de Datos

### 📦 Tablas en Supabase

#### 1. `clubs` (CORE)

```sql
CREATE TABLE public.clubs (
  id TEXT PRIMARY KEY,

  -- Identidad
  name TEXT NOT NULL CHECK (char_length(name) >= 2),
  short_name TEXT,
  slug TEXT NOT NULL UNIQUE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('club','seleccion','academia','franquicia')),
  sport TEXT NOT NULL DEFAULT 'rugby',

  -- Ubicación
  country TEXT NOT NULL DEFAULT 'ARG',
  region TEXT,
  city TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,

  -- Organización
  union_id TEXT,

  -- Medios
  logo_url TEXT,
  primary_color TEXT,

  -- Integraciones
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','api','import')),
  external_id TEXT,
  last_sync_at TIMESTAMPTZ,
  sync_status TEXT,

  -- Estado
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible','hidden')),
  lifecycle TEXT NOT NULL DEFAULT 'draft' CHECK (lifecycle IN ('draft','published','active','archived')),

  notes_internal TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 2. `club_profile` (DETALLE)

```sql
CREATE TABLE public.club_profile (
  club_id TEXT PRIMARY KEY REFERENCES clubs(id) ON DELETE CASCADE,

  -- Contacto admin
  admin_contact_name TEXT,
  admin_contact_email TEXT,
  admin_contact_phone TEXT,

  -- Links y redes
  website TEXT,
  instagram TEXT,
  x_url TEXT,
  youtube TEXT,
  tiktok TEXT,

  -- Venue
  venue_name TEXT,
  venue_address TEXT,
  venue_capacity INTEGER,
  venue_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 3. `club_aliases` (ARRAY NORMALIZADO)

```sql
CREATE TABLE public.club_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  alias TEXT NOT NULL CHECK (char_length(alias) >= 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(club_id, alias)
);
```

#### 4. `club_secondary_unions` (ARRAY NORMALIZADO)

```sql
CREATE TABLE public.club_secondary_unions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id TEXT NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  union_id TEXT NOT NULL REFERENCES unions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(club_id, union_id)
);
```

---

## Flujo de Trabajo

### 📝 CREATE (Nuevo Club)

**Campos bloqueantes:**
- `name` (>= 2 chars)
- `slug` (no vacío, kebab-case, único)
- `entity_type`
- `sport` (default: 'rugby')
- `country` (default: 'ARG')
- Si `source = 'api'` entonces `external_id` es obligatorio

```typescript
import { createClub } from '@/lib/services/clubService';

const result = await createClub({
  name: 'Jockey Club de Rosario',
  slug: 'jockey-club-rosario',
  entity_type: 'club',
  sport: 'rugby',
  country: 'ARG',
  city: 'Rosario',
  union_id: 'urr',
  visibility: 'visible',
  lifecycle: 'draft',
});

if (result.success) {
  console.log('Club creado:', result.club);
  // Redirigir a /admin/entities/{clubId}/manage?tab=identidad
} else {
  console.error('Error:', result.error);
  // Mostrar errores de validación
}
```

### ✏️ EDIT/MANAGE (Editar Club)

**Patrón: PATCH parcial por sección**

```typescript
import { useClubForm } from '@/hooks/useClubForm';

function ClubEditForm({ clubId }: { clubId: string }) {
  const {
    core,
    profile,
    aliases,
    updateCore,
    updateProfile,
    setAliases,
    save,
    isDirty,
    isCoreDirty,
    isProfileDirty,
    loading,
    saving,
  } = useClubForm({ clubId });

  if (loading) return <div>Cargando...</div>;

  return (
    <div>
      {/* CARD 1: Identidad (Core) */}
      <section>
        <h2>Identidad</h2>
        <input
          value={core.name || ''}
          onChange={(e) => updateCore({ name: e.target.value })}
        />
        <input
          value={core.city || ''}
          onChange={(e) => updateCore({ city: e.target.value })}
        />
        {isCoreDirty && <span>• Cambios sin guardar</span>}
      </section>

      {/* CARD 2: Contacto (Profile) */}
      <section>
        <h2>Contacto</h2>
        <input
          value={profile.website || ''}
          onChange={(e) => updateProfile({ website: e.target.value })}
        />
        <input
          value={profile.instagram || ''}
          onChange={(e) => updateProfile({ instagram: e.target.value })}
        />
        {isProfileDirty && <span>• Cambios sin guardar</span>}
      </section>

      {/* CARD 3: Aliases */}
      <section>
        <h2>Nombres alternativos</h2>
        {/* List/edit aliases */}
      </section>

      {/* Botón Guardar Global */}
      <button
        onClick={save}
        disabled={!isDirty || saving}
      >
        {saving ? 'Guardando...' : 'Guardar Cambios'}
      </button>
    </div>
  );
}
```

---

## Ejemplos de Uso

### Ejemplo 1: Detectar campos sucios manualmente

```typescript
import { buildPatch } from '@/lib/utils/buildPatch';
import { normalizeText, normalizeSlug } from '@/lib/utils/normalize';

const initial = {
  name: 'SIC',
  city: 'Rosario',
  logo_url: null,
};

const current = {
  name: 'SIC',
  city: 'Rosario ', // espacio extra
  logo_url: '', // usuario borró el campo
};

const patch = buildPatch(initial, current, {
  name: normalizeText,
  city: normalizeText,
  logo_url: normalizeText,
});

console.log(patch);
// {} (vacío porque city normalizado es igual, y logo "" → null = igual)
```

### Ejemplo 2: Sync de arrays (aliases)

```typescript
import { buildArrayPatch } from '@/lib/utils/buildPatch';

const initialAliases = ['SIC', 'San Isidro'];
const currentAliases = ['San Isidro', 'San Isidro Club'];

const diff = buildArrayPatch(initialAliases, currentAliases);

console.log(diff);
// { add: ['San Isidro Club'], remove: ['SIC'] }

// Luego en el backend:
if (diff.add.length > 0) {
  await supabase.from('club_aliases').insert(
    diff.add.map(alias => ({ club_id: clubId, alias }))
  );
}

if (diff.remove.length > 0) {
  await supabase.from('club_aliases').delete()
    .eq('club_id', clubId)
    .in('alias', diff.remove);
}
```

### Ejemplo 3: Normalización de URLs

```typescript
import { normalizeUrl } from '@/lib/utils/normalize';

normalizeUrl('google.com'); // → 'https://google.com'
normalizeUrl('www.google.com'); // → 'https://www.google.com'
normalizeUrl('https://google.com'); // → 'https://google.com' (sin cambios)
normalizeUrl(''); // → null
normalizeUrl(null); // → null
```

---

## Validaciones

### Frontend (UX rápido)

```typescript
import { validateClubCreate } from '@/lib/validation/clubValidation';

const validation = validateClubCreate({
  name: 'S',
  slug: 'sic',
  entity_type: 'club',
});

console.log(validation);
// {
//   valid: false,
//   errors: [
//     { field: 'name', message: 'El nombre debe tener al menos 2 caracteres', level: 'error' }
//   ],
//   warnings: [
//     { field: 'country', message: 'Se recomienda especificar el país', level: 'warning' }
//   ]
// }
```

### DB (seguridad)

Las mismas validaciones se replican en constraints SQL:

```sql
-- name mínimo 2 chars
CHECK (char_length(name) >= 2)

-- slug único
CREATE UNIQUE INDEX clubs_slug_unique ON clubs (slug);

-- external_id único (cuando NO es null)
CREATE UNIQUE INDEX clubs_external_id_unique ON clubs (external_id)
  WHERE external_id IS NOT NULL;

-- source válido
CHECK (source IN ('manual', 'api', 'import'))
```

---

## Best Practices

### ✅ DO

1. **Siempre normaliza antes de comparar y guardar**
   ```typescript
   const patch = buildPatch(initial, current, {
     name: normalizeText,
     slug: normalizeSlug,
     website: normalizeUrl,
   });
   ```

2. **Valida antes de enviar al backend**
   ```typescript
   const validation = validateClubCoreUpdate(patch);
   if (!validation.valid) {
     // Mostrar errores
     return;
   }
   ```

3. **Usa dirty tracking por sección**
   ```typescript
   const isCoreDirty = !isPatchEmpty(corePatch);
   const isProfileDirty = !isPatchEmpty(profilePatch);
   ```

4. **Maneja errores de slug duplicado**
   ```typescript
   if (error.code === '23505' && error.message.includes('slug')) {
     alert('El slug ya existe. Elige uno diferente.');
   }
   ```

5. **Sincroniza arrays con diff (no borrar + reinsertar todo)**
   ```typescript
   const aliasesDiff = buildArrayPatch(initialAliases, currentAliases);
   // Solo envías { add: [...], remove: [...] }
   ```

### ❌ DON'T

1. **No envíes todos los campos en UPDATE**
   ```typescript
   // MAL
   await supabase.from('clubs').update({ ...fullObject }).eq('id', clubId);
   ```

2. **No compares sin normalizar**
   ```typescript
   // MAL
   if (current.city !== initial.city) { ... }

   // BIEN
   if (normalizeText(current.city) !== normalizeText(initial.city)) { ... }
   ```

3. **No guardes "" en campos opcionales** (usar null)
   ```typescript
   // MAL
   logo_url: ''

   // BIEN
   logo_url: null
   ```

4. **No borres y reinsertes arrays completos**
   ```typescript
   // MAL
   await supabase.from('club_aliases').delete().eq('club_id', clubId);
   await supabase.from('club_aliases').insert([...]);

   // BIEN
   const diff = buildArrayPatch(initial, current);
   // Solo add/remove lo que cambió
   ```

---

## Health / Completeness

Calculá el estado de salud de un club (no requiere guardarlo):

```typescript
import { calculateClubHealth } from '@/lib/validation/clubValidation';

const health = calculateClubHealth(core, profile);

console.log(health);
// {
//   status: 'warning', // 'error' | 'warning' | 'ok'
//   errors: [], // Errores bloqueantes
//   warnings: ['Sin logo', 'Sin redes sociales'],
//   completeness: 75 // 0-100%
// }

// En UI:
<div className={health.status === 'error' ? 'text-red-500' : 'text-yellow-500'}>
  {health.completeness}% completo
</div>
```

---

## Archivos del Sistema

```
supabase/
  migrations/
    20260224000000_normalize_clubs_structure.sql  # Migración SQL

src/
  lib/
    types/
      clubs.ts                # Tipos TypeScript
    utils/
      normalize.ts            # Normalización
      buildPatch.ts           # Dirty tracking
    validation/
      clubValidation.ts       # Validaciones
    services/
      clubService.ts          # DB operations
  hooks/
    useClubForm.ts            # React hook para forms

docs/
  CLUBS_ARCHITECTURE.md       # Este documento
```

---

## Migración: Aplicar a la DB

```bash
# Conectarte a tu Supabase
supabase db push

# O ejecutar manualmente en SQL Editor:
# Copiar contenido de: supabase/migrations/20260224000000_normalize_clubs_structure.sql
```

---

## FAQ

### ¿Qué pasa si el usuario borra un campo y lo deja vacío?

Se normaliza a `null`, que es el valor correcto para campos opcionales.

### ¿Cómo sé si un campo cambió realmente?

Usa `buildPatch()` con normalizers. Solo te devuelve campos realmente diferentes.

### ¿Puedo usar esto para tournaments/players?

Sí, es el mismo patrón. Adapta los tipos y validaciones.

### ¿Qué pasa con RLS?

Las políticas RLS existentes aplican. Super admin puede todo, admins de club/unión solo su scope.

### ¿Cómo manejo el logo (Storage)?

1. Usuario sube a Supabase Storage (`club-logos/{clubId}/logo.png`)
2. Obtenés URL pública
3. Actualizas `logo_url` en `clubs` table

---

## Contacto

Para dudas o mejoras, consulta la documentación completa o revisa los archivos de ejemplo.
