'use client';

import { ExternalLink, Save } from 'lucide-react';
import { Button, Badge } from '@/components/admin/ui';
import { Database } from '@/lib/database.types';
import Link from 'next/link';
import type { ManagedClubSummary } from '@/lib/club-admin/managedClubFamily';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubManageHeaderProps {
    id: string;
    data: Partial<ClubRow>;
    sportLabel?: string;
    isDirty: boolean;
    isSaving: boolean;
    onSave: () => void;
    unionName?: string;
    managedClubs: ManagedClubSummary[];
    currentClubId: string;
    familyClubCount: number;
}

export function ClubManageHeader({
    id,
    data,
    sportLabel,
    isDirty,
    isSaving,
    onSave,
    unionName,
    managedClubs,
    currentClubId,
    familyClubCount,
}: ClubManageHeaderProps) {
    const currentClub = managedClubs.find((club) => club.id === currentClubId) ?? null;

    return (
        <header className="main-header">
            <div className="header-copy">
                <span className="header-kicker">Panel de gestion</span>
                <div className="club-title">{data.name || currentClub?.name || 'Nuevo club'}</div>
                <div className="subinfo">
                    {sportLabel || (data.categories?.length ? 'Rugby' : 'Deporte')} / {data.city || 'Ciudad'} / {unionName || 'Sin union'}
                </div>
                <div className="badges">
                    <Badge variant={data.is_visible ? 'success' : 'default'}>
                        {data.is_visible ? 'Publicado' : 'Borrador'}
                    </Badge>
                    <Badge variant="info">
                        {familyClubCount > 1 ? `${familyClubCount} clubes en familia` : 'Operación individual'}
                    </Badge>
                    <Badge variant="default">{id === 'new' ? 'Core pending' : 'Core synced'}</Badge>
                </div>
            </div>

            <div className="header-tools">
                {isDirty ? (
                    <div className="dirty-indicator">
                        <div className="dirty-dot"></div>
                        <span>Cambios sin guardar</span>
                    </div>
                ) : null}

                {data.slug ? (
                    <Link
                        href={`/clubs/${data.slug}`}
                        target="_blank"
                        className="ca-btn ca-btn--secondary text-sm h-9 px-3"
                    >
                        <ExternalLink className="w-4 h-4" />
                        Portal público
                    </Link>
                ) : null}

                <Button
                    variant="primary"
                    size="sm"
                    onClick={onSave}
                    disabled={isSaving || (!isDirty && id !== 'new')}
                    isLoading={isSaving}
                    leftIcon={!isSaving ? <Save className="w-4 h-4" /> : undefined}
                >
                    {isSaving ? 'Guardando...' : 'Guardar'}
                </Button>
            </div>
        </header>
    );
}
