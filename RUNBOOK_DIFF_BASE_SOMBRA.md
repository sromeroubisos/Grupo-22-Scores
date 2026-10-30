# Diff base sombra vs. producción

Reemplaza al método de inferencia objeto-por-objeto, que llegaba sólo a las 115
migraciones verificables por existencia de objeto y dejaba 54 sin respuesta. Esto
contesta las 169: columnas, políticas, índices, constraints y defaults.

**No lo pude correr desde acá.** Verificado empíricamente: `npx supabase db diff`
arranca bien —imprime `Creating shadow database...`— y muere porque **Docker
Desktop no está corriendo** en esta máquina. Tampoco hay `psql` ni `pg_dump`
instalados, ni un connection string de Postgres en `.env.local` (sólo la URL de la
API y las keys). Así que el runbook queda para que lo corras vos.

## Lo que hace falta

1. **Docker Desktop corriendo.** El CLI levanta la base sombra adentro de un
   contenedor; es lo único que falta para que el comando de abajo funcione.
2. **La password de Postgres del proyecto.** Está en el dashboard de Supabase,
   *Settings → Database → Database password*. No es la service_role key.

## El diff

```bash
npx supabase link --project-ref vxsolicapdcpemfsahbk     # pide la password

# Crea una base sombra, le aplica las 169 migraciones en orden, y la compara
# contra la base linkeada (producción).
npx supabase db diff --linked --schema public -f diff_repo_vs_produccion.sql
```

Sale `supabase/migrations/<timestamp>_diff_repo_vs_produccion.sql`. **Leé la
cabecera antes de interpretarlo**: el archivo es el DDL que llevaría de un estado
al otro, y conviene confirmar en qué dirección lo escribió antes de sacar
conclusiones. Un diff vacío significaría que el repo y producción coinciden — que
sabemos que no es el caso, así que si sale vacío hay que sospechar del comando, no
celebrar.

## Si Docker no es una opción

Dos dumps y un diff de texto. Necesita `pg_dump` (viene con cualquier instalación
de PostgreSQL cliente):

```bash
# 1. Producción
pg_dump --schema-only --no-owner --no-privileges \
  "postgresql://postgres.vxsolicapdcpemfsahbk:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres" \
  > esquema_produccion.sql

# 2. Una base limpia con las 169 migraciones aplicadas en orden
createdb g22_sombra
for f in supabase/migrations/*.sql; do psql -d g22_sombra -v ON_ERROR_STOP=1 -f "$f" || echo "FALLÓ: $f"; done
pg_dump --schema-only --no-owner --no-privileges -d g22_sombra > esquema_repo.sql

# 3. Comparar
diff -u esquema_produccion.sql esquema_repo.sql > diff_esquemas.txt
```

El `|| echo "FALLÓ: $f"` del paso 2 es la parte más informativa de todo esto:
**una migración que falla al aplicarse sobre una base limpia es una migración rota,
no una migración pendiente.** Ese listado vale por sí solo.

## Qué hacer con el resultado

Recién con el diff en mano, los cuatro buckets de
[PLAN_REPARACION_MIGRACIONES.md](PLAN_REPARACION_MIGRACIONES.md) dejan de ser
estimación:

- lo que está en el repo y no en producción → **pendiente de verdad**
- lo que está en producción y no en el repo → **hecho a mano**, hay que escribirle
  una migración o asumir que el repo nunca va a describir la base
- lo que coincide → **`applied`**, y ahí sí se repara el historial con confianza

**No repares el historial antes de tener esto.** Marcar 92 como `applied` con el
método incompleto es exactamente el riesgo que no vale la pena correr.

---

## Aparte: `club_venues`

Quedó como "vacía" en el barrido de datos personales: 0 filas con anon y 0 con
service_role, así que no se puede distinguir protegida de sin datos. Esta consulta
lo resuelve:

```sql
SELECT c.relrowsecurity AS rls_activo,
       (SELECT count(*) FROM pg_policies p
        WHERE p.schemaname = 'public' AND p.tablename = 'club_venues') AS politicas,
       (SELECT count(*) FROM public.club_venues) AS filas,
       has_table_privilege('anon', 'public.club_venues', 'SELECT') AS anon_puede_select
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'club_venues';
```

- `rls_activo = false` **o** (`politicas = 0` y `anon_puede_select = true`) → está
  abierta y hoy no se nota sólo porque está vacía. Se cierra igual que `club_profile`.
- `politicas > 0` con una que la limite → está protegida y no hay nada que hacer.
```
