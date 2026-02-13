'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { usePathname, useRouter } from 'next/navigation';
import ThemeToggle from '@/components/ThemeToggle';

export default function Header() {
    const { user, logout } = useAuth();
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

    // Helper for breadcrumbs - Dynamic based on path
    const renderBreadcrumbs = () => {
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
    };

    const adminRoles = ['admin_general'];

    return (
        <header className="g22-header">
            <div className="g22-header-inner">
                {/* LOGO: Left Zone */}
                <Link href="/" className="g22-logo">
                    G22<span>Scores</span>
                </Link>

                {/* BREADCRUMB: Center Zone (Contextual) */}
                {renderBreadcrumbs()}

                {/* USER + THEME: Right Zone */}
                <div className="g22-header-actions">
                    <button className="g22-mobile-search-btn" aria-label="Buscar" style={{ background: 'transparent', border: 'none', padding: '8px', cursor: 'pointer', color: 'inherit', display: 'flex' }}>
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
                            <Link href="/profile" onClick={() => setIsUserMenuOpen(false)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                Mi Perfil
                            </Link>
                            {user && adminRoles.includes(user.role) && (
                                <Link
                                    href="/admin/super"
                                    onClick={() => setIsUserMenuOpen(false)}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                                    Panel Admin
                                </Link>
                            )}
                            <Link href="/" onClick={() => setIsUserMenuOpen(false)}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
                                Ir al Inicio
                            </Link>
                            <hr />
                            {user ? (
                                <button className="logout" onClick={handleLogout}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                                    Cerrar Sesión
                                </button>
                            ) : (
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
