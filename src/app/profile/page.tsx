'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { User, Favorite, EntityType } from '@/lib/types/user'
import { Star, User as UserIcon, Settings, LogOut, Trophy, Users, Shield } from 'lucide-react'
import styles from './profile.module.css'
import { useRouter } from 'next/navigation'

type Tab = 'all' | 'league' | 'club' | 'tournament' | 'team' | 'player'

export default function ProfilePage() {
    const [user, setUser] = useState<User | null>(null)
    const [favorites, setFavorites] = useState<Favorite[]>([])
    const [activeTab, setActiveTab] = useState<Tab>('all')
    const [loading, setLoading] = useState(true)
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        loadProfile()
    }, [])

    useEffect(() => {
        loadFavorites()
    }, [activeTab])

    async function loadProfile() {
        try {
            const { data: { session } } = await supabase.auth.getSession()

            if (!session) {
                router.push('/login')
                return
            }

            const { data: userData } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single()

            setUser(userData)
        } catch (error) {
            console.error('Error loading profile:', error)
        } finally {
            setLoading(false)
        }
    }

    async function loadFavorites() {
        try {
            const entityType = activeTab === 'all' ? null : activeTab

            const { data } = await supabase
                .rpc('get_user_favorites', {
                    p_entity_type: entityType
                })

            setFavorites(data || [])
        } catch (error) {
            console.error('Error loading favorites:', error)
        }
    }

    async function handleSignOut() {
        await supabase.auth.signOut()
        router.push('/')
        router.refresh()
    }

    if (loading) {
        return (
            <div className={styles.page}>
                <div className={styles.loading}>Cargando perfil...</div>
            </div>
        )
    }

    if (!user) {
        return null
    }

    const tabs: Array<{ id: Tab; label: string; icon: any }> = [
        { id: 'all', label: 'Todos', icon: Star },
        { id: 'league', label: 'Ligas', icon: Trophy },
        { id: 'club', label: 'Clubes', icon: Users },
        { id: 'tournament', label: 'Torneos', icon: Trophy },
        { id: 'team', label: 'Equipos', icon: Shield },
        { id: 'player', label: 'Jugadores', icon: UserIcon },
    ]

    const filteredFavorites = activeTab === 'all'
        ? favorites
        : favorites.filter(f => f.entity_type === activeTab)

    return (
        <div className={styles.page}>
            <div className={styles.container}>
                {/* Header with profile info */}
                <div className={styles.profileHeader}>
                    <div className={styles.avatarSection}>
                        {user.avatar_url ? (
                            <img src={user.avatar_url} alt={user.name || 'User'} className={styles.avatar} />
                        ) : (
                            <div className={styles.avatarPlaceholder}>
                                <UserIcon size={48} />
                            </div>
                        )}
                        <div className={styles.userInfo}>
                            <h1 className={styles.userName}>{user.name || user.email}</h1>
                            <p className={styles.userEmail}>{user.email}</p>
                            {user.role === 'super_admin' && (
                                <span className={styles.superAdminBadge}>
                                    <Shield size={14} /> Super Admin
                                </span>
                            )}
                        </div>
                    </div>

                    <div className={styles.actions}>
                        <button className={styles.btnSecondary}>
                            <Settings size={16} /> Configuración
                        </button>
                        <button className={styles.btnDanger} onClick={handleSignOut}>
                            <LogOut size={16} /> Cerrar Sesión
                        </button>
                    </div>
                </div>

                {/* Stats */}
                <div className={styles.statsGrid}>
                    <div className={styles.statCard}>
                        <Star size={24} />
                        <div>
                            <div className={styles.statValue}>{favorites.length}</div>
                            <div className={styles.statLabel}>Favoritos</div>
                        </div>
                    </div>
                </div>

                {/* Favorites Section */}
                <div className={styles.favoritesSection}>
                    <h2 className={styles.sectionTitle}>Mis Favoritos</h2>

                    {/* Tabs */}
                    <div className={styles.tabs}>
                        {tabs.map(tab => {
                            const Icon = tab.icon
                            const count = tab.id === 'all'
                                ? favorites.length
                                : favorites.filter(f => f.entity_type === tab.id).length

                            return (
                                <button
                                    key={tab.id}
                                    className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                >
                                    <Icon size={16} />
                                    {tab.label}
                                    <span className={styles.tabCount}>({count})</span>
                                </button>
                            )
                        })}
                    </div>

                    {/* Favorites List */}
                    <div className={styles.favoritesList}>
                        {filteredFavorites.length === 0 ? (
                            <div className={styles.emptyState}>
                                <Star size={48} />
                                <p>No tenés favoritos aún</p>
                                <small>Empezá a marcar tus ligas, clubes y equipos favoritos</small>
                            </div>
                        ) : (
                            <div className={styles.favoritesGrid}>
                                {filteredFavorites.map((fav) => (
                                    <div key={fav.id} className={styles.favoriteCard}>
                                        <div className={styles.favoriteHeader}>
                                            <span className={styles.favoriteType}>{fav.entity_type}</span>
                                            <Star size={16} fill="var(--color-accent)" color="var(--color-accent)" />
                                        </div>
                                        <div className={styles.favoriteId}>ID: {fav.entity_id}</div>
                                        <div className={styles.favoriteDate}>
                                            Agregado: {new Date(fav.created_at).toLocaleDateString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
