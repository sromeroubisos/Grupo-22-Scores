'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RelatedItem } from '@/lib/services/relatedResolver';
import { updateEntity } from '@/app/admin/entities/actions';
import { MatchRow, TournamentRow } from '@/lib/services/entityResolver';

interface RelatedRowProps {
    item: RelatedItem;
    getIcon: (type: string) => string;
    /** Selection props — only present when bulk-mode is active on the list */
    selectable?: boolean;
    selected?: boolean;
    onToggleSelect?: (id: string) => void;
}

export function RelatedRow({ item, getIcon, selectable = false, selected = false, onToggleSelect }: RelatedRowProps) {
    const router = useRouter();
    const [isEditing, setIsEditing] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const editableType = item.entityType === 'match'
        ? 'match'
        : item.entityType === 'tournament'
            ? 'tournament'
            : null;

    const isEditable = editableType !== null;

    const [status, setStatus] = useState(() => {
        if (item.raw?.status) return item.raw.status;
        return 'active';
    });

    const [dateTime, setDateTime] = useState(() => {
        if (item.raw?.date_time) {
            const date = new Date(item.raw.date_time);
            if (!isNaN(date.getTime())) {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                const hours = String(date.getHours()).padStart(2, '0');
                const minutes = String(date.getMinutes()).padStart(2, '0');
                return `${year}-${month}-${day}T${hours}:${minutes}`;
            }
        }
        return '';
    });

    const handleSave = async () => {
        setIsLoading(true);
        try {
            if (!editableType) return;

            if (editableType === 'match') {
                const updates: Partial<Pick<MatchRow, 'status' | 'date_time'>> = { status };
                if (dateTime) {
                    const dateObj = new Date(dateTime);
                    if (!isNaN(dateObj.getTime())) {
                        updates.date_time = dateObj.toISOString();
                    }
                }
                await updateEntity(editableType, item.id, updates);
            } else if (editableType === 'tournament') {
                const updates: Partial<Pick<TournamentRow, 'status'>> = { status };
                await updateEntity(editableType, item.id, updates);
            }

            setIsEditing(false);
            router.refresh();
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error('Update failed:', msg);
            alert(`Error: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    if (!isEditing) {
        return (
            <div className={`flex items-center justify-between px-4 py-3 sm:px-6 hover:bg-surface-hover transition-colors group ${selected ? 'bg-accent-blue/5 border-l-2 border-accent-blue' : ''}`}>
                {/* Checkbox (only for match items in bulk mode) */}
                {selectable && item.entityType === 'match' && (
                    <div className="mr-3 shrink-0">
                        <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => onToggleSelect?.(item.id)}
                            className="w-4 h-4 accent-accent-blue cursor-pointer rounded"
                            aria-label={`Seleccionar ${item.label}`}
                        />
                    </div>
                )}

                <Link
                    href={item.href}
                    prefetch={false}
                    className="flex flex-col min-w-0 flex-1 focus:outline-none"
                >
                    <span className="text-sm font-bold text-foreground truncate max-w-sm sm:max-w-md md:max-w-lg">
                        {item.label}
                    </span>
                    {item.meta && (
                        <span className="text-xs text-system-secondary/80 mt-1">
                            {item.meta}
                        </span>
                    )}
                </Link>

                <div className="ml-4 flex-shrink-0 flex items-center gap-3">
                    {isEditable && (
                        <button
                            type="button"
                            onClick={() => setIsEditing(true)}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1.5 text-system-secondary hover:text-accent-blue hover:bg-accent-blue/10 rounded transition-all"
                            title="Quick Edit"
                        >
                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                        </button>
                    )}
                    <Link href={item.href} prefetch={false} className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium bg-surface border border-divider text-system-secondary capitalize hover:border-accent-blue hover:text-accent-blue transition-colors">
                        <span>{getIcon(item.entityType)}</span>
                        {item.entityType}
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="px-4 py-4 sm:px-6 bg-surface-hover border-y border-accent-blue/20 first:border-t-0 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex flex-col space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground">{item.label}</span>
                    <span className="text-xs font-mono text-system-secondary">ID: {item.id.split('-')[0]}...</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-medium text-system-secondary">Estado</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value)}
                            disabled={isLoading}
                            className="bg-surface border border-divider rounded-md text-sm w-full py-1.5 px-3 hover:border-accent-blue focus:border-accent-blue focus:ring-1 focus:ring-accent-blue outline-none transition-colors"
                        >
                            <option value="scheduled">Programado</option>
                            <option value="active">Activo / En Juego</option>
                            <option value="finished">Finalizado</option>
                            <option value="canceled">Cancelado</option>
                        </select>
                    </div>

                    {item.entityType === 'match' && (
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-system-secondary">Fecha</label>
                            <input
                                type="datetime-local"
                                value={dateTime}
                                onChange={(e) => setDateTime(e.target.value)}
                                disabled={isLoading}
                                className="bg-surface border border-divider rounded-md text-sm w-full py-1.5 px-3 hover:border-accent-blue focus:border-accent-blue focus:ring-1 focus:ring-accent-blue outline-none transition-colors"
                            />
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        disabled={isLoading}
                        className="text-xs font-medium px-3 py-1.5 rounded-md hover:bg-surface text-system-secondary border border-transparent transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isLoading}
                        className="text-xs font-medium px-4 py-1.5 rounded-md bg-accent-blue text-white hover:bg-accent-blue/90 disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Guardando...
                            </>
                        ) : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
}
