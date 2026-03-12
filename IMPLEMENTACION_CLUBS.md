# 🎯 Implementación del Sistema Profesional de Clubs

## ✅ Lo que YA está hecho (copiar y pegar)

He creado una arquitectura completa y profesional para resolver el problema de "pisar datos" en clubes. Todo el código está listo para usar.

---

## 📂 Archivos creados

### 1. **Base de Datos (SQL)**
- ✅ `supabase/migrations/20260224000000_normalize_clubs_structure.sql`
- ✅ `supabase/migrations/20260225180000_ensure_club_sport_column.sql` ← **NUEVO: CORRECCIÓN SPORT**
- ✅ `supabase/EJECUTAR_MIGRACION_CLUBS.sql` ← **EJECUTAR ESTE EN SUPABASE STUDIO**

### 2. **TypeScript Types**
- ✅ `src/lib/types/clubs.ts` (ClubCore, ClubProfile, ClubCreateInput, ClubUpdateInput, etc.)

### 3. **Utilidades de Normalización**
- ✅ `src/lib/utils/normalize.ts` (normalizeText, normalizeUrl, normalizeSlug, etc.)

### 4. **Dirty Field Detection**
- ✅ `src/lib/utils/buildPatch.ts` (buildPatch, buildArrayPatch, isPatchEmpty, etc.)

### 5. **Validaciones**
- ✅ `src/lib/validation/clubValidation.ts` (validateClubCreate, validateClubCoreUpdate, calculateClubHealth)

### 6. **Servicios de DB**
- ✅ `src/lib/services/clubService.ts` (createClub, updateClub, fetchClubFull) ← **CON AUTO-FIX DE ESQUEMA**

### 7. **React Hook**
- ✅ `src/hooks/useClubForm.ts` (hook completo para forms con dirty tracking)

### 8. **Documentación**
- ✅ `docs/CLUBS_ARCHITECTURE.md` (documentación completa del sistema)
- ✅ `IMPLEMENTACION_CLUBS.md` (este archivo)

---

## 🚀 Pasos para implementar

### PASO 1: Aplicar migración SQL (5 minutos)

1. Abrir Supabase Studio: https://supabase.com/dashboard/project/YOUR_PROJECT_ID/sql/new
2. Copiar TODO el contenido de `supabase/EJECUTAR_MIGRACION_CLUBS.sql`
3. Pegar en SQL Editor
4. Hacer clic en "Run"
5. ✅ Verificar que no hay errores

**Resultado:** Tendrás 4 tablas nuevas/actualizadas:
- `clubs` (con nuevos campos)
- `club_profile` (nueva)
- `club_aliases` (nueva)
- `club_secondary_unions` (nueva)

---

### PASO 2: Usar en tus componentes (copiar ejemplo)

#### Ejemplo: Formulario de edición

```typescript
// src/app/admin/entities/[id]/manage/page.tsx
import { useClubForm } from '@/hooks/useClubForm';

export default function ClubManagePage({ params }: { params: { id: string } }) {
  const {
    core,
    profile,
    updateCore,
    updateProfile,
    save,
    isDirty,
    loading,
    saving,
  } = useClubForm({
    clubId: params.id,
    onSaveSuccess: (club) => {
      alert('✅ Guardado exitosamente!');
    },
    onSaveError: (error) => {
      alert('❌ Error: ' + error);
    },
  });

  if (loading) return <div>Cargando...</div>;

  return (
    <div className="space-y-6">
      {/* CARD: Identidad */}
      <section className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-bold mb-4">Identidad</h2>

        <div className="space-y-4">
          <div>
            <label>Nombre</label>
            <input
              className="border p-2 w-full"
              value={core.name || ''}
              onChange={(e) => updateCore({ name: e.target.value })}
            />
          </div>

          <div>
            <label>Ciudad</label>
            <input
              className="border p-2 w-full"
              value={core.city || ''}
              onChange={(e) => updateCore({ city: e.target.value })}
            />
          </div>

          <div>
            <label>Slug</label>
            <input
              className="border p-2 w-full"
              value={core.slug || ''}
              onChange={(e) => updateCore({ slug: e.target.value })}
            />
          </div>
        </div>
      </section>

      {/* CARD: Contacto */}
      <section className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-bold mb-4">Contacto y Redes</h2>

        <div className="space-y-4">
          <div>
            <label>Sitio Web</label>
            <input
              className="border p-2 w-full"
              value={profile.website || ''}
              onChange={(e) => updateProfile({ website: e.target.value })}
              placeholder="www.ejemplo.com (se normalizará a https://)"
            />
          </div>

          <div>
            <label>Instagram</label>
            <input
              className="border p-2 w-full"
              value={profile.instagram || ''}
              onChange={(e) => updateProfile({ instagram: e.target.value })}
              placeholder="@usuario o https://instagram.com/usuario"
            />
          </div>
        </div>
      </section>

      {/* Botón Guardar */}
      <div className="flex justify-end gap-4">
        {isDirty && (
          <span className="text-orange-600 flex items-center gap-2">
            • Cambios sin guardar
          </span>
        )}

        <button
          onClick={save}
          disabled={!isDirty || saving}
          className={`px-6 py-2 rounded ${
            isDirty && !saving
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    </div>
  );
}
```

---

### PASO 3: Crear nuevo club

```typescript
// src/app/admin/entities/new/page.tsx
import { createClub } from '@/lib/services/clubService';
import { useState } from 'react';

export default function NewClubPage() {
  const [form, setForm] = useState({
    name: '',
    slug: '',
    entity_type: 'club' as const,
    city: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const result = await createClub({
      name: form.name,
      slug: form.slug,
      entity_type: form.entity_type,
      city: form.city,
      country: 'ARG',
      sport: 'rugby',
      visibility: 'visible',
      lifecycle: 'draft',
    });

    if (result.success) {
      alert('✅ Club creado!');
      // Redirigir a manage
      window.location.href = `/admin/entities/${result.club?.id}/manage`;
    } else {
      alert('❌ Error: ' + result.error);

      // Mostrar errores de validación
      if (result.validationErrors) {
        console.log('Errores:', result.validationErrors);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-6">
      <div>
        <label>Nombre *</label>
        <input
          className="border p-2 w-full"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </div>

      <div>
        <label>Slug *</label>
        <input
          className="border p-2 w-full"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          placeholder="jockey-club-rosario"
          required
        />
      </div>

      <div>
        <label>Tipo de Entidad *</label>
        <select
          className="border p-2 w-full"
          value={form.entity_type}
          onChange={(e) => setForm({ ...form, entity_type: e.target.value as any })}
        >
          <option value="club">Club</option>
          <option value="seleccion">Selección</option>
          <option value="academia">Academia</option>
          <option value="franquicia">Franquicia</option>
        </select>
      </div>

      <div>
        <label>Ciudad</label>
        <input
          className="border p-2 w-full"
          value={form.city}
          onChange={(e) => setForm({ ...form, city: e.target.value })}
        />
      </div>

      <button
        type="submit"
        className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
      >
        Crear Club
      </button>
    </form>
  );
}
```

---

## 🎯 Ventajas del nuevo sistema

### ✅ Antes vs Después

| Antes ❌ | Después ✅ |
|---------|-----------|
| Envías 60 campos en UPDATE | Solo envías los 2-3 campos que cambiaron |
| Pisas datos existentes con `null` o `""` | Normalizas y solo actualizas lo modificado |
| No sabes qué cambió | Dirty tracking por sección |
| URLs sin protocolo, slugs con espacios | Normalización automática |
| Sin validaciones | Validación en frontend + DB |
| Código difícil de mantener | Código modular y testeado |

---

## 📊 Ejemplo de lo que pasa internamente

### Usuario edita solo la ciudad

```typescript
// Estado inicial (del servidor)
const initial = {
  name: 'Jockey Club Rosario',
  city: 'Rosario',
  website: 'https://jockeyclubrosario.com.ar',
  instagram: null,
  // ... 56 campos más
};

// Usuario edita solo city
const current = {
  name: 'Jockey Club Rosario',
  city: 'Rosario, Santa Fe', // ← SOLO ESTE CAMBIÓ
  website: 'https://jockeyclubrosario.com.ar',
  instagram: null,
  // ... 56 campos más
};

// buildPatch detecta SOLO el campo modificado
const patch = buildPatch(initial, current, { city: normalizeText });

console.log(patch);
// { city: 'Rosario, Santa Fe' } ← SOLO ESTE SE ENVÍA

// UPDATE en DB:
UPDATE clubs SET city = 'Rosario, Santa Fe', updated_at = NOW() WHERE id = 'jcr';
```

---

## 🧪 Testing rápido

### Test 1: Normalización de URLs

```typescript
import { normalizeUrl } from '@/lib/utils/normalize';

console.log(normalizeUrl('google.com')); // → 'https://google.com'
console.log(normalizeUrl('www.google.com')); // → 'https://www.google.com'
console.log(normalizeUrl('')); // → null
```

### Test 2: Detección de dirty fields

```typescript
import { buildPatch } from '@/lib/utils/buildPatch';
import { normalizeText } from '@/lib/utils/normalize';

const initial = { name: 'SIC', city: 'Rosario' };
const current = { name: 'SIC', city: 'Rosario ' }; // espacio extra

const patch = buildPatch(initial, current, { city: normalizeText });

console.log(patch); // {} (vacío porque city normalizado es igual)
```

### Test 3: Validación

```typescript
import { validateClubCreate } from '@/lib/validation/clubValidation';

const validation = validateClubCreate({
  name: 'S', // muy corto
  slug: 'sic',
  entity_type: 'club',
});

console.log(validation.valid); // false
console.log(validation.errors); // [{ field: 'name', message: '...' }]
```

---

## 📚 Documentación completa

Lee [`docs/CLUBS_ARCHITECTURE.md`](docs/CLUBS_ARCHITECTURE.md) para:
- Diseño detallado de las tablas
- Ejemplos de uso avanzados
- Best practices
- FAQ

---

## 🆘 Troubleshooting

### Error: "slug ya existe"

El sistema detecta automáticamente slugs duplicados y devuelve un error de validación:

```typescript
if (result.validationErrors) {
  const slugError = result.validationErrors.find(e => e.field === 'slug');
  if (slugError) {
    alert('El slug ya existe. Prueba con: ' + form.slug + '-2');
  }
}
```

### Error: "external_id obligatorio cuando source=api"

Si el club viene de una API externa, debes proveer `external_id`:

```typescript
await createClub({
  // ...
  source: 'api',
  external_id: 'flashscore_12345', // ← obligatorio
});
```

### URLs no se guardan con https://

El sistema normaliza automáticamente. Si guardas `"google.com"`, se convierte a `"https://google.com"`.

---

## 🎉 ¡Listo para usar!

1. ✅ Ejecuta la migración SQL (PASO 1)
2. ✅ Copia los ejemplos de código (PASO 2 y 3)
3. ✅ Adapta a tus componentes existentes
4. ✅ Disfruta del sistema profesional sin pisar datos

---

## 📞 Soporte

- Para entender el diseño: lee `docs/CLUBS_ARCHITECTURE.md`
- Para ejemplos de código: revisa `src/hooks/useClubForm.ts`
- Para validaciones: revisa `src/lib/validation/clubValidation.ts`

**El sistema está 100% completo y listo para copiar/pegar. No necesitas escribir código adicional.**
