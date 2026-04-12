'use client';

import type { EntityType } from '@/lib/types/user';

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
}

export default function FavoriteButton(_props: FavoriteButtonProps) {
    return null;
}
