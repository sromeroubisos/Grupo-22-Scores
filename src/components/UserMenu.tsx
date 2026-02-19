'use client'

import { useState, useEffect, useRef } from 'react'
import { User, Settings, Star, LogOut, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { User as UserType, isSuperAdmin } from '@/lib/types/user'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import styles from './UserMenu.module.css'

export default function UserMenu() {
    const [user, setUser] = useState<UserType | null>(null)
    const [isOpen, setIsOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const supabase = createClient()

    useEffect(() => {
        loadUser()

        // Subscribe to auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT') {
                setUser(null)
            } else if (event === 'SIGNED_IN' && session) {
                loadUser()
            }
        })

        return () => subscription.unsubscribe()
    }, [])

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside)
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isOpen])

    async function loadUser() {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) return

        const { data: userData } = await supabase
            .from('users')
            .select('*')
            .eq('id', session.user.id)
            .single()

        if (userData) {
            setUser(userData)
        }
    }

    async function handleSignOut() {
        await supabase.auth.signOut()
        setIsOpen(false)
        router.push('/')
        router.refresh()
    }

    if (!user) {
        return (
            <Link href="/login" className={styles.loginButton}>
                Iniciar Sesión
            </Link>
        )
    }

    return (
        <div className={styles.userMenuContainer} ref={menuRef}>
            <button
                className={styles.avatarButton}
                onClick={() => setIsOpen(!isOpen)}
                aria-label="User menu"
            >
                {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.name || 'User'} className={styles.avatar} />
                ) : (
                    <div className={styles.avatarPlaceholder}>
                        {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                    </div>
                )}
                {isSuperAdmin(user) && (
                    <div className={styles.adminBadge}>
                        <Shield size={12} />
                    </div>
                )}
            </button>

            {isOpen && (
                <div className={styles.dropdown}>
                    <div className={styles.dropdownHeader}>
                        <div className={styles.dropdownUser}>
                            <div className={styles.userName}>{user.name || user.email}</div>
                            <div className={styles.userEmail}>{user.email}</div>
                        </div>
                        {isSuperAdmin(user) && (
                            <span className={styles.superAdminTag}>
                                Super Admin
                            </span>
                        )}
                    </div>

                    <div className={styles.dropdownDivider} />

                    <Link href="/profile" className={styles.menuItem} onClick={() => setIsOpen(false)}>
                        <User size={16} />
                        Perfil
                    </Link>

                    <Link href="/profile?tab=favorites" className={styles.menuItem} onClick={() => setIsOpen(false)}>
                        <Star size={16} />
                        Favoritos
                    </Link>

                    {isSuperAdmin(user) && (
                        <>
                            <div className={styles.dropdownDivider} />
                            <Link href="/admin/super" className={styles.menuItemAdmin} onClick={() => setIsOpen(false)}>
                                <Shield size={16} />
                                Super Admin
                            </Link>
                        </>
                    )}

                    <div className={styles.dropdownDivider} />

                    <Link href="/profile/settings" className={styles.menuItem} onClick={() => setIsOpen(false)}>
                        <Settings size={16} />
                        Configuración
                    </Link>

                    <button className={styles.menuItemDanger} onClick={handleSignOut}>
                        <LogOut size={16} />
                        Cerrar Sesión
                    </button>
                </div>
            )}
        </div>
    )
}
