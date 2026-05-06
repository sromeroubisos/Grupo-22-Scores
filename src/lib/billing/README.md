# Billing / Suscripciones (MercadoPago)

## Setup paso a paso

### 1. Instalar el SDK oficial

El backend de esta app usa Node/Next.js, por eso el SDK correspondiente es el paquete npm oficial:

```bash
npm install mercadopago
```

La inicializacion esta centralizada en `src/lib/billing/mercadopago.ts` con `MercadoPagoConfig` y `MP_ACCESS_TOKEN`. En desarrollo usa un access token de prueba (`TEST-...`) y en produccion configura el token productivo en el proveedor de hosting.

### 2. Aplicar la migración

Ejecutá `supabase/migrations/20260505120000_subscriptions_and_plans.sql` en Supabase Studio (SQL Editor) o via CLI:

```bash
supabase db push
```

Esto crea:

- Tabla `public.subscriptions`
- Vista `public.user_active_plan`
- Trigger `subscriptions_set_updated_at`
- Políticas RLS (cada usuario ve solo lo suyo, admins globales ven todo)

### 3. Configurar variables de entorno

En `.env.local` (dev) y en Vercel (prod):

```
MP_ACCESS_TOKEN=APP_USR-xxxxx     # Access token productivo de MercadoPago
MP_WEBHOOK_SECRET=xxxxx            # Secreto que te da MP al configurar el webhook
MP_USD_TO_ARS_RATE=1100            # Cotización de referencia (ajustar)
NEXT_PUBLIC_SITE_URL=https://g22scores.com
```

> El access token se genera en https://www.mercadopago.com.ar/developers/panel/app
> Crear una "Aplicación" → Credenciales → Producción → "Access token"

### 4. Configurar webhook en MercadoPago

1. Ir a https://www.mercadopago.com.ar/developers/panel/app/<tu_app>/webhooks
2. URL: `https://g22scores.com/api/webhooks/mercadopago`
3. Eventos a suscribir:
    - `Suscripciones` (preapproval)
    - `Pagos` (payment)
    - `Pagos autorizados de suscripciones` (subscription_authorized_payment)
4. Copiar el "Secreto" y ponerlo en `MP_WEBHOOK_SECRET`

### 5. Probar en dev

Para que MercadoPago pueda llamar tu webhook en dev, exponer localhost con ngrok:

```bash
ngrok http 3000
```

Y poner la URL ngrok en `NEXT_PUBLIC_SITE_URL`. Configurar el webhook MP a esa URL.

## Arquitectura

### Módulos

- **`plans.ts`** — single source of truth de planes (free/inicial/pro/organizacion), precios, límites, features. Se puede importar desde el cliente.
- **`subscriptions.ts`** — `getUserPlanContext()` y permission helpers (`canCreateTournament`, `canAddCategory`, etc). Server-only.
- **`mercadopago.ts`** — wrapper server-only sobre el SDK oficial de MP (preapproval, payment, cancel).

### Flujo de pago

```
Usuario             /checkout/[plan]              /api/checkout/create
   │  click             │                                │
   │ ────────────────▶  │                                │
   │                    │  POST { plan }                 │
   │                    │ ─────────────────────────────▶ │
   │                    │                                │  1. Crea row subscriptions
   │                    │                                │     status='pending'
   │                    │                                │  2. createPreapproval(MP)
   │                    │                                │  3. Guarda preapproval_id
   │                    │ ◀───────────────────────────── │
   │                    │  { checkoutUrl }               │
   │                    │                                │
   │ ◀──────────────────┘                                │
   │  redirect a MP                                      │
   │                                                     │
   │ ───── confirma pago ────▶ MercadoPago               │
   │                              │                      │
   │                              │  webhook              │
   │                              ├────────────────────▶ /api/webhooks/mercadopago
   │                              │                       │  - getPreapproval()
   │                              │                       │  - status='active'
   │                              │                       │  - current_period_end = now+30d
   │ ◀──────────────────── back_url                       │
        /checkout/pro?status=success
```

### Permisos

Los roles existentes (`admin_torneo`, `admin_club`, etc) **no cambian**. El plan agrega una **capa de límites cuantitativos**:

- `canCreateTournament(planCtx, currentCount)` — chequea `maxActiveTournaments`
- `canAddCategory(planCtx, currentCount)` — chequea `maxCategories`
- `canEnableBranding(planCtx)` — chequea `brandingEnabled`
- etc.

Los admins globales (`admin_general`, `super_admin`) saltean estos límites (`isUnlimited: true`).

### Promo Fundador

Activada via `FOUNDER_PROMO_ENABLED = true` en `plans.ts`. Mientras esté activa:

- Inicial: USD 9 (en lugar de USD 15)
- Pro: USD 29 (en lugar de USD 39)

El precio listado se muestra tachado en la UI. Cuando termine la promo (~6 meses), poner `FOUNDER_PROMO_ENABLED = false`.

## TODO / Próximos pasos

- [ ] Agregar guards `canCreateTournament` en las API routes que crean torneos
- [ ] Email de confirmación al activar suscripción
- [ ] Página `/admin/super/subscriptions` para ver/editar manualmente
- [ ] Soportar add-ons (torneo extra, categoría extra, etc)
- [ ] Reintentos automáticos cuando un pago recurrente falla
- [ ] FX rate dinámico (Banco Nación API o similar) en lugar de `MP_USD_TO_ARS_RATE` fijo
