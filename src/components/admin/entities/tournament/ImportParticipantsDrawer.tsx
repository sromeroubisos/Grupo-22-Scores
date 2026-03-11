'use client';

import { useState } from 'react';
import { X, FileUp, Clipboard, AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';

type ImportedParticipantInput = {
    name: string;
    type: 'club';
    status: 'active';
};

interface ImportParticipantsDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (participants: ImportedParticipantInput[]) => Promise<void>;
}

export function ImportParticipantsDrawer({ isOpen, onClose, onImport }: ImportParticipantsDrawerProps) {
    const [importText, setImportText] = useState('');
    const [loading, setLoading] = useState(false);
    const [preview, setPreview] = useState<string[]>([]);

    const handleTextChange = (text: string) => {
        setImportText(text);
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        setPreview(lines);
    };

    const handleImport = async () => {
        if (preview.length === 0) return;
        setLoading(true);
        try {
            const participants: ImportedParticipantInput[] = preview.map((name) => ({
                name,
                type: 'club',
                status: 'active'
            }));
            await onImport(participants);
            setImportText('');
            setPreview([]);
            onClose();
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            <div
                className="absolute inset-0 bg-black/60 transition-opacity animate-in fade-in"
                onClick={onClose}
            />

            <div className="absolute inset-y-0 right-0 w-full bg-[#0a0a0b] border-l border-white/10 shadow-2xl animate-in slide-in-from-right duration-300 md:max-w-lg">
                <div className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 p-4 sm:p-6 border-b border-white/10 bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#00a365]/10 border border-[#00a365]/20 flex items-center justify-center">
                                <FileUp className="w-5 h-5 text-[#00a365]" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">Importar por Lote</h3>
                                <p className="text-xs text-zinc-500">Añade múltiples participantes rápidamente</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-all"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-[#00a365]">
                                <Clipboard className="w-4 h-4" />
                                <h4 className="text-xs font-bold uppercase tracking-wider">Copia y Pega</h4>
                            </div>

                            <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
                                <label className="text-[11px] text-zinc-500">Pega un nombre por línea:</label>
                                <textarea
                                    value={importText}
                                    onChange={(e) => handleTextChange(e.target.value)}
                                    placeholder="Ej:&#10;San Isidro Club&#10;Hindu Club&#10;Newman"
                                    className="w-full h-48 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono placeholder:text-zinc-700 focus:outline-none focus:border-[#00a365]/50 resize-none transition-all"
                                />
                            </div>

                            {preview.length > 0 && (
                                <div className="animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Vista Previa ({preview.length})</h4>
                                    </div>
                                    <div className="max-h-40 overflow-y-auto bg-black/20 rounded-xl border border-white/5 divide-y divide-white/5">
                                        {preview.map((name, i) => (
                                            <div key={i} className="px-4 py-2 text-xs text-zinc-400 flex items-center gap-3">
                                                <span className="text-[10px] text-zinc-600 w-4 font-mono">{i + 1}</span>
                                                <ChevronRight className="w-3 h-3 text-zinc-700" />
                                                <span className="truncate">{name}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl flex gap-3">
                                <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                                <div>
                                    <h5 className="text-[11px] font-bold text-yellow-500 uppercase">Aviso</h5>
                                    <p className="text-[10px] text-zinc-400 leading-relaxed mt-1">
                                        Los participantes importados por lote se crearán con tipo <strong>Club</strong> y estado <strong>Activo</strong> por defecto. Podrás editarlos individualmente después.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-4 sm:p-6 border-t border-white/10 bg-white/[0.02]">
                        <button
                            onClick={handleImport}
                            disabled={loading || preview.length === 0}
                            className="w-full min-h-12 flex items-center justify-center gap-2 px-6 py-3 bg-[#00a365] hover:bg-[#008b56] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-[#00a365]/20"
                        >
                            {loading ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <CheckCircle2 className="w-4 h-4" />
                            )}
                            {loading ? 'Importando...' : `Importar ${preview.length} Participantes`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
