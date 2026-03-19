'use client';

import React, { useState, useMemo } from 'react';
import { X, FileUp, CheckCircle2, AlertTriangle, ChevronRight } from 'lucide-react';

import { ParticipantType, ParticipantStatus } from './TournamentParticipantsTab';

interface Participant {
    id: string;
    name: string;
    club_id: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onImport: (participants: { name: string; type: ParticipantType; status: ParticipantStatus }[]) => Promise<void>;
    existingParticipants: Participant[];
}

export function ImportParticipantsDrawerV2({ isOpen, onClose, onImport, existingParticipants }: Props) {
    const [importText, setImportText] = useState('');
    const [loading, setLoading] = useState(false);

    const { preview, duplicates } = useMemo(() => {
        const lines = importText.split('\n').map(l => l.trim()).filter(Boolean);
        const existingNames = new Set(existingParticipants.map(p => p.name.toLowerCase()));

        const preview = lines.map(name => ({
            name,
            isDuplicate: existingNames.has(name.toLowerCase())
        }));

        const duplicates = preview.filter(p => p.isDuplicate);

        return { preview, duplicates };
    }, [importText, existingParticipants]);

    const handleImport = async () => {
        if (preview.length === 0) return;

        setLoading(true);
        try {
            const toImport = preview
                .filter(p => !p.isDuplicate)
                .map(p => ({
                    name: p.name,
                    type: 'club' as ParticipantType,
                    status: 'active' as ParticipantStatus
                }));

            await onImport(toImport);
            setImportText('');
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const newCount = preview.length - duplicates.length;

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-black/60" onClick={onClose} />
            <div className="absolute inset-y-0 right-0 w-full max-w-lg bg-[#0a0a0b] border-l border-white/10 shadow-2xl animate-in slide-in-from-right duration-300">
                <div className="flex flex-col h-full">
                    <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center">
                                <FileUp className="w-5 h-5 text-[var(--accent-primary)]" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Importar por Lote</h3>
                                <p className="text-xs text-zinc-500">Añade múltiples participantes</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-all">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        <div className="space-y-3">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                Pega un nombre por línea
                            </label>
                            <textarea
                                value={importText}
                                onChange={(e) => setImportText(e.target.value)}
                                placeholder="San Isidro Club&#10;Hindu Club&#10;Newman&#10;..."
                                className="w-full h-48 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono placeholder:text-zinc-700 focus:outline-none focus:border-[var(--accent-primary)]/50 resize-none"
                            />
                        </div>

                        {preview.length > 0 && (
                            <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                                <div className="flex items-center justify-between">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                        Vista Previa ({preview.length})
                                    </div>
                                    {duplicates.length > 0 && (
                                        <div className="text-xs text-yellow-500 flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3" />
                                            {duplicates.length} duplicado{duplicates.length !== 1 ? 's' : ''}
                                        </div>
                                    )}
                                </div>
                                <div className="max-h-56 overflow-y-auto bg-black/20 rounded-xl border border-white/5">
                                    {preview.map((item, i) => (
                                        <div
                                            key={i}
                                            className={`px-4 py-2.5 text-xs flex items-center gap-3 border-b border-white/5 last:border-0 ${item.isDuplicate ? 'bg-yellow-500/5' : ''
                                                }`}
                                        >
                                            <span className="text-[10px] text-zinc-600 w-6 font-mono text-right">{i + 1}</span>
                                            <ChevronRight className="w-3 h-3 text-zinc-700" />
                                            <span className={`flex-1 truncate ${item.isDuplicate ? 'text-yellow-500 line-through' : 'text-zinc-300'}`}>
                                                {item.name}
                                            </span>
                                            {item.isDuplicate && (
                                                <span className="text-[10px] text-yellow-600 uppercase font-mono">Duplicado</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {duplicates.length > 0 && (
                            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex gap-3">
                                <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                                <div className="text-xs text-zinc-400">
                                    Se detectaron <strong className="text-yellow-500">{duplicates.length}</strong> participante{duplicates.length !== 1 ? 's' : ''} duplicado{duplicates.length !== 1 ? 's' : ''}.
                                    Solo se importarán los nuevos ({newCount}).
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="p-6 border-t border-white/10 bg-white/[0.02]">
                        <button
                            onClick={handleImport}
                            disabled={loading || newCount === 0}
                            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-[var(--accent-primary)] hover:bg-[#008b56] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-[var(--accent-primary)]/20"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    Importando...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="w-4 h-4" />
                                    Importar {newCount} Participante{newCount !== 1 ? 's' : ''}
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
