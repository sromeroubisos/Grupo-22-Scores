'use client';

import Link from 'next/link';

interface EntityTabsProps {
    id: string;
    type: string;
    currentTab: string;
}

export function EntityTabs({ id, type, currentTab }: EntityTabsProps) {
    const tabs = [
        { id: 'overview', label: 'Overview' },
        { id: 'edit', label: 'Edit' },
        { id: 'related', label: 'Related' },
        { id: 'audit', label: 'Audit / History' },
    ];

    return (
        <div className="border-b border-divider mb-6">
            <nav className="-mb-px flex space-x-6 px-4 py-1" aria-label="Tabs">
                {tabs.map((tab) => {
                    const isActive = currentTab === tab.id;
                    const url = new URLSearchParams();
                    if (type) url.set('type', type);
                    if (tab.id !== 'overview') url.set('tab', tab.id);

                    const href = `/admin/entities/${id}/manage?${url.toString()}`;

                    return (
                        <Link
                            key={tab.id}
                            href={href}
                            className={`
                                whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors
                                ${isActive
                                    ? 'border-accent-blue text-accent-blue'
                                    : 'border-transparent text-system-secondary hover:text-foreground hover:border-divider'
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
