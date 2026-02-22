# QA Checklist — Admin Audit Log (PR Hardening)

## Precondiciones

- Dev server corriendo en `localhost:3000`
- `SUPABASE_SERVICE_ROLE_KEY` presente en `.env.local`  
- Match de prueba: `aaaaaaaa-0000-0000-0000-000000000001` (status actual: `scheduled`)

---

## TC-01 — Bulk Status Update (UI)

**Pasos:**

1. Loguearse como Super Admin en `localhost:3000/login`
2. Navegar a `localhost:3000/admin/entities?type=match`
3. Seleccionar el match de prueba (checkbox)
4. En `BulkActionsBar`, elegir status `Finalizado` del select
5. Clic `Aplicar` → confirmar el modal
6. Esperar toast de éxito

**Criterio de aceptación:**

- Toast muestra `"1 partidos actualizados correctamente."`
- Query de verificación devuelve `status = 'final'`:

```sql
SELECT id, status FROM public.matches
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
```

- Audit log tiene nueva fila:

```sql
SELECT action, source, changes FROM public.admin_audit_log
WHERE entity_id = 'aaaaaaaa-0000-0000-0000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- Expected: action='bulk_update', source='bulk-admin',
--           changes={"status":{"old":"scheduled","new":"final"}}
```

---

## TC-02 — Bulk Time Shift (UI)

**Pasos:**

1. Seleccionar el mismo match
2. En `BulkActionsBar`, clic en `+30'`
3. Clic `Aplicar` → confirmar

**Criterio de aceptación:**

- `date_time` en DB aumentó exactamente 30 minutos:

```sql
SELECT id, date_time FROM public.matches
WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
```

- Audit log registra el cambio de `date_time`:

```sql
SELECT action, source, changes FROM public.admin_audit_log
WHERE entity_id = 'aaaaaaaa-0000-0000-0000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- Expected: action='bulk_update', source='bulk-admin',
--           changes={"date_time":{"old":"...","new":"..."}}
```

---

## TC-03 — Single Update (UI, via manage page)

**Pasos:**

1. Navegar a `localhost:3000/admin/entities/aaaaaaaa-0000-0000-0000-000000000001/manage`
2. Cambiar status a `Postpuesto` y guardar

**Criterio de aceptación:**

```sql
SELECT action, source, changes FROM public.admin_audit_log
WHERE entity_id = 'aaaaaaaa-0000-0000-0000-000000000001'
ORDER BY created_at DESC LIMIT 1;
-- Expected: action='update', source='unified-admin',
--           changes={"status":{"old":"final","new":"postponed"}}
```

---

## TC-04 — RLS: authenticated NO puede INSERT

**Pasos** (ejecutar como usuario autenticado normal, NO service_role):

```sql
-- Esto DEBE fallar con "new row violates row-level security policy"
INSERT INTO public.admin_audit_log (actor_user_id, entity_type, entity_id, action, source)
VALUES (auth.uid(), 'match', 'aaaaaaaa-0000-0000-0000-000000000001', 'test', 'manual');
```

**Criterio de aceptación:**

- Error: `new row violates row-level security policy for table "admin_audit_log"`

---

## TC-05 — RLS: service_role SÍ puede INSERT (ya verificado E2E)

```sql
-- Via PostgREST con Header "Authorization: Bearer <service_role_key>"
-- PowerShell ya validó esto — resultado en audit_log.json
-- Rows: 4 entradas incluyendo dos con source='bulk-admin'
```

**Estado:** ✅ Verificado el 2026-02-22 via REST API + PowerShell

---

## Queries de monitoreo continuo

```sql
-- Ver últimas 10 entradas (ordenadas por recencia)
SELECT
    created_at AT TIME ZONE 'America/Argentina/Buenos_Aires' AS cuando,
    actor_user_id,
    entity_type,
    entity_id,
    action,
    source,
    changes
FROM public.admin_audit_log
ORDER BY created_at DESC
LIMIT 10;

-- Conteo por acción y fuente
SELECT action, source, COUNT(*) AS total
FROM public.admin_audit_log
GROUP BY action, source
ORDER BY total DESC;

-- Ver diff de un entity específico
SELECT
    created_at AT TIME ZONE 'America/Argentina/Buenos_Aires' AS cuando,
    action,
    source,
    changes
FROM public.admin_audit_log
WHERE entity_id = 'aaaaaaaa-0000-0000-0000-000000000001'
ORDER BY created_at DESC;
```

---

## Estado del sistema al cierre del PR

| Componente | Estado |
|---|---|
| `actions.ts` — source/action | ✅ `'update'` / `'unified-admin'` |
| `batchActions.ts` — source/action | ✅ `'bulk_update'` / `'bulk-admin'` |
| `BulkActionsBar` STATUS_OPTIONS | ✅ alineado al constraint DB |
| Fail-open en audit insert | ✅ try/catch en ambos archivos |
| RLS `RESTRICTIVE` en INSERT authenticated | ✅ migration en `20260222000000_audit_log_hardening.sql` |
| E2E: UPDATE match + INSERT audit_log | ✅ verificado vía REST API |
| Audit log filas en DB | ✅ 4 rows (2× `bulk_update`, 1× `update`, 1× `test_from_studio`) |
