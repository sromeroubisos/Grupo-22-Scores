'use client';

import { useState } from 'react';
import { RelatedItem } from '@/lib/services/relatedResolver';
import { RelatedRow } from './RelatedRow';
import { BulkActionsBar } from './BulkActionsBar';

interface RelatedListProps {
    items: RelatedItem[];
}

const getIcon = (type: string) => {
    switch (type) {
        case 'match': return '⚽';
        case 'club': return '🏉';
        case 'player': return '👤';
        case 'tournament': return '🏆';
        default: return '📄';
    }
};

export function RelatedList({ items }: RelatedListProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    if (!items || items.length === 0) return null;

    // Only matches are selectable
    const matchItems = items.filter(i => i.entityType === 'match');
    const hasMatchItems = matchItems.length > 0;
    const allMatchesSelected = matchItems.length > 0 && matchItems.every(m => selectedIds.has(m.id));

    // Build a map of id -> raw date_time for the BulkActionsBar
    const rawDateTimes: Record<string, string | null> = {};
    for (const item of matchItems) {
        rawDateTimes[item.id] = item.raw?.date_time ?? null;
    }

    const toggleItem = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (allMatchesSelected) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(matchItems.map(m => m.id)));
        }
    };

    const clearSelection = () => setSelectedIds(new Set());

    const selectedIdsArray = Array.from(selectedIds);

    return (
        <>
            <ul className="divide-y divide-divider border border-divider rounded-lg overflow-hidden bg-background">
                {/* Select All header — only shown when there are match items */}
                {hasMatchItems && (
                    <li className="px-4 py-2 sm:px-6 bg-surface-hover flex items-center gap-3 border-b border-divider">
                        <input
                            type="checkbox"
                            checked={allMatchesSelected}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 accent-accent-blue cursor-pointer rounded"
                            aria-label="Seleccionar todos los partidos"
                        />
                        <span className="text-xs font-medium text-system-secondary">
                            {selectedIds.size > 0
                                ? `${selectedIds.size} seleccionado${selectedIds.size !== 1 ? 's' : ''} (página)`
                                : 'Seleccionar todos los partidos (página)'}
                        </span>
                        {selectedIds.size > 0 && (
                            <button
                                type="button"
                                onClick={clearSelection}
                                className="ml-auto text-xs font-medium text-system-secondary hover:text-foreground transition-colors"
                            >
                                Deseleccionar
                            </button>
                        )}
                    </li>
                )}

                {items.map((item) => (
                    <li key={item.id}>
                        <RelatedRow
                            item={item}
                            getIcon={getIcon}
                            selectable={hasMatchItems}
                            selected={selectedIds.has(item.id)}
                            onToggleSelect={toggleItem}
                        />
                    </li>
                ))}
            </ul>

            {/* Sticky bulk actions bar */}
            <BulkActionsBar
                selectedIds={selectedIdsArray}
                onClearSelection={clearSelection}
                rawDateTimes={rawDateTimes}
            />
        </>
    );
}
