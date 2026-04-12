import {
    buildClubCandidateIds,
    buildTournamentCandidateIds,
} from '@/lib/favorites/fetchFavorites';
import type { EntityType } from '@/lib/types/user';

export const FAVORITES_UPDATED_EVENT = 'favorites:updated';

export type FavoriteUpdatedDetail = {
    userId?: string | null;
    entityId: string;
    entityType: EntityType;
    isFavorite: boolean;
    name?: string;
    logo_url?: string | null;
    color?: string | null;
    type_label?: string;
    created_at?: string;
};

function normalizeEntityId(value: string): string {
    return value.trim();
}

function isCompetitionEntityType(entityType: EntityType): boolean {
    return entityType === 'league' || entityType === 'tournament';
}

function isClubEntityType(entityType: EntityType): boolean {
    return entityType === 'club' || entityType === 'team';
}

/**
 * Checks if a favorite event detail matches a specific entity, considering aliases.
 */
export function favoriteEventMatches(
    detail: Pick<FavoriteUpdatedDetail, 'entityId' | 'entityType'>,
    entityId: string,
    entityType: EntityType,
): boolean {
    const detailId = normalizeEntityId(detail.entityId);
    const targetId = normalizeEntityId(entityId);

    // If exact match, we're done
    if (detailId === targetId) {
        return true;
    }

    // Handle aliases for clubs
    if (isClubEntityType(detail.entityType) && isClubEntityType(entityType)) {
        const detailAliases = buildClubCandidateIds(detailId);
        return detailAliases.includes(targetId);
    }

    // Handle aliases for competitions
    if (isCompetitionEntityType(detail.entityType) && isCompetitionEntityType(entityType)) {
        const detailAliases = buildTournamentCandidateIds(detailId);
        return detailAliases.includes(targetId);
    }

    return false;
}

export function dispatchFavoriteUpdated(detail: FavoriteUpdatedDetail): void {
    if (typeof window === 'undefined') return;

    window.dispatchEvent(new CustomEvent<FavoriteUpdatedDetail>(FAVORITES_UPDATED_EVENT, {
        detail: {
            ...detail,
            entityId: normalizeEntityId(detail.entityId),
        },
    }));
}
