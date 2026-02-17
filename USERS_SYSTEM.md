# Sistema de Usuarios y Favoritos - G22 Scores

## 📋 Overview

Sistema completo de autenticación con:

- **Super Administrador** fijo con acceso global
- **Perfiles individuales** para usuarios normales
- **Sistema de favoritos** personalizado por usuario

---

## 🚀 Implementación

### 1. Configurar Supabase

1. **Ejecutar el schema SQL**:
   - Ir a Supabase Dashboard → SQL Editor
   - Copiar el contenido de `supabase/schema.sql`
   - Ejecutar el script completo

2. **Verificar que se crearon**:
   - Tablas: `public.users`, `public.favorites`
   - Funciones: `toggle_favorite`, `is_favorited`, `get_user_favorites`, etc.
   - Trigger: `on_auth_user_created`
   - RLS Policies activadas

### 2. Configurar Variables de Entorno

El proyecto ya tiene las credenciales en `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

### 3. Reiniciar el servidor de desarrollo

```bash
npm run dev
```

---

## 🔐 Super Admin

### Cuenta predefinida

- **Email**: `superadmin@g22scores.com`
- **Rol**: Asignado automáticamente al hacer login

### Permisos

- ✅ Acceso completo al panel de Super Admin
- ✅ Ver todos los usuarios
- ✅ Ver todos los favoritos
- ✅ Editar cualquier entidad globalmente
- ✅ Bypass de todas las restricciones de permisos

### Cómo funciona

1. Usuario se autentica con `superadmin@g22scores.com` (cualquier método: email, Google, etc.)
2. El trigger `handle_new_user()` detecta el email
3. Asigna automáticamente `role = 'super_admin'`
4. El sistema verifica el rol en cada request

---

## 👤 Usuarios Normales

### Creación automática

- Al hacer login por primera vez (OAuth o email)
- Se crea automáticamente en `public.users`
- Rol por defecto: `user`
- Nombre y avatar desde OAuth si están disponibles

### Permisos

- ✅ Ver su propio perfil
- ✅ Editar su propio perfil
- ✅ Crear/eliminar sus favoritos
- ❌ No acceso a panel de admin

---

## ⭐ Sistema de Favoritos

### Entidades soportadas

- `league` - Ligas
- `club` - Clubes
- `tournament` - Torneos
- `team` - Equipos
- `player` - Jugadores

### Uso del componente

```tsx
import FavoriteButton from '@/components/FavoriteButton'

<FavoriteButton 
  entityType="club"
  entityId="club-123"
  size={20}
  showLabel={true}
/>
```

### Funcionalidad

- 🟢 Click en estrella vacía → Agregar a favoritos
- 🟢 Click en estrella llena → Quitar de favoritos
- 🔒 Si no está autenticado → Redirige a login
- ⚡ Actualización en tiempo real

---

## 📄 Páginas disponibles

### `/profile`

- Perfil personal del usuario
- Tabs de favoritos por tipo
- Botones de configuración y logout
- Badge de "Super Admin" si aplica

### `/login`

- Login con email/password
- OAuth (Google, Apple, Facebook)
- Ya implementado previamente

### `/admin/super`

- Panel del Super Admin
- Solo accesible con `role = 'super_admin'`
- Ya implementado previamente

---

## 🔧 Helpers disponibles

### Client-side (Browser)

```tsx
import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

// Toggle favorite
await supabase.rpc('toggle_favorite', {
  p_entity_type: 'club',
  p_entity_id: 'club-123'
})

// Check if favorited
const { data } = await supabase.rpc('is_favorited', {
  p_entity_type: 'club',
  p_entity_id: 'club-123'
})

// Get all favorites
const { data } = await supabase.rpc('get_user_favorites', {
  p_entity_type: 'club' // null for all types
})
```

### Server-side (Server Components / Server Actions)

```tsx
import { getCurrentUser, requireAuth, requireSuperAdmin } from '@/lib/auth/server'

// Get current user (returns null if not logged in)
const user = await getCurrentUser()

// Require authentication (throws if not logged in)
const user = await requireAuth()

// Require super admin (throws if not super admin)
const admin = await requireSuperAdmin()
```

---

## 🎨 Componentes UI

### `<UserMenu />`

- Menú de usuario en el header
- Avatar con badge de Super Admin
- Dropdown con opciones:
  - Perfil
  - Favoritos
  - Super Admin (si aplica)
  - Configuración
  - Cerrar Sesión

**Uso:**

```tsx
import UserMenu from '@/components/UserMenu'

<header>
  {/* ... otros elementos ... */}
  <UserMenu />
</header>
```

### `<FavoriteButton />`

- Botón de favorito con estrella
- Estados: vacío / lleno
- Auto-actualización

**Props:**

```tsx
entityType: 'league' | 'club' | 'tournament' | 'team' | 'player'
entityId: string
size?: number (default: 20)
showLabel?: boolean (default: false)
className?: string
```

---

## 🔒 Seguridad (RLS)

### Row Level Security habilitado en

- `public.users`
- `public.favorites`

### Políticas

- ✅ Usuarios pueden ver/editar solo su propio perfil
- ✅ Usuarios pueden ver/crear/eliminar solo sus favoritos
- ✅ Super Admin puede ver todos los usuarios y favoritos

---

## 🧪 Testing

### Probar Super Admin

1. Crear cuenta con email `superadmin@g22scores.com`
2. Hacer login
3. Verificar badge "Super Admin" en avatar
4. Ir a `/admin/super` → debe tener acceso

### Probar Usuario Normal

1. Crear cuenta con cualquier otro email
2. Hacer login
3. Ir a `/profile` → ver perfil
4. Click en estrella en alguna entidad → agregar favorito
5. Verificar en tab "Favoritos" de perfil

---

## 📦 Archivos creados

```
supabase/
  └── schema.sql                                   # Schema SQL completo

src/
  ├── lib/
  │   ├── types/
  │   │   └── user.ts                              # Types y helpers
  │   └── auth/
  │       └── server.ts                            # Auth helpers server-side
  │
  ├── components/
  │   ├── FavoriteButton.tsx                       # Botón de favoritos
  │   ├── FavoriteButton.module.css
  │   ├── UserMenu.tsx                             # Menú de usuario
  │   └── UserMenu.module.css
  │
  └── app/
      └── profile/
          ├── page.tsx                             # Página de perfil
          └── profile.module.css
```

---

## ✅ Checklist de verificación

- [ ] Schema SQL ejecutado en Supabase
- [ ] Tablas `users` y `favorites` creadas
- [ ] Funciones RPC disponibles
- [ ] RLS activado
- [ ] Login funciona correctamente
- [ ] Super Admin se asigna automáticamente
- [ ] Página de perfil accesible
- [ ] Favoritos se agregan/quitan correctamente
- [ ] UserMenu aparece en header
- [ ] Super Admin ve badge en avatar

---

## 🐛 Troubleshooting

### "Error: Not authenticated"

- Verificar que el usuario está logueado
- Revisar cookies y session storage

### "Función no existe"

- Ejecutar nuevamente el schema SQL
- Verificar en Supabase Dashboard → Database → Functions

### "RLS policy error"

- Verificar que RLS está activado
- Revisar políticas en Supabase Dashboard → Authentication → Policies

### Super Admin no se asigna

- Verificar que el email es exactamente `superadmin@g22scores.com`
- Revisar logs del trigger en Supabase

---

## 🎯 Próximos pasos sugeridos

1. **Integrar UserMenu en el header principal**
2. **Agregar FavoriteButton en cards de entidades**
3. **Crear página de configuración** (`/profile/settings`)
4. **Implementar edición de perfil** (nombre, avatar)
5. **Agregar filtros avanzados** en página de favoritos
6. **Implementar notificaciones** de favoritos

---

¡Sistema listo para usar! 🚀
