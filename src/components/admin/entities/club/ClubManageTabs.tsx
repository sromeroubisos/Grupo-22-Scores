'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

interface ClubManageTabsProps {
    id: string;
    currentTab: string;
    squadCount: number;
}

export const CLUB_MANAGE_VISIBLE_TABS = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'fixture', label: 'Fixture / Resultados' },
    { id: 'posiciones', label: 'Posiciones' },
    { id: 'relacionados', label: 'Relacionados' },
    { id: 'identidad', label: 'Identidad' },
    { id: 'planteles', label: 'Planteles' },
];

export const CLUB_MANAGE_VISIBLE_TAB_IDS = new Set(
    CLUB_MANAGE_VISIBLE_TABS.map((tab) => tab.id)
);

export function ClubManageTabs({ currentTab, squadCount }: ClubManageTabsProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    return (
        <nav className="tabs-nav">
            {CLUB_MANAGE_VISIBLE_TABS.map((tab) => {
                const params = new URLSearchParams(searchParams.toString());
                params.set('tab', tab.id);
                params.set('type', 'club');

                const isActive = currentTab === tab.id;

                return (
                    <Link
                        key={tab.id}
                        href={`${pathname}?${params.toString()}`}
                        className={`tab-item ${isActive ? 'active' : ''}`}
                    >
                        {tab.label}
                        {tab.id === 'planteles' && squadCount > 0 && (
                            <span
                                style={{
                                    marginLeft: '0.5rem',
                                    padding: '0.15rem 0.4rem',
                                    borderRadius: '999px',
                                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                                    background: isActive ? 'rgba(59, 130, 246, 0.12)' : 'var(--surface-elevated)',
                                    color: isActive ? 'var(--accent)' : 'var(--text-muted)',
                                    fontSize: '0.65rem',
                                    fontWeight: 800,
                                }}
                            >
                                {squadCount}
                            </span>
                        )}
                    </Link>
                );
            })}
        </nav>
    );
}
