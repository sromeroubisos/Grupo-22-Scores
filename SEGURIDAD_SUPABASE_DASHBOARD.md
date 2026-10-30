# Ajustes de seguridad que viven en el dashboard de Supabase

Hay defensas que **no se pueden implementar desde este repo**. Este documento
dice cuáles, por qué, y qué hay que tocar.

## Por qué el rate limiting del login no puede vivir en nuestro código

`signInWithPassword` corre en el navegador y va **directo** a Supabase Auth
([auth-client.ts](src/app/login/auth-client.ts)). Nuestro servidor no se entera:
no hay dónde poner el contador.

Y mover el login a un endpoint propio tampoco alcanzaría. La anon key es
pública por diseño —está en el bundle—, así que `POST /auth/v1/token` de nuestro
proyecto queda accesible para cualquiera que abra DevTools. Un atacante saltea
nuestro endpoint y le pega a Supabase directo.

La conclusión incómoda: **contra fuerza bruta de credenciales, la única barrera
real es la de Supabase**. Lo de abajo no es "configuración recomendada", es la
defensa.

---

## Checklist

### 1. Protección de contraseñas filtradas — ⚠️ lo más importante

`Authentication → Policies → Password Protection` → activar
**"Prevent use of leaked passwords"**.

Consulta HaveIBeenPwned del lado del servidor y rechaza contraseñas que ya
aparecieron en una filtración. Es la medida con mejor relación
esfuerzo/beneficio de toda esta lista: la mayoría de los ataques reales son
credential stuffing, no fuerza bruta, y esto los corta de raíz.

### 2. Largo mínimo de contraseña

`Authentication → Policies → Password Protection` → **Minimum password length: 10**.

Tiene que coincidir con `PASSWORD_MIN_LENGTH` en
[passwordPolicy.ts](src/lib/auth/passwordPolicy.ts). Si el dashboard queda en 6,
la validación del formulario es una sugerencia: un `signUp` directo con la anon
key la ignora.

**No** actives "Required characters" (mayúscula + número + símbolo). NIST
800-63B lo desaconseja: empuja a `Password1!`, que es adivinable, y no agrega
entropía real. El largo y la lista de filtradas hacen el trabajo.

### 3. Rate limits de Auth

`Authentication → Rate Limits`. Los que importan:

| Límite | Sugerido | Qué frena |
|---|---|---|
| Token refreshes / sign-ins per hour per IP | 30 | fuerza bruta de contraseña |
| Sign ups per hour per IP | 10 | alta masiva de cuentas |
| Password recovery emails per hour | 10 | usar el reset como spam |

### 4. CAPTCHA — el código ya está, falta la cuenta

`Authentication → Settings → Enable Captcha protection` → **Cloudflare Turnstile**.

Es lo único que distingue un humano de un script **antes** de verificar la
credencial. El widget y el envío del token ya están en el repo
([CaptchaField.tsx](src/app/login/components/CaptchaField.tsx), montado en login,
registro y recuperación). Falta:

1. Crear un sitio en Cloudflare Turnstile (gratis) → te da site key y secret key.
2. Pegar la **secret key** en el dashboard de Supabase, en ese mismo panel.
3. Poner la **site key** como `NEXT_PUBLIC_TURNSTILE_SITE_KEY` en Vercel y en
   `.env.local`.

Sin la variable, el widget no se renderiza y los formularios no exigen token: el
código convive con `main` sin romperle el login a nadie. Y **el paso 2 no es
opcional** — quien valida el token es Supabase; si el dashboard no tiene el
CAPTCHA activado, el token viaja y se ignora.

### 5. MFA para roles globales — el código ya está, falta habilitarlo

`Authentication → Providers → Multi-Factor Authentication` → habilitar **TOTP**.

En el repo está el alta ([/auth/mfa/alta](src/app/auth/mfa/alta/page.tsx)), el
desafío ([/auth/mfa](src/app/auth/mfa/page.tsx)) y el guard
([mfa.ts](src/lib/auth/mfa.ts)), que corre tanto en el layout de `/admin` como en
las rutas de API — sin lo segundo, el guard de página se saltea llamando a la API
directo.

Dos comportamientos distintos, a propósito:

- **El desafío se exige siempre** que el usuario tenga un factor verificado. Si
  alguien se tomó el trabajo de enrolar, quiere que se le pida.
- **El alta forzada es opt-in**, con `MFA_REQUIRED_FOR_ADMINS=true`. Viene apagada
  porque prenderla antes de que el equipo enrole deja a todos los admins afuera
  del panel de golpe.

Orden sugerido: habilitar TOTP en el dashboard → que cada admin global entre a
`/auth/mfa/alta` y enrole → recién ahí prender la variable.

Ojo con la recuperación: si alguien pierde el teléfono y no guardó la clave, hace
falta **otro** super admin que le desactive el factor. Con un solo super admin
enrolado, perder el teléfono es perder el panel.

### 6. Rotación de refresh tokens

`Authentication → Settings → Refresh Token Rotation` → activado, con
**"Reuse detection"**.

Con detección de reuso, si un refresh token robado se usa después de que el
legítimo ya rotó, Supabase invalida toda la familia de tokens. Es lo que acota
el daño de una sesión robada, y va de la mano con haber bajado la vida de la
cookie a 30 días en [auth-cookie.ts](src/lib/supabase/auth-cookie.ts).

---

## Lo que sí quedó en el repo

- **Rate limiting compartido entre instancias** para los endpoints que sí
  controlamos (`commit-session`, `sync-user`, callback de OAuth):
  [rateLimit.ts](src/lib/rateLimit.ts) + `supabase/migrations/20260819220000_rate_limits.sql`.
  El contador vivía en un `Map` de proceso, o sea 10/min **por lambda**.
- **Política de contraseñas** compartida por registro y cambio:
  [passwordPolicy.ts](src/lib/auth/passwordPolicy.ts). Primera línea y mensaje
  al usuario; el piso real es el punto 2 de arriba.
- **Vida de la cookie de sesión** de 400 días a 30.

## Variables de entorno que introduce todo esto

| Variable | Dónde | Default | Qué hace |
|---|---|---|---|
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Vercel + `.env.local` | sin valor | Prende el widget de CAPTCHA. Sin ella, inerte. |
| `MFA_REQUIRED_FOR_ADMINS` | Vercel | `false` | Obliga a los roles globales **sin** factor a darlo de alta. |
| `GUEST_CLUB_ACCESS_ENABLED` | Vercel | `false` | Reabre la puerta de invitado a La Tablada. Dejala apagada. |

Todas vienen apagadas: el código puede estar en `main` sin cambiar el
comportamiento hasta que se prenden a propósito.

## Lo que sigue sin solución en el repo

La cookie de sesión se emite **sin `httpOnly`**
([commit-session/route.ts](src/app/api/auth/commit-session/route.ts)) porque
`createBrowserClient` necesita leerla. Cualquier XSS se lleva la sesión.
Arreglarlo de verdad pide un proxy de auth server-side: que el navegador nunca
vea el token y que todas las llamadas a Supabase pasen por nuestro backend. Es
un cambio de arquitectura, no un flag.
