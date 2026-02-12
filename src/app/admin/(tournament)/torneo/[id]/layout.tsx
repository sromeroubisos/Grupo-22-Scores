'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/mock-db';
import Link from 'next/link';
import '@/app/admin/styles/admin-custom.css';

export default function TournamentLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();
    const params = useParams();
    const pathname = usePathname();
    const tournamentId = params?.id as string;

    const [tournament, setTournament] = useState<any>(null);
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) return;

        // 1. Check Tournament Exists
        const foundTournament = db.tournaments.find(t => t.id === tournamentId || t.slug === tournamentId);

        if (!foundTournament) {
            console.error('Tournament not found, redirecting...');
            router.push('/admin');
            return;
        }

        // Enrich with Union Logo if tournament has no logo
        const union = db.unions.find(u => u.id === foundTournament.unionId);

        // Mock Logo logic: Try to find a logo in local storage or use union logo or placeholder
        // In a real app this would be in the DB
        const enriched = {
            ...foundTournament,
            logoUrl: (foundTournament as any).logoUrl || union?.branding?.logoUrl,
            unionName: union?.name
        };

        setTournament(enriched);

        // 2. Check Permissions
        const membership = db.memberships.find(m =>
            m.userId === user?.id &&
            m.scopeType === 'tournament' &&
            m.scopeId === foundTournament.id
        );

        const unionMembership = db.memberships.find(m =>
            m.userId === user?.id &&
            m.scopeType === 'union' &&
            m.scopeId === foundTournament.unionId &&
            m.role === 'admin'
        );

        const isSuperAdmin = user?.role === 'admin_general';

        if (membership || unionMembership || isSuperAdmin) {
            setIsAuthorized(true);
        } else {
            router.push('/admin?error=unauthorized');
        }
    }, [isAuthenticated, user, router, tournamentId]);

    // Loading State
    if (!isAuthenticated || !tournament || !isAuthorized) {
        return (
            <div style={{ padding: '50px', display: 'flex', justifyContent: 'center', background: '#050607', minHeight: '100vh', alignItems: 'center' }}>
                <div style={{ color: '#00ff88', fontFamily: 'monospace' }}>AUTHENTICATING ACCESS...</div>
            </div>
        );
    }

    // Tabs configuration
    const tabs = [
        { label: 'Información', path: `/admin/torneo/${tournamentId}` },
        { label: 'Participantes', path: `/admin/torneo/${tournamentId}/participantes` },
        { label: 'Fases', path: `/admin/torneo/${tournamentId}/fases` },
        { label: 'Fixture', path: `/admin/torneo/${tournamentId}/fixture` },
        { label: 'Resultados', path: `/admin/torneo/${tournamentId}/resultados` },
        { label: 'Configuración', path: `/admin/torneo/${tournamentId}/config` },
    ];

    const isTabActive = (path: string) => {
        if (path === `/admin/torneo/${tournamentId}`) {
            return pathname === path;
        }
        return pathname?.startsWith(path);
    };

    // Check if we're in the fases page (creating/editing phase)
    const isInFasesPage = pathname?.includes('/fases');

    return (
        <div className="tournamentPage">
            {/* Header del Torneo - Identidad Visual */}
            {!isInFasesPage && (
                <div style={{
                    padding: '24px 32px 0',
                    background: 'linear-gradient(to bottom, rgba(255,255,255,0.02) 0%, transparent 100%)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '8px' }}>
                        {/* Logo */}
                        <div style={{
                            width: '80px',
                            height: '80px',
                            background: 'rgba(255,255,255,0.03)',
                            borderRadius: '16px',
                            border: '1px solid rgba(255,255,255,0.08)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                        }}>
                            <img
                                src={tournament.logoUrl || "https://placehold.co/400x400/png"}
                                alt={tournament.name}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = "https://placehold.co/400x400/png?text=🏆";
                                }}
                            />
                        </div>

                        {/* Info */}
                        <div>
                            <div style={{
                                fontSize: '11px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.05em',
                                color: 'rgba(255,255,255,0.5)',
                                fontWeight: 600,
                                marginBottom: '4px'
                            }}>
                                {tournament.seasonId || 'Temporada Actual'} • {tournament.unionName || 'Unión'}
                            </div>
                            <h1 style={{
                                fontSize: '32px',
                                fontWeight: 800,
                                color: 'rgba(255,255,255,0.92)',
                                lineHeight: 1.1,
                                margin: 0
                            }}>
                                {tournament.name}
                            </h1>
                            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                                <span style={{
                                    fontSize: '11px',
                                    padding: '4px 8px',
                                    background: tournament.status === 'published' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(234, 179, 8, 0.1)',
                                    color: tournament.status === 'published' ? '#22c55e' : '#eab308',
                                    borderRadius: '6px',
                                    fontWeight: 700,
                                    border: `1px solid ${tournament.status === 'published' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)'}`,
                                    textTransform: 'uppercase'
                                }}>
                                    {tournament.status === 'published' ? 'Publicado' : 'Borrador'}
                                </span>
                                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)' }}>
                                    {tournament.sport || 'Rugby'} • {tournament.category || 'Profesional'} • {tournament.format || 'Liga'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Subheader con acciones - Solo mostrar si NO estamos en fases */}
            {!isInFasesPage && (
                <div className="tournamentSubheader">
                    <div className="tournamentSubheaderInner">
                        <div className="tournamentActions">
                            <button className="adminBtn adminBtn--ghost">
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V11"></path>
                                    <path d="M13.5 2.5a2.121 2.121 0 0 1 3 3L10 12l-4 1 1-4 6.5-6.5z"></path>
                                </svg>
                                Editar
                            </button>
                            <button className="adminBtn adminBtn--primary">
                                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="8" cy="8" r="7"></circle>
                                    <path d="M8 4v4l3 3"></path>
                                </svg>
                                Publicar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs de navegación - Sticky */}
            <div className="tournamentTabs">
                <div className="tournamentTabsInner">
                    {tabs.map((tab) => (
                        <Link
                            key={tab.path}
                            href={tab.path}
                            className={`tournamentTab ${isTabActive(tab.path) ? 'isActive' : ''}`}
                        >
                            {tab.label}
                        </Link>
                    ))}
                </div>
            </div>

            {/* Contenido principal - Debajo de los tabs */}
            <main className="tournamentMain">{children}</main>
        </div>
    );
}
