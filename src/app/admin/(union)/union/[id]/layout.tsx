'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter, useParams, usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/mock-db';

export default function UnionLayout({ children }: { children: React.ReactNode }) {
    const { user, isAuthenticated } = useAuth();
    const router = useRouter();
    const params = useParams();
    const pathname = usePathname();
    const unionId = params?.id as string;

    const [union, setUnion] = useState<any>(null);
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        if (!isAuthenticated) return;

        const foundUnion = db.unions.find(u => u.id === unionId);
        if (!foundUnion) {
            console.error('Union not found');
            router.push('/admin');
            return;
        }
        setUnion(foundUnion);

        const membership = db.memberships.find(m =>
            m.userId === user?.id &&
            m.scopeType === 'union' &&
            m.scopeId === unionId &&
            m.role === 'admin'
        );

        const isSuperAdmin = user?.role === 'admin_general';

        if (membership || isSuperAdmin) {
            setIsAuthorized(true);
        } else {
            router.push('/admin?error=unauthorized');
        }
    }, [isAuthenticated, user, router, unionId]);

    if (!isAuthenticated || !union || !isAuthorized) {
        return (
            <div style={{ padding: '50px', display: 'flex', justifyContent: 'center' }}>
                <div className="spinner"></div>
            </div>
        );
    }

    const hideUnionHeader = user?.role === 'admin_general';

    return (
        <div style={{ minHeight: '100vh', background: '#07090c', display: 'flex', flexDirection: 'column' }}>
            {!hideUnionHeader && (
                <div style={{
                    background: 'rgba(10, 10, 10, 0.95)',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    padding: '24px 32px 0 32px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '24px', marginBottom: '24px' }}>
                        <div style={{
                            width: '64px',
                            height: '64px',
                            borderRadius: '12px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden'
                        }}>
                            <img
                                src={union.branding?.logoUrl || "https://placehold.co/400x400/png"}
                                alt={union.name}
                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = "https://placehold.co/400x400/png?text=🏛️";
                                }}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'rgba(255, 255, 255, 0.5)', fontWeight: 600 }}>
                                Federación / Unión
                            </div>
                            <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>
                                {union.name}
                            </h1>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '24px' }}>
                        {[
                            { label: 'Torneos', path: `/admin/union/${unionId}/torneos` },
                            { label: 'Disciplina', path: `/admin/union/${unionId}/disciplina` },
                            { label: 'Identidad', path: `/admin/union/${unionId}/identidad` },
                            { label: 'Usuarios', path: `/admin/union/${unionId}/usuarios` },
                        ].map(tab => {
                            const isActive = pathname?.startsWith(tab.path);
                            return (
                                <Link
                                    key={tab.path}
                                    href={tab.path}
                                    style={{
                                        padding: '12px 0',
                                        borderBottom: isActive ? '2px solid #22c55e' : '2px solid transparent',
                                        color: isActive ? 'white' : 'rgba(255, 255, 255, 0.6)',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        textDecoration: 'none',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    {tab.label}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            )}

            <main style={{ flex: 1, padding: '32px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
                {children}
            </main>
        </div>
    );
}
