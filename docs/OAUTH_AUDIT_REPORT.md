# Auditoría de Flujo OAuth — G22 Scores

> **Fecha:** 2026-04-28  
> **Alcance:** Autenticación/Autorización vía OAuth (Google, Apple, Facebook) + flujo de sesión completo.  
> **Tecnologías:** Next.js 15 (App Router), Supabase Auth (@supabase/ssr), PKCE.

---

## 1. Estado General del Flujo OAuth

| Aspecto | Estado | Nota |
|---------|--------|------|
| Inicio del flujo | ✅ Funcional | Botón de Google en `/login` dispara `signInWithOAuth()` |
| Redirección al proveedor | ✅ Funcional | Supabase construye la URL con PKCE + `state` interno |
| Callback / retorno | ⚠️ Funcional con riesgos | Recibe `code` e intercambia por sesión; manejo de errores mínimo |
| Intercambio de token | ✅ Funcional | `exchangeCodeForSession` en servidor; tokens en cookies HTTP-only |
| Creación/vinculación de usuario | ✅ Funcional | `syncUserProfile` crea/actualiza tabla `users` vía `service_role` |
| Persistencia de sesión | ⚠️ Funcional con riesgos | SSR cookies; refresh single-flight en cliente; **sin middleware** de protección |
| Logout | ⚠️ Parcial | Limpia estado de cliente; no hay endpoint server-side de limpieza explícita |

**Veredicto:** El flujo OAuth **funciona en el caso feliz**, pero presenta **múltiples debilidades de seguridad y mantenibilidad** que deben corregirse antes de considerarlo robusto.

---

## 2. Flujo Actual Paso a Paso

### 2.1 Inicio del flujo OAuth
- **Archivo:** `src/app/login/components/OAuthButtons.tsx`
- **Trigger:** El usuario hace clic en "Continuar con Google".
- **Parámetros enviados:**
  ```ts
  supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
          redirectTo: 'https://<origin>/api/auth/callback/google?next=/',
          skipBrowserRedirect: false,
      },
  })
  ```
- **Observaciones:**
  - `roleIntent` y `returnTo` se leen del query string de `/login` y se inyectan en `redirectTo`.
  - **Solo Google tiene botón visible.** Apple y Facebook están en el código pero no renderizados.
  - `skipBrowserRedirect: false` es redundante (valor por defecto).

### 2.2 Redirección al proveedor
- El SDK de Supabase construye la URL de autorización incluyendo automáticamente:
  - `client_id` (configurado en dashboard de Supabase)
  - `redirect_uri` = el callback configurado en el provider
  - `response_type=code`
  - `scope=openid email profile` (depende del provider)
  - `state` (generado por Supabase)
  - `code_challenge` + `code_challenge_method=S256` (PKCE)
- **El usuario es enviado correctamente al proveedor.**

### 2.3 Callback / retorno
- **Rutas:**
  - Google → `/api/auth/callback/google/route.ts`
  - Apple/Facebook → `/auth/callback/route.ts`
- **Ambos archivos contienen el código idéntico.**
- **Lógica:**
  1. Lee `code` y `next` de los query params.
  2. Llama `supabase.auth.exchangeCodeForSession(code)`.
  3. Si éxito: `syncUserProfile(data.user)` y redirect a `${origin}${next}`.
  4. Si falla: redirect a `/login?error=auth-code-error`.

### 2.4 Intercambio de token
- El servidor intercambia el `code` por tokens vía la API interna de Supabase.
- Tokens recibidos (gestión interna de Supabase):
  - `access_token`
  - `refresh_token`
  - `expires_in`
- **Persistencia:** El cliente SSR (`@supabase/ssr`) almacena la sesión en cookies HTTP-only con flags `Secure` y `SameSite=Lax` (gestionado por el SDK).
- **Exposición:** No se exponen tokens en frontend, URLs o logs de servidor. **Sí hay logs en cliente** (`console.log(data, error)`) que podrían filtrar la URL de autorización en desarrollo.

### 2.5 Creación o vinculación de usuario
- **Archivo:** `src/lib/auth/syncUserProfile.ts`
- **Lógica:**
  1. `UPDATE users SET last_login_at = NOW() WHERE id = user.id`
  2. Si afecta 0 filas → `INSERT` nuevo usuario.
  3. Si `INSERT` falla por duplicado (`23505`) → `UPDATE` de fallback.
  4. Asigna `role` reservado según email hardcodeado (`superadmin@g22scores.com`, `sromeroubisos@gmail.com`).
- **Avatar:** Se resuelve de `user_metadata.avatar_url` o `picture`.
- **Nombre:** Se resuelve de `full_name`, `name`, o parte local del email.

### 2.6 Persistencia de sesión
- **Servidor:** `src/lib/supabase/server.ts` crea un cliente SSR con `autoRefreshToken: false` y `flowType: 'pkce'`.
- **Cliente:** `src/lib/supabase/client.ts` crea un browser client con single-flight refresh para evitar 429.
- **AuthContext:** Escucha `onAuthStateChange` (SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT) y rehidrata el perfil desde la tabla `users`.

### 2.7 Logout
- `AuthContext.logout()` → `supabase.auth.signOut()` → limpia `localStorage` y estado React.
- No hay endpoint `/api/auth/logout` que invalide cookies server-side explícitamente.

---

## 3. Problemas Encontrados

### 🔴 Críticos

| # | Problema | Riesgo / Impacto | Evidencia |
|---|----------|------------------|-----------|
| 1 | **Open redirect en `sanitizeNext`** | Phishing / redirección a endpoints maliciosos dentro del mismo dominio. | `sanitizeNext` solo valida que empiece con `/` y no `//`. URLs como `/@evil.com` o `/.evil.com` pasan la validación. Aunque es same-origin, puede usarse para suplantación de UI interna. |
| 2 | **No existe `middleware.ts` de autenticación** | Cualquier ruta "protegida" solo se defiende en cliente o en cada Server Component individualmente. Bypass trivial desactivando JS o llamando la API directamente. | No hay archivo `middleware.ts` en `src/` ni en raíz del proyecto. |
| 3 | **Service Role Key en `.env.local`** | Si el archivo se filtra, un atacante tiene acceso total a la base de datos (bypass RLS). | `.env.local` contiene `SUPABASE_SERVICE_ROLE_KEY` en texto plano. |

### 🟡 Altos

| # | Problema | Riesgo / Impacto | Evidencia |
|---|----------|------------------|-----------|
| 4 | **Manejo de errores en callback insuficiente** | El usuario no recibe feedback útil. Dificulta debugging y soporte. No se diferencia entre code inválido, expirado, state mismatch, etc. | Ambos callbacks hacen `if (!error && data.user) { ... } return redirect('/login?error=auth-code-error')` sin loggear el error. |
| 5 | **Logs de cliente exponen datos OAuth** | Potencial filtración de `data.url` (URL de autorización con state/code_challenge) en consola del navegador. | `OAuthButtons.tsx` líneas 28, 37, 43: `console.log(data, error)` y `console.log(data.url)`. |
| 6 | **Falta de rate limiting en endpoints de auth** | Posible fuerza bruta de códigos OAuth o bombardeo de `/api/auth/sync-user`. | Ninguno de los routes tiene limitador de tasa (ej. `rate-limiter-flexible`). |
| 7 | **Guest cookie no se limpia en OAuth** | Un usuario que accedió previamente como guest conserva la cookie `g22_guest_club_access` después de loguearse vía OAuth. Podría causar conflictos de permisos. | `DELETE /api/auth/guest-club-family` solo se llama en `signInWithPasswordAndRedirect` (login por email). Los callbacks OAuth no lo invocan. |
| 8 | **Apple y Facebook no están habilitados en UI** | Confusión para el usuario y deuda técnica. Si se configuran en Supabase pero no hay botón, parecen disponibles cuando no lo están. | `OAuthButtons.tsx` solo renderiza el botón de Google; Apple/Facebook existen solo en el type `provider`. |

### 🟢 Medios / Menores

| # | Problema | Riesgo / Impacto | Evidencia |
|---|----------|------------------|-----------|
| 9 | **Duplicación de código en callbacks** | Dificulta mantenimiento. Un fix debe aplicarse en dos archivos. | `/api/auth/callback/google/route.ts` y `/auth/callback/route.ts` son idénticos. |
| 10 | **User enumeration en login por email** | Permite a un atacante saber si un email está registrado diferenciando "Email not confirmed" vs "Invalid login credentials". | `auth-client.ts` líneas 36-42. |
| 11 | **Falta de timeout en fetch a `/api/auth/sync-user`** | Si el endpoint cuelga, el login por email queda bloqueado indefinidamente. | `signInWithPasswordAndRedirect` hace `await fetch('/api/auth/sync-user')` sin `AbortController`. |
| 12 | **Posible loop de redirects** | Si `next=/login`, el usuario puede quedar redirigiéndose entre el callback y el login. | `sanitizeNext` no filtra `/login` ni rutas de autenticación. |
| 13 | **Falta de CSRF token en `/api/auth/sync-user`** | Aunque usa POST y SameSite=Lax, no hay token CSRF explícito. | `sync-user/route.ts` solo verifica sesión; no valida header `Origin`. |

---

## 4. Análisis de Casos de Prueba

| Caso | Resultado esperado | Resultado actual | ¿Pasa? |
|------|--------------------|------------------|--------|
| Login exitoso con Google | Sesión creada, usuario redirigido a `next`, perfil sincronizado. | ✅ Funciona en caso feliz. | Sí |
| Usuario cancela en Google | Retorno sin `code`; redirect a login con error. | ⚠️ Depende del provider. Generalmente retorna a `/login` sin `code`, mostrando "auth-code-error". | Parcial |
| Callback con error del provider | Manejo graceful, mensaje claro. | ❌ Siempre redirige a `/login?error=auth-code-error` sin detalle. | No |
| Código OAuth inválido o expirado | Mensaje específico; opción de reintentar. | ❌ Mismo error genérico. | No |
| State inválido o ausente | Rechazo de la solicitud. | ✅ Manejado internamente por Supabase (`exchangeCodeForSession` falla). | Sí (implícito) |
| Redirect URI incorrecto | Error de provider; login no procede. | ✅ Configurado en dashboard de Supabase; no es control de la app. | Sí |
| Usuario existente | Update de `last_login_at`; sesión restaurada. | ✅ `syncUserProfile` hace UPDATE. | Sí |
| Usuario nuevo | Creación en tabla `users`; onboarding mostrado. | ✅ `syncUserProfile` hace INSERT; AuthContext maneja onboarding. | Sí |
| Token expirado | Refresh automático transparente. | ✅ Cliente tiene single-flight refresh. | Sí |
| Logout y re-login | Sesión eliminada; login limpio. | ⚠️ Logout limpia estado de cliente pero no invalida cookies server-side explícitamente. | Parcial |

---

## 5. Recomendaciones

### Inmediatas (antes del próximo deploy)

1. **Corregir `sanitizeNext`** para evitar open redirect:
   ```ts
   function sanitizeNext(raw: string | null): string {
       if (!raw) return '/';
       // Permitir solo rutas internas conocidas o que inicien con / y no contengan @, //, etc.
       const allowedPrefixes = ['/','/tournaments','/matches','/club-admin','/admin','/profile'];
       if (raw.startsWith('/') && !raw.startsWith('//') && !raw.includes('@')) {
           // Opcional: whitelist más estricta
           return raw;
       }
       return '/';
   }
   ```

2. **Eliminar logs de cliente que exponen datos OAuth.**
   - Remover `console.log` de `OAuthButtons.tsx` o reemplazarlos por logs sanitizados en modo debug únicamente.

3. **Agregar rate limiting a `/api/auth/callback/*` y `/api/auth/sync-user`.**
   - Usar `rate-limiter-flexible` o similar, limitando a ~5 intentos por IP/minuto en callback.

4. **Unificar callbacks:**
   - Eliminar `/api/auth/callback/google/route.ts` y usar únicamente `/auth/callback` para todos los flujos (OAuth + email confirmation + password reset).
   - O, si se prefiere separar, extraer la lógica a una función compartida.

### Corto plazo (1-2 semanas)

5. **Implementar `middleware.ts` para protección de rutas.**
   ```ts
   // src/middleware.ts
   import { createServerClient } from '@supabase/ssr';
   import { NextResponse } from 'next/server';
   
   export async function middleware(req) {
       const res = NextResponse.next();
       const supabase = createServerClient(..., { cookies: { getAll, setAll } });
       const { data: { user } } = await supabase.auth.getUser();
       if (!user && req.nextUrl.pathname.startsWith('/admin')) {
           return NextResponse.redirect(new URL('/login', req.url));
       }
       return res;
   }
   export const config = { matcher: ['/admin/:path*', '/club-admin/:path*', '/profile/:path*'] };
   ```

6. **Limpiar guest cookie en callback OAuth:**
   - Replicar la llamada `DELETE /api/auth/guest-club-family` en el flujo de éxito del callback, igual que en login por email.

7. **Mejorar manejo de errores en callback:**
   - Loggear el error de `exchangeCodeForSession` en servidor (sanitizado).
   - Diferenciar errores conocidos para mostrar mensajes útiles:
     - `code` ausente → "El inicio de sesión fue cancelado."
     - Código inválido/expirado → "El enlace expiró. Intenta de nuevo."
     - Error de provider → "Hubo un problema con el proveedor. Intenta más tarde."

8. **Agregar validación de `Origin`/`Referer` en `/api/auth/sync-user`:**
   ```ts
   const origin = request.headers.get('origin');
   if (!origin || !origin.endsWith(new URL(request.url).host)) {
       return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
   }
   ```

### Mediano plazo

9. **Evaluar habilitar Apple/Facebook** o eliminar el código muerto si no se usarán.
10. **Agregar tests E2E** del flujo OAuth usando Playwright (ya hay `.playwright-mcp/` en el proyecto).
11. **Revisar configuración de cookies en Supabase:** asegurar `SameSite=Lax` y `Secure` en producción.
12. **Considerar implementar un endpoint `/api/auth/logout`** que invalide cookies server-side para mayor robustez en SSR.

---

## 6. Próximos Pasos Sugeridos

1. **Priorizar los 4 fixes inmediatos** (open redirect, logs, rate limit, unificación de callback).
2. **Crear un PR con `middleware.ts`** para proteger rutas administrativas.
3. **Correr smoke tests** en local:
   - Login con Google (usuario nuevo y existente).
   - Cancelar flujo en pantalla de Google.
   - Callback sin `code`.
   - Logout + re-login.
4. **Auditar dashboard de Supabase Auth:**
   - Verificar que los `redirect_uri` registrados coincidan exactamente con los de la app.
   - Confirmar que Google Sign-In está configurado con scopes correctos.
   - Revisar si Apple/Facebook están configurados pero sin botón (eliminar si no se usan).
5. **Documentar decisiones de seguridad** en `AGENTS.md` o `docs/SECURITY.md` (manejo de `state` por Supabase, PKCE, etc.).

---

## 7. Evidencia Técnica

### Archivos relevantes revisados
- `src/app/login/components/OAuthButtons.tsx`
- `src/app/login/auth-client.ts`
- `src/app/api/auth/callback/google/route.ts`
- `src/app/auth/callback/route.ts`
- `src/app/api/auth/sync-user/route.ts`
- `src/lib/auth/syncUserProfile.ts`
- `src/context/AuthContext.tsx`
- `src/lib/supabase/client.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/admin.ts`
- `src/app/login/redirects.ts`
- `src/app/auth/confirm/page.tsx`
- `src/app/auth/forgot-password/page.tsx`
- `src/app/auth/update-password/page.tsx`

### Variables de entorno relevantes
```
NEXT_PUBLIC_SUPABASE_URL=https://vxsolicapdcpemfsahbk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Diagrama simplificado del flujo
```
Usuario
  │ click "Continuar con Google"
  ▼
/login (OAuthButtons.tsx)
  │ signInWithOAuth({ provider: 'google', redirectTo: '/api/auth/callback/google?next=...' })
  ▼
Supabase Auth (genera PKCE + state)
  │
  ▼
Google OAuth (usuario autoriza)
  │
  ▼
/api/auth/callback/google?code=...&next=...
  │ exchangeCodeForSession(code)
  │ syncUserProfile(user)
  ▼
Redirect a / (o next)
  │
  ▼
AuthContext.onAuthStateChange('SIGNED_IN')
  │ fetch perfil desde tabla users
  ▼
UI autenticada
```

---

---

## 8. Cambios aplicados en código (2026-04-28)

### Archivos creados
- `src/middleware.ts` — protección server-side de rutas.
- `src/lib/rateLimit.ts` — rate limiter en memoria para auth.
- `src/lib/auth/callbackHandler.ts` — lógica unificada de callback OAuth.

### Archivos modificados
- `src/app/login/redirects.ts` — sanitización anti open-redirect reforzada.
- `src/app/login/components/OAuthButtons.tsx` — sin logs de datos OAuth; usa `/auth/callback`.
- `src/app/login/page.tsx` — mensajes de error diferenciados.
- `src/app/auth/callback/route.ts` — delega en `callbackHandler`.
- `src/app/api/auth/callback/google/route.ts` — redirect 307 al callback unificado.
- `src/app/auth/confirm/page.tsx` — usa `sanitizeNext` compartido.
- `src/app/onboarding/preferences/page.tsx` — usa `sanitizeReturnTo` compartido.
- `src/app/api/auth/sync-user/route.ts` — rate limiting + validación de `Origin`.

---

## 9. Acción requerida en Supabase Dashboard

Para que el login con Google siga funcionando, **actualizá la configuración del provider en Supabase**:

1. Andá a **Authentication → Providers → Google**.
2. En **Authorized Redirect URI** (o similar), asegurate de que la URL sea:
   ```
   https://<tu-dominio>/auth/callback
   ```
3. Eliminá o desactivá la URI antigua si existe:
   ```
   https://<tu-dominio>/api/auth/callback/google
   ```
4. Guardá los cambios.

> Nota: dejamos un redirect 307 desde `/api/auth/callback/google` hacia `/auth/callback` como red de seguridad mientras hacés el cambio, pero no es una solución permanente.

---

*Reporte generado por auditoría manual de código. Se recomienda complementar con pentest automatizado (OWASP ZAP / Burp Suite) una vez aplicadas las correcciones.*
