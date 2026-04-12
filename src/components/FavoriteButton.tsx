'use client';

import { Star } from 'lucide-react';
import { useFavorite } from '@/hooks/useFavorites';
import {
    FAVORITES_ENABLED,
    FAVORITE_CLUBS_ENABLED,
    FAVORITE_LEAGUES_ENABLED,
} from '@/lib/favorites/config';
import type { EntityType } from '@/lib/types/user';
import styles from './FavoriteButton.module.css';

interface FavoriteButtonProps {
    entityType: EntityType;
    entityId: string;
    size?: number;
    className?: string;
    showLabel?: boolean;
    name?: string;
    logoUrl?: string | null;
    color?: string | null;
    typeLabel?: string;
    sportId?: string | null;
    canonicalId?: string | null;
}

function isSupportedEntityType(entityType: EntityType): boolean {
    if (entityType === 'club' || entityType === 'team') {
        return FAVORITE_CLUBS_ENABLED;
    }

    if (entityType === 'league' || entityType === 'tournament') {
        return FAVORITE_LEAGUES_ENABLED;
    }

    return false;
}

export default function FavoriteButton(props: FavoriteButtonProps) {
    const {
        entityType,
        entityId,
        size = 16,
        className = '',
        showLabel = false,
        name,
        logoUrl,
        color,
        typeLabel,
        sportId,
        canonicalId,
    } = props;
    const { isFavorited, loading, toggle } = useFavorite(entityType, entityId);

    if (!FAVORITES_ENABLED || !isSupportedEntityType(entityType)) {
        return null;
    }

    return (
        <button
            type="button"
            className={`${styles.favoriteButton} ${className}`.trim()}
            aria-label={isFavorited ? 'Dejar de seguir' : 'Seguir'}
            title={isFavorited ? 'Dejar de seguir' : 'Seguir'}
            disabled={loading}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void toggle({
                    name,
                    logo_url: logoUrl,
                    color,
                    type_label: typeLabel,
                    sport_id: sportId,
                    canonical_id: canonicalId,
                });
            }}
        >
            <Star
                size={size}
                className={styles.star}
                fill={isFavorited ? 'currentColor' : 'none'}
            />
            {showLabel ? <span className={styles.label}>{isFavorited ? 'Siguiendo' : 'Seguir'}</span> : null}
        </button>
    );
}
