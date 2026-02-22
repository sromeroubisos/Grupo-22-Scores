'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { batchUpdateEntities } from '@/app/admin/entities/batchActions';



interface BulkActionsBarProps {
    selectedIds: string[];
    onClearSelection: () => void;
    /** Map of id → raw date_time so we can render shift-time only if data exists */
    rawDateTimes: Record<string, string | null>;
}

type BulkAction =
    | { kind: 'status'; value: string }
    | { kind: 'shift'; minutes: 15 | 30 | 60 }
    | { kind: 'setDatetime'; value: string }
    | null;

// Values must match matches_status_check constraint exactly:
// ARRAY['scheduled','live','final','postponed','suspended']
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
    { value: 'scheduled', label: 'Programado' },
    { value: 'live', label: 'En Juego' },
    { value: 'final', label: 'Finalizado' },
    { value: 'postponed', label: 'Postpuesto' },
    { value: 'suspended', label: 'Suspendido' },
];

export function BulkActionsBar({ selectedIds, onClearSelection, rawDateTimes }: BulkActionsBarProps) {
    const router = useRouter();
    const [pendingAction, setPendingAction] = useState<BulkAction>(null);
    const [customDatetime, setCustomDatetime] = useState('');
    const [isApplying, setIsApplying] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [resultMessage, setResultMessage] = useState<{ kind: 'success' | 'warning' | 'error'; text: string } | null>(null);

    const count = selectedIds.length;

    // Whether at least one selected match has a date to shift
    const anyHasDate = selectedIds.some(id => rawDateTimes[id]);

    const handleApplyClick = () => {
        if (!pendingAction) return;
        setShowConfirm(true);
    };

    const handleConfirm = async () => {
        if (!pendingAction) return;
        setShowConfirm(false);
        setIsApplying(true);
        setResultMessage(null);

        try {
            let updates: { status?: string; date_time?: string } = {};

            if (pendingAction.kind === 'status') {
                updates = { status: pendingAction.value };

            } else if (pendingAction.kind === 'shift') {
                const errors: Array<{ id: string; message: string }> = [];
                const skipped: string[] = [];
                let updated = 0;

                for (const id of selectedIds) {
                    const rawDt = rawDateTimes[id];
                    if (!rawDt) {
                        // No date_time — deterministic skip, report it
                        skipped.push(id);
                        continue;
                    }
                    const d = new Date(rawDt);
                    if (isNaN(d.getTime())) {
                        errors.push({ id, message: 'date_time inválido (no es una fecha parseable)' });
                        continue;
                    }
                    d.setMinutes(d.getMinutes() + pendingAction.minutes);
                    const result = await batchUpdateEntities('match', [id], { date_time: d.toISOString() });
                    updated += result.updated;
                    if (result.errors) errors.push(...result.errors);
                }

                setIsApplying(false);
                const parts: string[] = [`${updated} actualizados.`];
                if (skipped.length > 0) parts.push(`${skipped.length} sin fecha (ignorados).`);
                if (errors.length > 0) parts.push(`${errors.length} con error: ${errors.map(e => e.id.split('-')[0]).join(', ')}`);

                if (errors.length > 0) {
                    setResultMessage({ kind: 'warning', text: parts.join(' ') });
                } else {
                    setResultMessage({ kind: 'success', text: parts.join(' ') });
                    onClearSelection();
                    setPendingAction(null);
                }
                router.refresh();
                return;

            } else if (pendingAction.kind === 'setDatetime') {
                if (!pendingAction.value) {
                    setIsApplying(false);
                    return;
                }
                const d = new Date(pendingAction.value);
                if (isNaN(d.getTime())) {
                    setIsApplying(false);
                    setResultMessage({ kind: 'error', text: 'Fecha inválida.' });
                    return;
                }
                updates = { date_time: d.toISOString() };
            }

            const result = await batchUpdateEntities('match', selectedIds, updates);
            setIsApplying(false);

            if (result.errors && result.errors.length > 0) {
                setResultMessage({
                    kind: 'warning',
                    text: `${result.updated} actualizados. ${result.errors.length} con error: ${result.errors.map(e => e.id.split('-')[0]).join(', ')}`
                });
            } else {
                setResultMessage({ kind: 'success', text: `${result.updated} partidos actualizados correctamente.` });
                onClearSelection();
                setPendingAction(null);
            }
            router.refresh();

        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Error desconocido';
            setIsApplying(false);
            setResultMessage({ kind: 'error', text: `Error: ${msg}` });
        }
    };

    if (count === 0) return null;

    return (
        <div className="sticky bottom-4 z-20 mx-2 mb-4 animate-in slide-in-from-bottom-4 duration-300">
            {/* Result feedback */}
            {resultMessage && (
                <div className={`mb-2 px-4 py-2 rounded-lg text-sm font-medium shadow-md ${resultMessage.kind === 'success' ? 'bg-green-500/90 text-white' :
                    resultMessage.kind === 'warning' ? 'bg-yellow-500/90 text-black' :
                        'bg-red-500/90 text-white'
                    }`}>
                    {resultMessage.text}
                    <button
                        className="ml-3 underline text-xs font-normal opacity-80 hover:opacity-100"
                        onClick={() => setResultMessage(null)}
                    >
                        Cerrar
                    </button>
                </div>
            )}

            {/* Confirm Modal */}
            {showConfirm && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => setShowConfirm(false)}>
                    <div
                        className="bg-surface border border-divider rounded-2xl shadow-2xl p-6 w-full max-w-sm animate-in zoom-in-95 duration-200"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-base font-bold text-foreground mb-2">¿Aplicar cambio masivo?</h3>
                        <p className="text-sm text-system-secondary mb-6">
                            Esta acción afectará <strong className="text-foreground">{count} partido{count !== 1 ? 's' : ''}</strong>. El cambio se registrará en el historial de auditoría de cada uno.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => setShowConfirm(false)}
                                className="px-4 py-2 text-sm font-medium rounded-lg border border-divider text-system-secondary hover:text-foreground hover:border-accent-blue transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleConfirm}
                                className="px-4 py-2 text-sm font-medium rounded-lg bg-accent-blue text-white hover:bg-blue-600 transition-colors"
                            >
                                Confirmar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Main bar */}
            <div className="bg-surface border border-divider rounded-2xl shadow-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Selection indicator */}
                <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center justify-center w-7 h-7 bg-accent-blue text-white text-xs font-bold rounded-full">
                        {count}
                    </span>
                    <span className="text-sm font-semibold text-foreground">seleccionados</span>
                </div>

                <div className="hidden sm:block h-5 w-px bg-divider mx-1" />

                {/* Action selector */}
                <div className="flex flex-wrap items-center gap-2 flex-1">
                    {/* Status quick-set */}
                    <select
                        className="text-sm bg-background border border-divider rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-accent-blue"
                        defaultValue=""
                        onChange={e => {
                            const v = e.target.value;
                            if (v) setPendingAction({ kind: 'status', value: v });
                            else setPendingAction(null);
                        }}
                    >
                        <option value="" disabled>Set status…</option>
                        {STATUS_OPTIONS.map(o => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>

                    {/* Shift time (only if any match has a datetime) */}
                    {anyHasDate && (
                        <div className="flex items-center gap-1">
                            {([15, 30, 60] as const).map(min => (
                                <button
                                    key={min}
                                    type="button"
                                    onClick={() => setPendingAction({ kind: 'shift', minutes: min })}
                                    className={`text-xs px-2 py-1.5 rounded-lg border transition-colors font-medium ${pendingAction?.kind === 'shift' && pendingAction.minutes === min
                                        ? 'border-accent-blue bg-accent-blue/10 text-accent-blue'
                                        : 'border-divider text-system-secondary hover:border-accent-blue hover:text-accent-blue'
                                        }`}
                                >
                                    +{min}&apos;
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Set exact datetime */}
                    <div className="flex items-center gap-1">
                        <input
                            type="datetime-local"
                            value={customDatetime}
                            onChange={e => {
                                setCustomDatetime(e.target.value);
                                if (e.target.value) {
                                    setPendingAction({ kind: 'setDatetime', value: e.target.value });
                                } else {
                                    setPendingAction(null);
                                }
                            }}
                            className="text-sm bg-background border border-divider rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-accent-blue"
                        />
                    </div>
                </div>

                {/* Apply + Clear */}
                <div className="flex items-center gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={handleApplyClick}
                        disabled={!pendingAction || isApplying}
                        className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-accent-blue text-white hover:bg-blue-600 disabled:opacity-40 transition-colors flex items-center gap-2"
                    >
                        {isApplying ? (
                            <>
                                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Aplicando…
                            </>
                        ) : 'Aplicar'}
                    </button>
                    <button
                        type="button"
                        onClick={() => { onClearSelection(); setPendingAction(null); setResultMessage(null); }}
                        className="px-3 py-1.5 text-sm font-medium rounded-lg border border-divider text-system-secondary hover:text-foreground hover:border-accent-blue transition-colors"
                        title="Deseleccionar todo"
                    >
                        ✕
                    </button>
                </div>
            </div>
        </div>
    );
}
