'use client';

import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
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
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentClub = managedClubs.find((club) => club.id === currentClubId) ?? null;
    const familyOptions = useMemo(
        () => managedClubs.filter((club) => club.familyRootId === currentClub?.familyRootId),
        [currentClub?.familyRootId, managedClubs]
    );

    const handleClubChange = (clubId: string) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set('club', clubId);
        params.set('type', 'club');
        router.push(`${pathname}?${params.toString()}`);
    };

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
                <div className="club-selector-block">
                    <span className="club-selector-label">
                        {familyOptions.length > 1 ? 'Club seleccionado' : 'Unidad activa'}
                    </span>
                    {familyOptions.length > 1 ? (
                        <div className="club-selector-pill-wrap">
                            <select
                                className="club-selector-pill"
                                value={currentClubId}
                                onChange={(event) => handleClubChange(event.target.value)}
                            >
                                {familyOptions.map((club) => (
                                    <option key={club.id} value={club.id}>
                                        {club.shortName || club.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : (
                        <div className="club-selector-static">
                            {data.short_name || currentClub?.shortName || 'Principal'}
                        </div>
                    )}
                </div>

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
