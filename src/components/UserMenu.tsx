'use client'

import { useState, useEffect, useRef } from 'react'
import { User, Settings, Star, LogOut, Shield } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { FAVORITES_ENABLED } from '@/lib/favorites/config'
import styles from './UserMenu.module.css'

export default function UserMenu() {
    const { user, logout, isLoading } = useAuth()
    const [isOpen, setIsOpen] = useState(false)
    const menuRef = useRef<HTMLDivElement>(null)
    const router = useRouter()
    const isSuperAdmin = user?.role === 'super_admin' || user?.role === 'admin_general'

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

    async function handleSignOut() {
        try {
            await logout()
        } finally {
            setIsOpen(false)
            router.push('/')
            router.refresh()
        }
    }

    if (isLoading) {
        return null
    }

    if (!user) {
        return (
            <Link href="/login" className={styles.loginButton}>
                Iniciar SesiÃ³n
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
                {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name || 'User'} className={styles.avatar} />
                ) : (
                    <div className={styles.avatarPlaceholder}>
                        {user.name?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                    </div>
                )}
                {isSuperAdmin && (
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
                        {isSuperAdmin && (
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

                    {FAVORITES_ENABLED && (
                        <Link href="/favorites" className={styles.menuItem} onClick={() => setIsOpen(false)}>
                            <Star size={16} />
                            Siguiendo
                        </Link>
                    )}

                    {isSuperAdmin && (
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
                        ConfiguraciÃ³n
                    </Link>

                    <button className={styles.menuItemDanger} onClick={handleSignOut}>
                        <LogOut size={16} />
                        Cerrar SesiÃ³n
                    </button>
                </div>
            )}
        </div>
    )
}
