'use client';

import React, { useState, useEffect } from 'react';
import { X, History, Clock, UserPlus, Edit3, Trash2, AlertCircle } from 'lucide-react';

interface AuditEntry {
    id: string;
    action: 'created' | 'updated' | 'deleted' | 'status_changed';
    participant_id: string;
    changed_by: string | null;
    changes: Record<string, { old: any; new: any }>;
    created_at: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    tournamentId: string;
}

export function ParticipantsHistoryDrawer({ isOpen, onClose, tournamentId }: Props) {
    const [entries, setEntries] = useState<AuditEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && tournamentId) {
            loadHistory();
        }
    }, [isOpen, tournamentId]);

    const loadHistory = async () => {
        setLoading(true);
        setError(null);
        try {
            // Try to fetch audit data
            const response = await fetch(`/api/tournaments/${tournamentId}/participants/audit`);
            if (response.ok) {
                const data = await response.json();
                setEntries(data || []);
            } else if (response.status === 404) {
                // Audit endpoint not implemented yet
                setEntries([]);
            } else {
                throw new Error('Error al cargar el historial');
            }
        } catch (err: any) {
            console.error('Error loading history:', err);
            setError(err.message);
            setEntries([]);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'created': return <UserPlus className="w-4 h-4" />;
            case 'updated': return <Edit3 className="w-4 h-4" />;
            case 'deleted': return <Trash2 className="w-4 h-4" />;
            case 'status_changed': return <AlertCircle className="w-4 h-4" />;
            default: return <Clock className="w-4 h-4" />;
        }
    };

    const getActionColor = (action: string) => {
        switch (action) {
            case 'created': return 'text-green-500 bg-green-500/10 border-green-500/20';
            case 'updated': return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
            case 'deleted': return 'text-red-500 bg-red-500/10 border-red-500/20';
            case 'status_changed': return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
            default: return 'text-zinc-500 bg-zinc-500/10 border-zinc-500/20';
        }
    };

    const getActionLabel = (action: string) => {
        switch (action) {
            case 'created': return 'Creado';
            case 'updated': return 'Actualizado';
            case 'deleted': return 'Eliminado';
            case 'status_changed': return 'Estado Cambiado';
            default: return action;
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return new Intl.DateTimeFormat('es-AR', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    };

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-[#0a0a0b] border-l border-white/10 shadow-2xl animate-in slide-in-from-right duration-300">
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center">
                                <History className="w-5 h-5 text-[var(--accent-primary)]" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Historial de Cambios</h3>
                                <p className="text-xs text-zinc-500">Auditoría de participantes</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-all">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-6">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <div className="w-8 h-8 border-2 border-[var(--accent-primary)] border-t-transparent rounded-full animate-spin" />
                                <div className="text-sm text-zinc-500 font-mono">Cargando historial...</div>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <AlertCircle className="w-12 h-12 text-red-500 opacity-50" />
                                <div className="text-sm text-red-500">Error al cargar el historial</div>
                                <button
                                    onClick={loadHistory}
                                    className="text-xs text-zinc-400 hover:text-white transition-colors underline"
                                >
                                    Reintentar
                                </button>
                            </div>
                        ) : entries.length === 0 ? (
                            /* HONEST EMPTY STATE - No fake data */
                            <div className="flex flex-col items-center justify-center py-20 gap-6">
                                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                                    <Clock className="w-8 h-8 text-zinc-600" />
                                </div>
                                <div className="text-center space-y-2 max-w-sm">
                                    <h4 className="text-base font-bold text-white">El historial estará disponible próximamente</h4>
                                    <p className="text-sm text-zinc-500 leading-relaxed">
                                        El sistema de auditoría de cambios se encuentra en desarrollo. Una vez activo, podrás ver aquí
                                        un registro completo de todas las modificaciones realizadas a los participantes.
                                    </p>
                                </div>
                                <div className="mt-4 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                                    <div className="text-xs text-blue-400 font-mono">
                                        Próximas funcionalidades:
                                    </div>
                                    <ul className="text-xs text-zinc-400 mt-2 space-y-1 list-disc list-inside">
                                        <li>Registro de altas, bajas y modificaciones</li>
                                        <li>Historial de cambios de estado</li>
                                        <li>Identificación de usuario responsable</li>
                                        <li>Comparación de valores anteriores/nuevos</li>
                                    </ul>
                                </div>
                            </div>
                        ) : (
                            /* Timeline view */
                            <div className="relative space-y-4">
                                {/* Timeline line */}
                                <div className="absolute left-6 top-0 bottom-0 w-px bg-white/5" />

                                {entries.map((entry, index) => (
                                    <div key={entry.id} className="relative flex gap-4 animate-in fade-in slide-in-from-left-2" style={{ animationDelay: `${index * 50}ms` }}>
                                        <div className={`relative z-10 w-12 h-12 rounded-xl border flex items-center justify-center flex-shrink-0 ${getActionColor(entry.action)}`}>
                                            {getActionIcon(entry.action)}
                                        </div>
                                        <div className="flex-1 min-w-0 pb-4">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="font-semibold text-white text-sm">
                                                    {getActionLabel(entry.action)}
                                                </div>
                                                <div className="text-xs text-zinc-600 font-mono whitespace-nowrap">
                                                    {formatDate(entry.created_at)}
                                                </div>
                                            </div>
                                            {entry.changed_by && (
                                                <div className="text-xs text-zinc-500 mt-1">
                                                    por {entry.changed_by}
                                                </div>
                                            )}
                                            {entry.changes && Object.keys(entry.changes).length > 0 && (
                                                <div className="mt-2 space-y-1">
                                                    {Object.entries(entry.changes).map(([field, values]) => (
                                                        <div key={field} className="text-xs bg-white/5 rounded px-2 py-1.5 border border-white/5">
                                                            <span className="text-zinc-500 font-mono">{field}:</span>
                                                            <span className="text-red-400 line-through ml-2">{String(values.old)}</span>
                                                            <span className="text-zinc-500 mx-1">→</span>
                                                            <span className="text-green-400">{String(values.new)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
