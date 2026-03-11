'use client';

import Link from 'next/link';

interface EntityTabsProps {
    id: string;
    type: string;
    currentTab: string;
}

export function EntityTabs({ id, type, currentTab }: EntityTabsProps) {
    const tabs = type === 'tournament'
        ? [
            { id: 'resumen', label: 'Resumen' },
            { id: 'detalles', label: 'Detalles' },
            { id: 'formato', label: 'Formato y Puntuación' },
            { id: 'medios', label: 'Medios' },
            { id: 'publicacion', label: 'Publicación' },
            { id: 'related', label: 'Relacionados' },
            { id: 'audit', label: 'Auditoría' },
        ]
        : [
            { id: 'overview', label: 'Overview' },
            { id: 'edit', label: 'Edit' },
            { id: 'related', label: 'Related' },
            { id: 'audit', label: 'Audit / History' },
        ];

    return (
        <div className="border-b border-border-dark/60 mb-8 overflow-x-auto custom-scrollbar">
            <nav className="flex gap-8 px-2" aria-label="Tabs">
                {tabs.map((tab) => {
                    const isActive = currentTab === tab.id;
                    const url = new URLSearchParams();
                    if (type) url.set('type', type);
                    if (tab.id !== 'resumen' && tab.id !== 'overview') url.set('tab', tab.id);

                    const href = `/admin/entities/${id}/manage?${url.toString()}`;

                    return (
                        <Link
                            key={tab.id}
                            href={href}
                            className={`
                                whitespace-nowrap pb-4 px-1 border-b-2 text-[10px] font-black uppercase tracking-[0.2em] italic transition-all duration-300
                                ${isActive
                                    ? 'border-primary-accent text-primary-accent opacity-100'
                                    : 'border-transparent text-slate-500 hover:text-white hover:border-slate-700 opacity-60 hover:opacity-100'
                                }
                            `}
                            aria-current={isActive ? 'page' : undefined}
                        >
                            {tab.label}
                        </Link>
                    );
                })}
            </nav>
        </div>
    );
}
