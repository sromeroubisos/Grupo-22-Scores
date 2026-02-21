# QA Checklist — Club Management

## 1. Migración SQL
- [ ] `supabase db push` sin errores
- [ ] Tabla `club_divisions` existe con columnas: id, club_id, name, slug, sport, gender, category, status, featured, season, format, regulation, created_at, updated_at
- [ ] Tabla `club_venues` existe con columnas: id, club_id, name, address, city, maps_link, is_primary, created_at, updated_at
- [ ] `clubs` tiene columnas: sport, status, external_id
- [ ] `UNIQUE INDEX clubs_slug_idx` en clubs(slug)
- [ ] RLS habilitado en clubs, club_divisions, club_venues

## 2. API Routes

### POST /api/clubs
- [ ] Sin auth → 401
- [ ] Con auth sin permisos → 403
- [ ] Con super_admin: payload válido → 201 + {data: {id, slug, name, status}}
- [ ] Slug duplicado → 409 con mensaje claro
- [ ] Name vacío → 400
- [ ] Timing: < 300ms en p95 (medir con `console.time` en browser)

### PATCH /api/clubs/:id
- [ ] Sin auth → 401
- [ ] Auth sin permisos → 403
- [ ] Campos válidos → 200 + data actualizada
- [ ] Campos no whitelisted (slug, id) → ignorados, no error

### GET/POST /api/clubs/:id/divisions
- [ ] GET sin auth → devuelve divisiones activas (public)
- [ ] POST sin auth → 401
- [ ] POST con permisos + payload válido → 201
- [ ] POST duplicado (mismo nombre + club_id) → 409
- [ ] División aparece en GET tras el POST (persistencia real)
- [ ] Timing: < 300ms

### GET /api/clubs/:id/setup-status
- [ ] Devuelve { steps: {identity, divisions, venues}, canPublish }
- [ ] canPublish=true solo cuando identity.done && divisions.count > 0

### POST /api/clubs/:id/publish
- [ ] Sin divisiones → 422 con mensaje claro
- [ ] Con divisiones → 200, club.is_visible=true, status='published'
- [ ] Idempotente: segunda llamada → 200 con alreadyPublished=true

## 3. Wizard Crear Club (Super Admin)

### Paso 1
- [ ] Nombre + slug se generan automáticamente al escribir
- [ ] Botón "Crear Club y Continuar" llama POST /api/clubs
- [ ] Slug duplicado → toast de error claro, NO alert()
- [ ] Éxito → avanza a paso 2 SIN redirect
- [ ] Timing de crear club visible en DevTools Network < 300ms

### Paso 2 (Identidad)
- [ ] clubId está disponible en estado del wizard
- [ ] "Guardar Identidad" llama PATCH /api/clubs/:id
- [ ] "Saltar por ahora" va directo a /manage sin error
- [ ] Éxito → avanza a paso 3

### Paso 3
- [ ] "Ir al Panel de Gestión" redirige a /admin/super/clubes/:id/manage

## 4. Página /manage

### Carga
- [ ] Carga club, divisiones, venues, setup-status en paralelo
- [ ] Skeleton/loader visible durante carga
- [ ] Si club no existe → mensaje de error claro (no crash)

### Tab Identidad
- [ ] Formulario pre-populado con datos del club
- [ ] "Guardar Identidad" llama PATCH y muestra toast
- [ ] Sin alert() nativo

### Tab Sedes
- [ ] Lista de sedes existentes
- [ ] "+ Agregar Sede" → form inline → POST → aparece en lista
- [ ] Eliminar sede → DELETE → desaparece optimisticamente

### Tab Divisiones
- [ ] Lista con datos reales de DB (no mock)
- [ ] Tab ACCESIBLE inmediatamente (no bloqueado por estado del club)
- [ ] "+ Nueva División" → form inline → POST → aparece en tabla
- [ ] División persistida: recargar página → sigue apareciendo
- [ ] Eliminar división → DELETE → desaparece
- [ ] Sin divisiones → empty state con botón de acción

### Tab Publicar
- [ ] Checklist refleja estado real (identity.done, divisions.count, venues.count)
- [ ] "Publicar Club" deshabilitado si no hay divisiones
- [ ] Click publicar → toast éxito → badge cambia a "Publicado"
- [ ] "Despublicar" visible solo si está publicado

## 5. Redirect /[id] y /[id]/editar
- [ ] /admin/super/clubes/:id → redirect a /manage (NO usa mock-db)
- [ ] /admin/super/clubes/:id/editar → redirect a /manage?tab=identidad
- [ ] Funciona para clubes creados vía Supabase (no solo mock)

## 6. /club-admin/divisiones
- [ ] NO importa mock-db
- [ ] Lista viene de GET /api/clubs/:clubId/divisions
- [ ] "Crear División" llama POST /api/clubs/:clubId/divisions
- [ ] Toast en vez de alert()
- [ ] Si user sin clubId → mensaje de error claro

## 7. Performance
- [ ] Network waterfall de /admin/super/clubes < 800ms (segunda carga)
- [ ] AuthContext: abrir DevTools Network en login → profiles + memberships llegan SIMULTÁNEOS
- [ ] Ruta pública (ej: /) sin cookie → middleware NO hace request a Supabase (verificar en logs de servidor)

## 8. Permisos / Seguridad
- [ ] Usuario sin permisos no puede crear club: POST /api/clubs → 403
- [ ] Usuario sin permisos no puede crear división: POST /api/clubs/:id/divisions → 403
- [ ] Usuario sin permisos no puede publicar: POST /api/clubs/:id/publish → 403
- [ ] RLS: un `fan` en Supabase Dashboard no puede INSERT en clubs directamente

## 9. UX — Sin regresiones
- [ ] Lista /admin/super/clubes sigue cargando correctamente
- [ ] Link "Editar" en la lista va a /manage (no rompe)
- [ ] No hay alert() en ningún flujo de crear/editar club
