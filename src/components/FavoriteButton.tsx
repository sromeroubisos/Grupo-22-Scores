'use client'

import { useState, useEffect } from 'react'
import { Star } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { EntityType } from '@/lib/types/user'
import styles from './FavoriteButton.module.css'

interface FavoriteButtonProps {
    entityType: EntityType
    entityId: string
    size?: number
    className?: string
    showLabel?: boolean
}

export default function FavoriteButton({
    entityType,
    entityId,
    size = 20,
    className = '',
    showLabel = false
}: FavoriteButtonProps) {
    const [isFavorited, setIsFavorited] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const supabase = createClient()

    // Check auth status and if item is favorited
    useEffect(() => {
        checkAuthAndFavorite()
    }, [entityType, entityId])

    async function checkAuthAndFavorite() {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
            setIsAuthenticated(false)
            return
        }

        setIsAuthenticated(true)

        // Check if favorited
        const { data } = await supabase
            .rpc('is_favorited', {
                p_entity_type: entityType,
                p_entity_id: entityId
            })

        setIsFavorited(data || false)
    }

    async function toggleFavorite(e: React.MouseEvent) {
        e.preventDefault()
        e.stopPropagation()

        if (!isAuthenticated) {
            // Redirect to login
            window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname)
            return
        }

        setIsLoading(true)

        try {
            const { data, error } = await supabase
                .rpc('toggle_favorite', {
                    p_entity_type: entityType,
                    p_entity_id: entityId
                })

            if (error) throw error

            setIsFavorited(data)
        } catch (error) {
            console.error('Error toggling favorite:', error)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <button
            onClick={toggleFavorite}
            disabled={isLoading}
            className={`${styles.favoriteButton} ${className}`}
            title={isFavorited ? 'Quitar de favoritos' : 'Agregar a favoritos'}
            aria-label={isFavorited ? 'Quitar de favoritos' : 'Agregar a favoritos'}
        >
            <Star
                size={size}
                fill={isFavorited ? 'currentColor' : 'none'}
                className={styles.star}
                style={{
                    color: isFavorited ? 'var(--color-accent)' : 'currentColor',
                    transition: 'all 0.2s'
                }}
            />
            {showLabel && (
                <span className={styles.label}>
                    {isFavorited ? 'Favorito' : 'Favorito'}
                </span>
            )}
        </button>
    )
}
