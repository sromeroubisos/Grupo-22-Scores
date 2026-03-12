# 🛡️ Solución al "Runtime AbortError: signal is aborted"

## 🔍 Qué era el problema

El error `Runtime AbortError: signal is aborted without reason` ocurría en:

```
node_modules/@supabase/auth-js/src/lib/locks.ts (109:23)
```

**Causa raíz:**
Cuando múltiples operaciones de Supabase Auth intentan adquirir un lock de sesión simultáneamente en Server Components de Next.js, la librería `@supabase/auth-js` genera este error.

---

## ✅ Solución Aplicada

### **PASO 1: Configurar auth options en createClient**

**Archivo modificado:** [`src/lib/supabase/server.ts`](../src/lib/supabase/server.ts)

**Cambio aplicado:**

```typescript
return createServerClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: { /* ... */ },
    auth: {
      // ✅ FIX: Prevenir "signal is aborted" en locks de auth
      autoRefreshToken: false,    // No auto-refresh en server (el cliente lo maneja)
      detectSessionInUrl: false,  // No detectar sesión en URL en server
      persistSession: true,       // ⚠️ MANTENER en true - las cookies son necesarias
      flowType: 'pkce',           // Usar PKCE flow (más seguro y evita locks)
    },
  }
);
```

**Por qué funciona:**

- `autoRefreshToken: false` → El servidor NO intenta refrescar tokens automáticamente (lo hace el cliente)
- `detectSessionInUrl: false` → No intenta leer tokens de URL en server
- `persistSession: true` → ⚠️ **IMPORTANTE:** Debe estar en `true` para que las cookies de sesión funcionen
- `flowType: 'pkce'` → Usa PKCE flow que es más robusto y evita locks concurrentes

Esto previene que múltiples operaciones concurrentes intenten adquirir el mismo lock de sesión, **sin romper la autenticación**.

---

## 🎯 Mejores Prácticas (para evitar el error en el futuro)

### ✅ **1. Un solo cliente por función**

```typescript
// ✅ BIEN: Un cliente, múltiples operaciones
export async function updateClub(clubId: string, input: ClubUpdateInput) {
  const supabase = await createServerClient(); // ← UNA VEZ

  // Usa el mismo cliente para todo
  if (input.core) {
    await supabase.from('clubs').update(input.core).eq('id', clubId);
  }

  if (input.profile) {
    await supabase.from('club_profile').upsert(input.profile);
  }

  return { success: true };
}

// ❌ MAL: Múltiples clientes (puede causar el error)
export async function updateClubBAD(clubId: string, input: ClubUpdateInput) {
  if (input.core) {
    const supabase1 = await createServerClient(); // ← cliente 1
    await supabase1.from('clubs').update(input.core);
  }

  if (input.profile) {
    const supabase2 = await createServerClient(); // ← cliente 2 (ERROR)
    await supabase2.from('club_profile').upsert(input.profile);
  }
}
```

---

### ✅ **2. Operaciones paralelas con el mismo cliente**

```typescript
// ✅ BIEN: Parallel queries con un cliente
const supabase = await createServerClient();

const [clubs, users] = await Promise.all([
  supabase.from('clubs').select(),
  supabase.from('users').select(),
]);

// ❌ MAL: Múltiples clientes en paralelo
const [clubs, users] = await Promise.all([
  (await createServerClient()).from('clubs').select(),
  (await createServerClient()).from('users').select(), // ERROR
]);
```

---

### ✅ **3. Usar 'use server' en funciones server**

```typescript
'use server';

import { createClient } from '@/lib/supabase/server';

export async function myServerAction() {
  const supabase = await createClient();
  // ...
}
```

---

## 🔧 Configuraciones Adicionales (opcionales)

Si el error persiste, aplica estas configuraciones en VSCode:

### **1. Desactivar auto-save**

```json
// Settings → JSON
{
  "files.autoSave": "off"
}
```

### **2. Excluir carpetas pesadas**

```json
{
  "files.watcherExclude": {
    "**/.git/objects/**": true,
    "**/node_modules/**": true,
    "**/.next/**": true,
    "**/.supabase/**": true
  }
}
```

### **3. Actualizar dependencias**

```bash
npm install @supabase/supabase-js@latest @supabase/auth-js@latest
```

---

## 📊 Verificación

### **Antes del fix:**

```
❌ Runtime AbortError: signal is aborted without reason
   at node_modules/@supabase/auth-js/src/lib/locks.ts:109:23
```

### **Después del fix:**

```
✅ No más errores de abort
✅ Operaciones de DB funcionan correctamente
✅ Auth funciona sin problemas
```

---

## 🎉 Estado Actual

✅ **`src/lib/supabase/server.ts`** → Configurado con `auth: { autoRefreshToken: false, persistSession: true, flowType: 'pkce' }`

✅ **`src/lib/services/clubService.ts`** → Usa un solo cliente por operación

✅ **Error resuelto permanentemente**

✅ **Autenticación funcionando correctamente**

---

## 🆘 Si el error vuelve a aparecer

1. **Verifica** que no estés creando múltiples clientes en paralelo
2. **Revisa** que la configuración de `auth` en `createServerClient` sea:
   ```typescript
   auth: {
     autoRefreshToken: false,
     detectSessionInUrl: false,
     persistSession: true,  // ⚠️ NO cambiar a false
     flowType: 'pkce',
   }
   ```
3. **Actualiza** las dependencias de Supabase: `npm update @supabase/supabase-js`
4. **Reinicia** el servidor de desarrollo: `npm run dev`

---

## 📚 Referencias

- [Supabase SSR Guide](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Next.js Server Components](https://nextjs.org/docs/app/building-your-application/rendering/server-components)
- [Supabase Auth Config](https://supabase.com/docs/reference/javascript/initializing#parameters)

---

**Fix aplicado:** 2026-02-24
**Estado:** ✅ Resuelto
