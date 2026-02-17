# 🚀 Guía Rápida de Uso - Sistema de Usuarios

## 1️⃣ Ejecutar SQL en Supabase

1. Ir a **Supabase Dashboard** → **SQL Editor**
2. Copiar todo el contenido de `supabase/schema.sql`
3. Pegar y ejecutar
4. Verificar que se crearon:
   - Tabla `users`
   - Tabla `favorites`
   - Funciones RPC
   - Trigger `on_auth_user_created`

---

## 2️⃣ Usar en React (Frontend)

### **Hook: useUser()**

```tsx
import { useUser } from '@/hooks/useUser'

function MyComponent() {
    const { user, loading, isSuperAdmin, signOut } = useUser()

    if (loading) return <div>Cargando...</div>
    if (!user) return <div>No autenticado</div>

    return (
        <div>
            <p>Hola {user.name}</p>
            {isSuperAdmin && <p>Eres Super Admin! 🎉</p>}
            <button onClick={signOut}>Salir</button>
        </div>
    )
}
```

### **Hook: useFavorite()**

```tsx
import { useFavorite } from '@/hooks/useFavorites'

function ClubCard({ clubId }: { clubId: string }) {
    const { isFavorited, loading, toggle } = useFavorite('club', clubId)

    return (
        <button onClick={toggle} disabled={loading}>
            {isFavorited ? '⭐ Favorito' : '☆ Agregar'}
        </button>
    )
}
```

### **Hook: useFavorites()**

```tsx
import { useFavorites } from '@/hooks/useFavorites'

function FavoritesPage() {
    const { favorites, loading } = useFavorites('club') // o null para todos

    if (loading) return <div>Cargando favoritos...</div>

    return (
        <div>
            {favorites.map(fav => (
                <div key={fav.id}>{fav.entity_id}</div>
            ))}
        </div>
    )
}
```

### **Componente: FavoriteButton**

```tsx
import FavoriteButton from '@/components/FavoriteButton'

<FavoriteButton 
    entityType="club"
    entityId="club-id-123"
    size={20}
    showLabel={false}
/>
```

### **Componente: UserMenu**

```tsx
import UserMenu from '@/components/UserMenu'

function Header() {
    return (
        <header>
            <nav>...</nav>
            <UserMenu />  {/* Avatar con dropdown */}
        </header>
    )
}
```

---

## 3️⃣ Usar en Server Components (Backend)

### **Helpers de autenticación:**

```tsx
import { getCurrentUser, requireAuth, requireSuperAdmin } from '@/lib/auth/server'

// Opción 1: Obtener usuario (puede ser null)
async function MyPage() {
    const user = await getCurrentUser()
    
    if (!user) {
        return <div>No autenticado</div>
    }

    return <div>Hola {user.name}</div>
}

// Opción 2: Requerir autenticación (throw si no está)
async function ProfilePage() {
    const user = await requireAuth() // throws si no está logueado
    
    return <div>Perfil de {user.name}</div>
}

// Opción 3: Requerir Super Admin
async function AdminPage() {
    const admin = await requireSuperAdmin() // throws si no es super admin
    
    return <div>Panel de {admin.name}</div>
}
```

---

## 4️⃣ API Routes

### **Ya están creadas:**

- `POST /api/auth/sync-user` - Sincroniza usuario después de login

### **Llamar desde cliente:**

```tsx
// Después de login exitoso
await fetch('/api/auth/sync-user', { method: 'POST' })
```

---

## 5️⃣ Flow completo de Login

1. Usuario hace click en "Login with Google"
2. OAuth flow de Supabase
3. Redirect a `/auth/callback`
4. Callback sincroniza usuario a `public.users`
5. Si email es `superadmin@g22scores.com` → role = `super_admin`
6. Redirect a dashboard
7. `useUser()` carga el perfil
8. UserMenu muestra avatar y badge de admin si aplica

---

## 6️⃣ Integrar en tu Header

```tsx
// src/components/Header.tsx
import UserMenu from '@/components/UserMenu'

export default function Header() {
    return (
        <header className="header">
            <Logo />
            <Nav />
            <UserMenu />  {/* ← Agregar acá */}
        </header>
    )
}
```

---

## 7️⃣ Agregar favoritos en tus cards

```tsx
// Ejemplo: Card de Torneo
import FavoriteButton from '@/components/FavoriteButton'

function TournamentCard({ tournament }) {
    return (
        <div className="card">
            <h3>{tournament.name}</h3>
            
            <FavoriteButton 
                entityType="tournament"
                entityId={tournament.id}
                size={18}
            />
        </div>
    )
}
```

---

## 8️⃣ Verificar Super Admin en componentes

```tsx
import { useUser } from '@/hooks/useUser'
import Link from 'next/link'

function Navigation() {
    const { user, isSuperAdmin } = useUser()

    return (
        <nav>
            <Link href="/">Home</Link>
            {user && <Link href="/profile">Mi Perfil</Link>}
            {isSuperAdmin && <Link href="/admin/super">Super Admin</Link>}
        </nav>
    )
}
```

---

## ⚡ Funciones Supabase RPC disponibles

```tsx
// Toggle favorite
await supabase.rpc('toggle_favorite', {
    p_entity_type: 'club',
    p_entity_id: 'club-123'
})

// Check if favorited
const { data: isFav } = await supabase.rpc('is_favorited', {
    p_entity_type: 'club',
    p_entity_id: 'club-123'
})

// Get all favorites
const { data: favorites } = await supabase.rpc('get_user_favorites', {
    p_entity_type: 'club' // o null para todos
})

// Get user role
const { data: role } = await supabase.rpc('get_user_role')

// Check if super admin
const { data: isAdmin } = await supabase.rpc('is_super_admin')
```

---

## ✅ Checklist Final

- [ ] Ejecutar `supabase/schema.sql` en Supabase
- [ ] Verificar que tablas y funciones existen
- [ ] Integrar `<UserMenu />` en header
- [ ] Probar login con email normal
- [ ] Probar login con `superadmin@g22scores.com`
- [ ] Verificar badge de Super Admin
- [ ] Agregar `<FavoriteButton />` en cards
- [ ] Probar agregar/quitar favoritos
- [ ] Visitar `/profile` y ver favoritos

---

## 🐛 Si algo no funciona

1. **Error "función no existe"**
   - Ejecutar nuevamente el schema SQL

2. **Usuario no se crea**
   - Verificar en Supabase → Database → Tables → users
   - Revisar logs del trigger

3. **Favoritos no se guardan**
   - Verificar RLS policies activadas
   - Revisar en Supabase → Authentication → Policies

4. **Super Admin no se detecta**
   - Verificar email exacto: `superadmin@g22scores.com`
   - Revisar en tabla `users` que role = 'super_admin'

---

¡Todo listo para usar! 🎉
