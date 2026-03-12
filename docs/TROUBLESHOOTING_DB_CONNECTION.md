# 🔍 Troubleshooting: Panel de Super Admin no carga datos

## 🎯 Síntomas

Clubs, torneos y partidos **no se están cargando** en el panel de super administrador (`/admin/super`).

---

## ✅ Verificaciones Inmediatas

### **1. Verifica que el servidor esté corriendo**

```bash
# Debe estar en puerto 3000 o 3001
http://localhost:3000/admin/super
```

### **2. Abre la consola del navegador (F12)**

```
Consola → Busca errores en rojo
```

**Errores comunes:**

| Error | Causa | Solución |
|-------|-------|----------|
| `Failed to fetch` | Servidor no corriendo | `npm run dev` |
| `401 Unauthorized` | No estás logueado | Hacer login en `/login` |
| `403 Forbidden` | No eres super_admin | Verificar rol en DB |
| `AbortError` | Navegaste antes de que termine la carga | Esperar o refrescar página |
| `Network error` | Problema de conectividad | Verificar .env.local |

### **3. Verifica las variables de entorno**

```bash
# Ver archivo .env.local
cat .env.local
```

**Debe contener:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**⚠️ Si falta o está mal → copiar de Supabase Dashboard:**
1. https://supabase.com/dashboard/project/YOUR_PROJECT/settings/api
2. Copiar "Project URL" y "anon public"
3. Pegar en `.env.local`
4. Reiniciar servidor: `Ctrl+C` y `npm run dev`

---

## 🔧 Diagnóstico Paso a Paso

### **PASO 1: Verificar que el usuario esté autenticado**

Abre la consola del navegador (F12) y ejecuta:

```javascript
// Ver usuario actual
const supabase = (await import('@/lib/supabase/client')).createClient();
const { data: { user } } = await supabase.auth.getUser();
console.log('Usuario actual:', user);
```

**Resultado esperado:**
```javascript
{
  id: "uuid-...",
  email: "tu@email.com",
  // ...
}
```

**Si `user` es `null`:**
- No estás logueado → Hacer login en `/login`

---

### **PASO 2: Verificar que seas super_admin**

```javascript
const supabase = (await import('@/lib/supabase/client')).createClient();
const { data: profile } = await supabase
  .from('users')
  .select('role')
  .eq('id', (await supabase.auth.getUser()).data.user.id)
  .single();

console.log('Tu rol:', profile?.role);
```

**Resultado esperado:**
```javascript
"super_admin"
```

**Si NO eres super_admin:**
- Ejecutar en Supabase SQL Editor:
```sql
UPDATE public.users SET role = 'super_admin' WHERE email = 'tu@email.com';
```

---

### **PASO 3: Verificar que las queries funcionen**

```javascript
const supabase = (await import('@/lib/supabase/client')).createClient();

// Test clubs
const { data: clubs, error: clubsError } = await supabase
  .from('clubs')
  .select('id, name')
  .limit(5);

console.log('Clubs:', clubs, clubsError);

// Test tournaments
const { data: tournaments, error: tournamentsError } = await supabase
  .from('tournaments')
  .select('id, name')
  .limit(5);

console.log('Tournaments:', tournaments, tournamentsError);

// Test matches
const { data: matches, error: matchesError } = await supabase
  .from('matches')
  .select('id, date_time')
  .limit(5);

console.log('Matches:', matches, matchesError);
```

**Resultado esperado:**
```javascript
Clubs: [ { id: "...", name: "..." }, ... ] null
Tournaments: [ { id: "...", name: "..." }, ... ] null
Matches: [ { id: "...", date_time: "..." }, ... ] null
```

**Si hay errores:**

| Error | Solución |
|-------|----------|
| `relation "clubs" does not exist` | Ejecutar migraciones: ver `supabase/EJECUTAR_EN_STUDIO.sql` |
| `permission denied for table clubs` | RLS mal configurado, ejecutar policies |
| `null` pero `error` es `null` | Tablas vacías, agregar datos de prueba |

---

### **PASO 4: Limpiar caché del navegador**

```javascript
// Limpiar caché de superAdminCache
const { invalidateAll } = await import('@/lib/cache/superAdminCache');
invalidateAll();

// Limpiar sessionStorage
sessionStorage.clear();

// Limpiar localStorage (opcional, borra filtros guardados)
localStorage.removeItem('super_console_filters');

// Recargar página
location.reload();
```

---

### **PASO 5: Verificar RLS policies**

Las tablas deben tener políticas RLS que permitan SELECT a super_admin:

```sql
-- Ejecutar en Supabase SQL Editor para verificar
SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('clubs', 'tournaments', 'matches')
  AND cmd = 'SELECT';
```

**Debe mostrar políticas como:**
```
clubs      | clubs_public_read          | SELECT | (is_visible = true)
clubs      | clubs_super_admin_all      | SELECT | (SELECT role FROM users WHERE id = auth.uid()) = 'super_admin'
```

**Si NO hay políticas de super_admin:**
- Ejecutar [`supabase/EJECUTAR_EN_STUDIO.sql`](../supabase/EJECUTAR_EN_STUDIO.sql)

---

## 🚀 Soluciones Rápidas

### **Solución 1: Reiniciar todo (80% de los casos)**

```bash
# 1. Cerrar navegador completamente
# 2. Matar proceso de Next.js
Ctrl+C en la terminal del servidor

# 3. Limpiar caché de Next.js
rm -rf .next
# Windows:
rmdir /s /q .next

# 4. Reiniciar servidor
npm run dev

# 5. Abrir navegador en modo incógnito
Ctrl+Shift+N (Chrome) o Ctrl+Shift+P (Firefox)

# 6. Hacer login de nuevo
http://localhost:3000/login
```

---

### **Solución 2: Verificar cambios recientes en server.ts**

El archivo [`src/lib/supabase/server.ts`](../src/lib/supabase/server.ts) debe tener:

```typescript
auth: {
  autoRefreshToken: false,
  detectSessionInUrl: false,
  persistSession: true,  // ⚠️ DEBE ser true
}
```

**Si `persistSession: false` → cambiar a `true` y reiniciar servidor**

---

### **Solución 3: Modo de emergencia (bypass caché)**

Si nada funciona, prueba en un componente temporal:

```typescript
// src/app/admin/super/debug/page.tsx
'use client';
import { createClient } from '@/lib/supabase/client';
import { useEffect, useState } from 'react';

export default function DebugPage() {
  const [clubs, setClubs] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    supabase.from('clubs').select('id, name').limit(10)
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setClubs(data || []);
      });
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>Debug - Clubs</h1>
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
      <pre>{JSON.stringify(clubs, null, 2)}</pre>
    </div>
  );
}
```

**Acceder a:** `http://localhost:3000/admin/super/debug`

**Si muestra datos → el problema es en el caché/context**
**Si NO muestra datos → el problema es en Supabase/RLS**

---

## 📊 Checklist de Verificación

- [ ] Servidor corriendo (`npm run dev`)
- [ ] Logueado en `/login`
- [ ] Rol `super_admin` en DB
- [ ] Variables de entorno `.env.local` correctas
- [ ] Consola del navegador sin errores
- [ ] Caché limpiado (`invalidateAll()`)
- [ ] RLS policies existen para super_admin
- [ ] Tablas tienen datos (al menos 1 club, 1 torneo, 1 partido)

---

## 🆘 Si nada funciona

1. **Exporta los logs:**
   - Consola del navegador (F12 → Consola → Screenshot)
   - Terminal del servidor (`npm run dev` output)

2. **Verifica la conexión directa a Supabase:**
   ```bash
   curl "https://tu-proyecto.supabase.co/rest/v1/clubs?select=id,name&limit=1" \
     -H "apikey: TU_ANON_KEY" \
     -H "Authorization: Bearer TU_ANON_KEY"
   ```

3. **Revisa el historial de cambios:**
   ```bash
   git log --oneline -10
   git diff HEAD~1 src/lib/supabase/server.ts
   ```

---

## ✅ Estado Esperado

Después de las verificaciones, deberías ver:

```
✅ Usuario logueado como super_admin
✅ Consola sin errores
✅ Panel de super admin muestra clubs/torneos/partidos
✅ Puedes navegar entre tabs sin problemas
```

---

**Última actualización:** 2026-02-24
**Archivos relacionados:**
- [`src/lib/supabase/server.ts`](../src/lib/supabase/server.ts)
- [`src/lib/supabase/client.ts`](../src/lib/supabase/client.ts)
- [`src/lib/cache/superAdminCache.ts`](../src/lib/cache/superAdminCache.ts)
- [`src/app/admin/super/SuperConsoleContext.tsx`](../src/app/admin/super/SuperConsoleContext.tsx)
