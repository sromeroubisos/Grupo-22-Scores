# N8N Telegram Bot Authorization

## Resumen

El workflow de n8n autoriza mensajes del bot comparando el remitente de Telegram con la tabla:

```text
public.admin_telegram_users
```

El error:

```text
Could not find the table 'public.admin_telegram_users' in the schema cache
```

indica que la migracion de Supabase/Postgres no fue aplicada o que PostgREST todavia no recargo el schema cache.

## Flujo actual

1. Telegram Trigger recibe un mensaje.
2. El flujo extrae `message.from.id`.
3. El nodo `Check Authorization` consulta `public.admin_telegram_users`.
4. Filtra por:
   - `telegram_user_id = message.from.id`
   - `is_active = true`
5. El IF verifica si existe `$json.id`.
6. Si existe, continua al agente AI.
7. Si no existe, responde acceso denegado.

## Tabla

La tabla compatible con el workflow queda asi:

```sql
create table if not exists public.admin_telegram_users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id text not null unique,
  telegram_phone_number text unique,
  user_id uuid references public.users(id) on delete set null,
  username text,
  first_name text,
  last_name text,
  role text,
  permissions jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz default now()
);
```

Migraciones relacionadas:

- `supabase/migrations/20260424180000_admin_telegram_users.sql`
- `supabase/migrations/20260425120000_admin_telegram_users_id_auth_compat.sql`

La segunda migracion alinea el esquema con el flujo real por `telegram_user_id` y deja `telegram_phone_number` como dato opcional.

## Panel Super Admin

En `Super Admin > Configuracion > Bot de Telegram` se puede:

- agregar Telegram user IDs autorizados
- cargar telefono opcional
- definir `role`
- asociar un `user_id` interno opcional
- guardar `permissions` como JSON
- activar o desactivar usuarios
- editar o quitar registros

## Autorizar un usuario manualmente

Ejemplo minimo:

```sql
insert into public.admin_telegram_users (
  telegram_user_id,
  role,
  is_active
) values (
  '6901996199',
  'superadmin',
  true
)
on conflict (telegram_user_id) do update
set
  role = excluded.role,
  is_active = excluded.is_active;
```

Ejemplo con permisos:

```sql
insert into public.admin_telegram_users (
  telegram_user_id,
  telegram_phone_number,
  role,
  permissions,
  is_active
) values (
  '6901996199',
  '+5491112345678',
  'superadmin',
  '{"can_update_results": true, "can_publish_pieces": true}'::jsonb,
  true
);
```

## Nodo Check Authorization

Si usas Supabase en n8n, la consulta debe apuntar a:

- Table: `admin_telegram_users`
- Filter:
  - `telegram_user_id` equals `={{ String($json.message.from.id) }}`
  - `is_active` equals `true`
- Limit: `1`

El IF posterior puede seguir usando:

```text
$json.id exists
```

## Nota sobre telefono

Telegram no entrega el numero de telefono en cada mensaje normal. Por eso la autorizacion principal debe ser por `telegram_user_id`.

El telefono sigue disponible como campo opcional para administracion o para flujos que pidan compartir contacto, pero no es necesario para que el workflow actual autorice usuarios.

## Seguridad

- Mantener RLS activo.
- Administrar esta tabla solo desde Super Admin o con service role en n8n.
- Desactivar usuarios con `is_active = false` en vez de borrarlos cuando quieras conservar historial.
