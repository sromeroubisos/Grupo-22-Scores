'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { EntityType } from '@/lib/types/user';
import { getFavoriteSet, updateFavoriteSet } from '@/lib/favoritesCache';
import styles from './FavoriteButton.module.css';

interface FavoriteButtonProps {
    entityType: EntityType;
    entityId: string;
    size?: number;
    className?: string;
    showLabel?: boolean;
}

export default function FavoriteButton({
    entityType,
    entityId,
    size = 20,
    className = '',
    showLabel = false
}: FavoriteButtonProps) {
    const [isFavorited, setIsFavorited] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [isAuthenticated, setIsAuthenticated] = useState(false);

    const [userId, setUserId] = useState<string | null>(null);

    // Memoize client creation
    const supabase = useMemo(() => createClient(), []);
    const isMounted = useRef(true);

    // Check auth status and if item is favorited
    useEffect(() => {
        isMounted.current = true;
        checkAuthAndFavorite();
        return () => { isMounted.current = false; };
    }, [entityType, entityId]);

    async function checkAuthAndFavorite() {
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (!isMounted.current) return;

            // Ignore session errors that might be abort-related
            if (sessionError) return;

            if (!session) {
                setIsAuthenticated(false);
                setUserId(null); // Clear userId
                return;
            }

            setIsAuthenticated(true);
            const uid = session.user.id;
            setUserId(uid); // Save to bypass getSession in toggleFavorite

            const favSet = await getFavoriteSet(supabase, uid, entityType);

            if (!isMounted.current) return;

            if (favSet) {
                setIsFavorited(favSet.has(entityId));
            }
        } catch (error: any) {
            // Ignore AbortErrors
            if (error.name === 'AbortError' || error.message?.includes('abort')) return;
            console.error('Error checking favorite:', error);
        }
    }

    async function toggleFavorite(e: React.MouseEvent) {
        e.preventDefault();
        e.stopPropagation();

        if (!isAuthenticated) {
            // Redirect to login
            if (typeof window !== 'undefined') {
                window.location.href = '/login?returnTo=' + encodeURIComponent(window.location.pathname);
            }
            return;
        }

        if (!isMounted.current) return;
        setIsLoading(true);

        try {
            const { data, error } = await supabase
                .rpc('toggle_favorite', {
                    p_entity_type: entityType,
                    p_entity_id: entityId
                });

            if (error) throw error;

            if (isMounted.current) {
                setIsFavorited(data);
            }

            // Update cache locally avoiding DB fetch
            if (userId) {
                updateFavoriteSet(userId, entityType, entityId, data);
            }
        } catch (error: any) {
            if (error.name === 'AbortError' || error.message?.includes('abort')) return;
            console.error('Error toggling favorite:', error);
        } finally {
            if (isMounted.current) {
                setIsLoading(false);
            }
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
    );
}
