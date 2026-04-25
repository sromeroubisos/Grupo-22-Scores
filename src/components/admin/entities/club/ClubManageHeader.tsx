'use client';

import { ExternalLink, Loader2, Save } from 'lucide-react';
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
                    <span className={`badge ${data.is_visible ? 'badge-visible' : 'badge-draft'}`}>
                        {data.is_visible ? 'Publicado' : 'Borrador'}
                    </span>
                    <span className="badge badge-health">
                        {familyClubCount > 1 ? `${familyClubCount} clubes en familia` : 'Operacion individual'}
                    </span>
                    <span className="badge badge-neutral">{id === 'new' ? 'Core pending' : 'Core synced'}</span>
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
                    <Link href={`/clubs/${data.slug}`} target="_blank" className="btn">
                        <ExternalLink className="w-4 h-4" />
                        Portal publico
                    </Link>
                ) : null}

                <button
                    type="button"
                    onClick={onSave}
                    disabled={isSaving || (!isDirty && id !== 'new')}
                    className="btn btn-primary"
                >
                    {isSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                        <Save className="w-4 h-4" />
                    )}
                    {isSaving ? 'Guardando...' : 'Guardar'}
                </button>
            </div>
        </header>
    );
}
