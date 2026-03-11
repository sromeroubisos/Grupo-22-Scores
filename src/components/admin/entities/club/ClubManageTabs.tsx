'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';

interface ClubManageTabsProps {
    id: string;
    currentTab: string;
    squadCount: number;
}

const TABS = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'identidad', label: 'Identidad' },
    { id: 'planteles', label: 'Planteles' },
    { id: 'staff', label: 'Staff' },
    { id: 'competencias', label: 'Competencias' },
    { id: 'partidos', label: 'Partidos' },
    { id: 'posiciones', label: 'Posiciones' },
    { id: 'estadisticas', label: 'Estadísticas' },
    { id: 'medios', label: 'Medios' },
    { id: 'relacionados', label: 'Relacionados' },
    { id: 'auditoria', label: 'Auditoría' },
];

export function ClubManageTabs({ currentTab }: ClubManageTabsProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    return (
        <nav className="tabs-nav">
            {TABS.map((tab) => {
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
                    </Link>
                );
            })}
        </nav>
    );
}
