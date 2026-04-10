'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useAuth } from '@/context/AuthContext';
import { useSport } from '@/context/SportContext';
import { usePathname, useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';
const GlobalSearch = dynamic(() => import('@/components/GlobalSearch'), { ssr: false });
import { resolveAdminPanel } from '@/lib/auth/roles';

export default function Header() {
    const { user, logout } = useAuth();
    const { selectedSport } = useSport();
    const router = useRouter();
    const pathname = usePathname();
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsUserMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleLogout = () => {
        logout();
        setIsUserMenuOpen(false);
        router.push('/');
    };

    // Helper to generate initials
    const getInitials = (name: string) => {
        return name ? name.substring(0, 2).toUpperCase() : 'US';
    };

    // Helper for breadcrumbs - Memoized based on path
    const breadcrumbsComponent = useMemo(() => {
        if (!pathname) return null;

        const segments = pathname.split('/').filter(Boolean);
        const breadcrumbs: { label: string; isCurrent: boolean }[] = [];

        // Always start with Panel
        breadcrumbs.push({ label: 'Panel', isCurrent: false });

        // Add G22 Scores as base
        breadcrumbs.push({ label: 'G22 Scores', isCurrent: segments.length === 0 });

        // Map path segments to readable names
        const segmentLabels: Record<string, string> = {
            'admin': 'Admin Dashboard',
            'entities': 'Entidades',
            'manage': 'Gestión',
            'torneo': 'Torneo',
            'torneos': 'Torneos',
            'tournaments': 'Torneos',
            'union': 'Unión',
            'super': 'Super Admin',
            'participantes': 'Participantes',
            'fases': 'Fases',
            'fixture': 'Fixture',
            'resultados': 'Resultados',
            'config': 'Configuración',
            'matches': 'Partidos',
            'clubes': 'Clubes',
            'users': 'Usuarios',
            'settings': 'Ajustes',
            'club-admin': 'Club Admin',
            'rankings': 'Rankings',
            'identidad': 'Identidad',
            'divisiones': 'Divisiones',
            'planteles': 'Planteles',
            'staff': 'Staff',
            'disciplinas': 'Disciplinas',
            'estadisticas': 'Estadísticas',
            'documentos': 'Documentos',
            'comunicaciones': 'Comunicaciones',
            'sponsors': 'Sponsors',
            'usuarios': 'Usuarios',
            'integraciones': 'Integraciones',
            'auditoria': 'Auditoría',
        };

        // Process each segment
        segments.forEach((segment, index) => {
            // Skip IDs (usually alphanumeric like 't1', 'u1', etc.) but keep named slugs
            const isId = /^[a-z]?\d+$/.test(segment) || segment.length > 20;

            if (!isId) {
                const label = segmentLabels[segment] || segment.charAt(0).toUpperCase() + segment.slice(1);
                const isCurrent = index === segments.length - 1;
                breadcrumbs.push({ label, isCurrent });
            }
        });

        return (
            <div className="g22-header-center">
                {breadcrumbs.map((crumb, index) => (
                    <span key={index}>
                        {index > 0 && <span className="sep">/</span>}
                        <span className={crumb.isCurrent ? 'current' : ''}>{crumb.label}</span>
                    </span>
                ))}
            </div>
        );
    }, [pathname]);

    const adminPanel = resolveAdminPanel(user?.role, user?.memberships);
    const canSeeProde = true;
    const isNewsRoute = pathname?.startsWith('/noticias') ?? false;
    const isRankingsRoute = pathname?.startsWith('/rankings') ?? false;
    const isProdeRoute = pathname?.startsWith('/prode') ?? false;
    const rankingsHref = `/rankings?sport=${encodeURIComponent(selectedSport.id)}`;

    return (
        <header className="g22-header">
            <div className="g22-header-inner">
                {/* LOGO: Left Zone */}
                <Link href="/" className="g22-logo">
                    G22<span>Scores</span>
                </Link>

                {/* BREADCRUMB: Center Zone (Contextual) */}
                <div className="g22-header-center-zone">
                    {breadcrumbsComponent}
                    <GlobalSearch />
                </div>

                {/* USER + THEME: Right Zone */}
                <div className="g22-header-actions">
                    <Link
                        href="/noticias"
                        className={`g22-desktop-link ${isNewsRoute ? 'active' : ''}`}
                        aria-current={isNewsRoute ? 'page' : undefined}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M5 7h14" />
                            <path d="M5 12h10" />
                            <path d="M5 17h14" />
                            <path d="M19 5v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5" />
                        </svg>
                        <span>Noticias</span>
                    </Link>

                    {canSeeProde ? (
                        <Link
                            href="/prode"
                            className={`g22-desktop-link ${isProdeRoute ? 'active' : ''}`}
                            aria-current={isProdeRoute ? 'page' : undefined}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M4 6h16" />
                                <path d="M7 12h10" />
                                <path d="M10 18h4" />
                                <circle cx="7" cy="12" r="1.2" fill="currentColor" stroke="none" />
                                <circle cx="17" cy="12" r="1.2" fill="currentColor" stroke="none" />
                            </svg>
                            <span>Prode</span>
                        </Link>
                    ) : null}

                    <Link
                        href={rankingsHref}
                        className={`g22-desktop-link ${isRankingsRoute ? 'active' : ''}`}
                        aria-current={isRankingsRoute ? 'page' : undefined}
                    >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M6 21h12" />
                            <path d="M8 18h8" />
                            <path d="M8 3h8v4a4 4 0 0 1-8 0V3z" />
                            <path d="M6 3H4a2 2 0 0 0-2 2v1a5 5 0 0 0 5 5" />
                            <path d="M18 3h2a2 2 0 0 1 2 2v1a5 5 0 0 1-5 5" />
                            <path d="M12 12v6" />
                        </svg>
                        <span>Rankings</span>
                    </Link>

                    <button 
                        className="g22-mobile-search-btn" 
                        aria-label="Buscar" 
                        style={{ background: 'transparent', border: 'none', padding: '8px', cursor: 'pointer', color: 'inherit', display: 'flex' }}
                        onClick={() => router.push('/search')}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </button>

                    <ThemeToggle />
                    <div className="g22-user-wrapper" ref={menuRef}>
                        <button
                            className="g22-user"
                            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                            aria-expanded={isUserMenuOpen}
                            type="button"
                        >
                            {user ? (
                                <>
                                    <div className="avatar">{getInitials(user.name || '')}</div>
                                    <span className="name">{user.name || 'Usuario'}</span>
                                </>
                            ) : (
                                // Fallback if no user loaded yet or guest
                                <>
                                    <div className="avatar">G</div>
                                    <span className="name">Invitado</span>
                                </>
                            )}
                            <svg
                                className="chevron"
                                style={{ transform: isUserMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <polyline points="6 9 12 15 18 9"></polyline>
                            </svg>
                        </button>


                        {/* DROPDOWN - Controlled by class 'show' or inline styles based on state */}
                        <div className={`g22-user-menu ${isUserMenuOpen ? 'show' : ''}`} style={isUserMenuOpen ? { opacity: 1, visibility: 'visible', transform: 'translateY(0)' } : {}}>
                            {user && (
                                <>
                                    <div style={{ padding: '16px', borderBottom: '1px solid var(--color-border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                                            {user.avatarUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={user.avatarUrl} alt={user.name} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--color-border)' }} />
                                            ) : (
                                                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)', fontWeight: 'bold', border: '1px solid var(--color-border)' }}>
                                                    {getInitials(user.name || '')}
                                                </div>
                                            )}
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.name || 'Usuario'}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>@{user.email?.split('@')[0] || 'usuario'}</div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: '8px' }}>{user.email}</div>
                                        <div style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', background: 'var(--color-bg-tertiary)', fontSize: '11px', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                                            {adminPanel ? 'Administrador' : 'Usuario'}
                                        </div>
                                        <Link href="/profile" onClick={() => setIsUserMenuOpen(false)} style={{ display: 'block', marginTop: '12px', textAlign: 'center', background: 'var(--color-button-primary, #00C853)', color: 'white', padding: '8px', borderRadius: '6px', fontSize: '13px', fontWeight: 600, textDecoration: 'none' }}>
                                            Editar perfil
                                        </Link>
                                    </div>

                                    <div style={{ padding: '8px 0' }}>
                                        <Link href="/favorites" onClick={() => setIsUserMenuOpen(false)}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l3.1 6.3 7 1-5 4.9 1.2 6.9L12 18l-6.3 3.1 1.2-6.9-5-4.9 7-1L12 3z" /></svg>
                                            Mis Seguidos
                                        </Link>

                                        {adminPanel && (
                                            <Link href={adminPanel.href} onClick={() => setIsUserMenuOpen(false)}>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                                                {adminPanel.label}
                                            </Link>
                                        )}
                                    </div>

                                    <hr />
                                    <button className="logout" onClick={handleLogout}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                                        Cerrar Sesión
                                    </button>
                                </>
                            )}
                            {!user && (
                                <Link href="/login" className="logout" onClick={() => setIsUserMenuOpen(false)} style={{ color: 'var(--color-text-primary)' }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path><polyline points="10 17 15 12 10 7"></polyline><line x1="15" y1="12" x2="3" y2="12"></line></svg>
                                    Iniciar Sesión
                                </Link>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </header >
    );
}
