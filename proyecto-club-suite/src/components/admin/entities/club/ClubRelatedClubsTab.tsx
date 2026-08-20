'use client';

import Link from 'next/link';
import { buildClubManageHref, type ClubConsoleMode } from '@/lib/clubAdminRoutes';

interface RelatedClubItem {
    id: string;
    name: string;
    shortName: string | null;
    logoUrl: string | null;
    sport: string | null;
    familyRootId: string;
    parentClubId: string | null;
    parentClubName: string | null;
    isRoot: boolean;
    isCurrent: boolean;
}

interface ClubRelatedClubsTabProps {
    clubs: RelatedClubItem[];
    rootClubName?: string | null;
    loading?: boolean;
    navigationMode?: ClubConsoleMode;
}

function getRoleLabel(club: RelatedClubItem) {
    if (club.isRoot) return 'Base';
    if (club.isCurrent) return 'Activo';
    return club.parentClubId === club.familyRootId ? 'Derivado' : 'Subderivado';
}

export function ClubRelatedClubsTab({
    clubs,
    rootClubName,
    loading,
    navigationMode = 'admin',
}: ClubRelatedClubsTabProps) {
    if (loading) {
        return (
            <div
                style={{
                    minHeight: '220px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--text-muted)',
                }}
            >
                Cargando familia del club...
            </div>
        );
    }

    return (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
            <div className="card-header">
                <div>
                    <div className="card-title">Clubes relacionados</div>
                    <div className="subinfo">
                        {rootClubName
                            ? `Familia conectada a ${rootClubName}`
                            : 'Familia de clubes vinculada a este club'}
                    </div>
                </div>
            </div>

            {clubs.length === 0 ? (
                <div
                    style={{
                        padding: '3rem 1.5rem',
                        border: '1px dashed var(--border)',
                        borderRadius: '16px',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                    }}
                >
                    Este club todavía no tiene familia vinculada.
                </div>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                        gap: '1rem',
                    }}
                >
                    {clubs.map((club) => (
                        <div
                            key={club.id}
                            style={{
                                border: `1px solid ${club.isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                                borderRadius: '18px',
                                padding: '1.25rem',
                                background: club.isCurrent ? 'var(--surface-elevated)' : 'var(--surface)',
                                display: 'grid',
                                gap: '0.9rem',
                            }}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'flex-start' }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '1rem', fontWeight: 900, letterSpacing: '-0.03em' }}>
                                        {club.name}
                                    </div>
                                    <div className="subinfo" style={{ marginTop: '0.25rem' }}>
                                        {club.shortName || club.id}
                                        {club.sport ? ` · ${club.sport}` : ''}
                                    </div>
                                </div>
                                <span
                                    style={{
                                        padding: '0.25rem 0.6rem',
                                        borderRadius: '999px',
                                        border: '1px solid var(--border)',
                                        fontSize: '0.7rem',
                                        fontWeight: 900,
                                        textTransform: 'uppercase',
                                        color: club.isCurrent ? 'var(--accent)' : 'var(--text-muted)',
                                        whiteSpace: 'nowrap',
                                    }}
                                >
                                    {getRoleLabel(club)}
                                </span>
                            </div>

                            <div style={{ display: 'grid', gap: '0.45rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                <div>
                                    {club.isRoot
                                        ? 'Es el club base de la familia.'
                                        : club.parentClubName
                                            ? `Depende de ${club.parentClubName}.`
                                            : 'Vinculado dentro de la misma familia.'}
                                </div>
                                {club.isCurrent && (
                                    <div style={{ color: 'var(--accent)', fontWeight: 700 }}>
                                        Este es el club que estás gestionando ahora.
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                                <span className="mono" style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    ID {club.id}
                                </span>
                                {!club.isCurrent && (
                                    <Link
                                        href={buildClubManageHref(club.id, 'equipos', navigationMode)}
                                        prefetch={false}
                                        className="btn"
                                        style={{ textDecoration: 'none' }}
                                    >
                                        Abrir
                                    </Link>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
