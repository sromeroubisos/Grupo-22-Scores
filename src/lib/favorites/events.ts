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

export function favoriteEventMatches(
    detail: Pick<FavoriteUpdatedDetail, 'entityId' | 'entityType'>,
    entityId: string,
    entityType: EntityType,
): boolean {
    if (normalizeEntityId(detail.entityId) !== normalizeEntityId(entityId)) {
        return false;
    }

    if (isCompetitionEntityType(detail.entityType) || isCompetitionEntityType(entityType)) {
        return isCompetitionEntityType(detail.entityType) && isCompetitionEntityType(entityType);
    }

    return detail.entityType === entityType;
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
