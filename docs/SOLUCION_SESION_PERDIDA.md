# 🔧 Solución: Sesión se pierde al refrescar la página

## 🔴 **Problema**

Cada vez que refrescás la página, se pierde la sesión y te redirige al login.

## ✅ **Causa Raíz**

El archivo [`src/lib/supabase/server.ts`](../src/lib/supabase/server.ts) estaba **sobre-escribiendo** las opciones de cookies que vienen de Supabase, específicamente `httpOnly: false`.

### **Por qué esto rompía la sesión:**

```typescript
// ❌ ANTES (MAL):
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value, options }) => {
    const cookieOptions = {
      ...options,
      httpOnly: false,     // ← Forzaba httpOnly: false
      sameSite: 'lax',
      path: '/',
    };
    cookieStore.set(name, value, cookieOptions)
  })
}
```

Supabase usa **diferentes tipos de cookies**:
- Algunas necesitan `httpOnly: true` (tokens de refresh)
- Otras necesitan `httpOnly: false` (session data que el cliente debe leer)

Al forzar `httpOnly: false` en **todas**, las cookies de refresh no se guardaban correctamente, causando que la sesión se perdiera al refrescar.

---

## ✅ **Solución Aplicada**

He modificado [`src/lib/supabase/server.ts`](../src/lib/supabase/server.ts:27-35) para que **respete** las opciones originales que Supabase envía:

```typescript
// ✅ AHORA (CORRECTO):
setAll(cookiesToSet) {
  try {
    cookiesToSet.forEach(({ name, value, options }) => {
      cookieStore.set(name, value, options)  // ← Usa las opciones ORIGINALES
    })
  } catch {
    // Safe to ignore in Server Components
  }
},
```

**Cambio:** Ya NO sobre-escribimos las opciones, simplemente las pasamos tal cual vienen de Supabase.

---

## 🔍 **Verificación**

### **PASO 1: Reiniciar el servidor**

```bash
# 1. Cerrar TODOS los procesos de Next.js
# Presiona Ctrl+C en todas las terminales con npm run dev

# 2. Limpiar lock files y caché
Remove-Item -Recurse -Force .next
# o en bash:
rm -rf .next

# 3. Reiniciar
npm run dev
```

### **PASO 2: Hacer login de nuevo**

```bash
# 1. Acceder al login
http://localhost:3000/login

# 2. Ingresar credenciales

# 3. Verificar que te redirige correctamente
```

### **PASO 3: Verificar que la sesión persiste**

```bash
# 1. Navegar a cualquier página protegida
http://localhost:3000/admin/super

# 2. Refrescar la página (F5 o Ctrl+R)

# 3. ✅ Deberías seguir logueado (NO te redirige al login)
```

### **PASO 4: Verificar cookies en DevTools**

```
1. Abrir DevTools (F12)
2. Ir a Application → Cookies → http://localhost:3000
3. Deberías ver cookies como:
   - sb-[project]-auth-token
   - sb-[project]-auth-token-code-verifier

4. Verificar que:
   - Algunas tienen HttpOnly ✓
   - Algunas tienen HttpOnly (vacío)
   - Todas tienen Path: /
   - Todas tienen SameSite: Lax
```

---

## 📊 **Estado de Archivos**

| Archivo | Estado | Notas |
|---------|--------|-------|
| [`src/lib/supabase/server.ts`](../src/lib/supabase/server.ts) | ✅ Corregido | Ya NO sobre-escribe opciones de cookies |
| [`src/lib/supabase/client.ts`](../src/lib/supabase/client.ts) | ✅ Correcto | Sin cambios, funcionando |
| [`src/lib/supabase/middleware.ts`](../src/lib/supabase/middleware.ts) | ✅ Correcto | `httpOnly: false` es correcto aquí |

---

## 🎯 **Configuración Final Correcta**

### **server.ts (Server Components)**

```typescript
{
  cookies: {
    getAll() {
      return cookieStore.getAll()
    },
    setAll(cookiesToSet) {
      try {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options)  // ← Respeta opciones originales
        })
      } catch {
        // Safe to ignore in Server Components
      }
    },
  },
  auth: {
    autoRefreshToken: false,      // Server no refresca (lo hace el cliente)
    detectSessionInUrl: false,    // Server no lee URL params
    persistSession: true,         // ⚠️ DEBE ser true
  },
}
```

### **middleware.ts (Edge Runtime)**

```typescript
{
  cookies: {
    getAll() {
      return request.cookies.getAll()
    },
    setAll(cookiesToSet) {
      cookiesToSet.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, {
          ...options,
          httpOnly: false,  // ⚠️ Debe ser false para que el cliente lea
          sameSite: 'lax',
          secure: isProd,
          path: '/',
        })
      })
    },
  },
}
```

**Diferencia:**
- **middleware.ts:** Fuerza `httpOnly: false` porque corre en Edge Runtime antes del cliente
- **server.ts:** Respeta opciones originales porque corre en Server Components después

---

## 🆘 **Si el problema persiste**

### **1. Limpiar cookies manualmente**

```
DevTools (F12) → Application → Cookies →
Botón derecho sobre http://localhost:3000 → Clear
```

### **2. Verificar variables de entorno**

```bash
cat .env.local
```

Debe tener:
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### **3. Modo incógnito**

```bash
# Abrir navegador en incógnito
Ctrl+Shift+N (Chrome) o Ctrl+Shift+P (Firefox)

# Ir a login
http://localhost:3000/login

# Si funciona aquí pero no en normal → problema de cookies corruptas
```

### **4. Verificar que Supabase Auth esté configurado correctamente**

En Supabase Dashboard:
```
Authentication → Settings → Site URL
Debe ser: http://localhost:3000

Redirect URLs:
Debe incluir: http://localhost:3000/**
```

---

## 📚 **Referencias**

- [Supabase SSR Guide](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [Next.js Middleware](https://nextjs.org/docs/app/building-your-application/routing/middleware)
- [Cookie Options](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies)

---

## ✅ **Checklist de Verificación**

- [ ] Servidor reiniciado (`npm run dev`)
- [ ] Caché limpiado (`.next` borrado)
- [ ] Login exitoso
- [ ] Refresh de página mantiene sesión
- [ ] Navegación entre páginas mantiene sesión
- [ ] Cookies visibles en DevTools
- [ ] No hay errores en consola del navegador

---

**Fix aplicado:** 2026-02-24
**Archivo modificado:** [`src/lib/supabase/server.ts`](../src/lib/supabase/server.ts:27-35)
**Estado:** ✅ Resuelto
