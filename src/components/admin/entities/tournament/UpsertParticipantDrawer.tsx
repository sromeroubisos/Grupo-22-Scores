'use client';

/**
 * UPSERT PARTICIPANT DRAWER
 * Unified drawer for creating and editing tournament participants
 * Supports both database-linked clubs and manual entries
 */

import React, { useState, useEffect, useMemo } from 'react';
import { X, Save, UserPlus, Search, AlertCircle, Info, Hash, Tag } from 'lucide-react';

export type ParticipantType = 'club' | 'national_team' | 'franchise' | 'invited' | 'individual';
export type ParticipantStatus = 'active' | 'inactive' | 'pending' | 'disqualified';

interface Club {
    id: string;
    name: string;
    short_name?: string | null;
    logo_url?: string | null;
}

interface TournamentGroup {
    id: string;
    name: string;
}

interface Participant {
    id: string;
    tournament_id: string;
    club_id: string | null;
    name: string;
    type: ParticipantType;
    status: ParticipantStatus;
    seed: number | null;
    group_id: string | null;
    short_code: string | null;
    notes: string | null;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: Partial<Participant>) => Promise<void>;
    participant?: Participant | null; // If provided, edit mode
    clubs: Club[];
    groups: TournamentGroup[];
    existingParticipants: Participant[];
}

export function UpsertParticipantDrawer({
    isOpen,
    onClose,
    onSave,
    participant,
    clubs,
    groups,
    existingParticipants
}: Props) {
    const isEditMode = !!participant;

    // Form state
    const [sourceMode, setSourceMode] = useState<'database' | 'manual'>('database');
    const [clubId, setClubId] = useState('');
    const [clubSearch, setClubSearch] = useState('');
    const [manualName, setManualName] = useState('');
    const [type, setType] = useState<ParticipantType>('club');
    const [status, setStatus] = useState<ParticipantStatus>('active');
    const [seed, setSeed] = useState<number | ''>('');
    const [groupId, setGroupId] = useState('');
    const [shortCode, setShortCode] = useState('');
    const [notes, setNotes] = useState('');

    // UI state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showClubDropdown, setShowClubDropdown] = useState(false);

    // Load participant data in edit mode
    useEffect(() => {
        if (participant) {
            setSourceMode(participant.club_id ? 'database' : 'manual');
            setClubId(participant.club_id || '');
            setManualName(participant.name);
            setType(participant.type);
            setStatus(participant.status);
            setSeed(participant.seed || '');
            setGroupId(participant.group_id || '');
            setShortCode(participant.short_code || '');
            setNotes(participant.notes || '');
        } else {
            resetForm();
        }
    }, [participant]);

    const resetForm = () => {
        setSourceMode('database');
        setClubId('');
        setClubSearch('');
        setManualName('');
        setType('club');
        setStatus('active');
        setSeed('');
        setGroupId('');
        setShortCode('');
        setNotes('');
        setError(null);
    };

    // Filtered clubs for search
    const filteredClubs = useMemo(() => {
        if (!clubSearch.trim()) return clubs.slice(0, 50); // Show first 50 by default
        const query = clubSearch.toLowerCase();
        return clubs.filter(c =>
            c.name.toLowerCase().includes(query) ||
            c.short_name?.toLowerCase().includes(query)
        ).slice(0, 50);
    }, [clubs, clubSearch]);

    const selectedClub = clubs.find(c => c.id === clubId);

    // Validation
    const validateForm = (): string | null => {
        if (sourceMode === 'database' && !clubId) {
            return 'Debes seleccionar un club de la base de datos';
        }
        if (sourceMode === 'manual' && !manualName.trim()) {
            return 'El nombre es obligatorio';
        }
        if (seed !== '' && (Number(seed) < 0 || !Number.isInteger(Number(seed)))) {
            return 'El seed debe ser un número entero mayor o igual a 0';
        }
        if (shortCode.length > 12) {
            return 'El código corto no puede superar 12 caracteres';
        }

        // Check duplicates
        const finalName = sourceMode === 'database' ? (selectedClub?.name || '') : manualName;
        const isDuplicate = existingParticipants.some(p => {
            if (isEditMode && p.id === participant?.id) return false; // Skip self in edit mode
            return (
                (p.club_id && p.club_id === clubId) ||
                (p.name.toLowerCase() === finalName.toLowerCase())
            );
        });

        if (isDuplicate) {
            return 'Este participante ya está registrado en el torneo';
        }

        return null;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        setLoading(true);
        try {
            const data: Partial<Participant> = {
                club_id: sourceMode === 'database' ? clubId : null,
                name: sourceMode === 'database' ? (selectedClub?.name || manualName) : manualName,
                type,
                status,
                seed: seed === '' ? null : Number(seed),
                group_id: groupId || null,
                short_code: shortCode.trim() || null,
                notes: notes.trim() || null,
            };

            console.log('[UpsertParticipantDrawer] Submitting data:', data);

            await onSave(data);
            resetForm();
            onClose();
        } catch (err: any) {
            console.error('[UpsertParticipantDrawer] Error saving participant:', err);

            // Extract error message from various formats
            let errorMessage = 'Error al guardar el participante';
            if (err.message) {
                errorMessage = err.message;
            } else if (err.error) {
                errorMessage = err.error;
            } else if (typeof err === 'string') {
                errorMessage = err;
            }

            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (!loading) {
            resetForm();
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-hidden">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/45 transition-opacity animate-in fade-in"
                onClick={handleClose}
            />

            {/* Panel */}
            <div className="absolute inset-y-0 right-0 w-full max-w-xl bg-[#0a0a0b] border-l border-white/10 shadow-2xl animate-in slide-in-from-right duration-300">
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-white/10 bg-white/[0.02] sticky top-0 z-10">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center">
                                <UserPlus className="w-5 h-5 text-[var(--accent-primary)]" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-white">
                                    {isEditMode ? 'Editar Participante' : 'Nuevo Participante'}
                                </h3>
                                <p className="text-xs text-zinc-500">
                                    {isEditMode ? 'Modifica los datos del participante' : 'Añade un equipo o competidor al torneo'}
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={handleClose}
                            disabled={loading}
                            className="p-2 hover:bg-white/5 rounded-lg text-zinc-400 hover:text-white transition-all disabled:opacity-50"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* Error Alert */}
                        {error && (
                            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <div className="text-sm font-semibold text-red-500">Error de validación</div>
                                    <div className="text-xs text-red-400 mt-1">{error}</div>
                                </div>
                            </div>
                        )}

                        {/* Source Mode Selector */}
                        {!isEditMode && (
                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                    Origen del Participante
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setSourceMode('database')}
                                        className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
                                            sourceMode === 'database'
                                                ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/50 text-[var(--accent-primary)]'
                                                : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                                        }`}
                                    >
                                        Base de Datos
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSourceMode('manual')}
                                        className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
                                            sourceMode === 'manual'
                                                ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/50 text-[var(--accent-primary)]'
                                                : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                                        }`}
                                    >
                                        Entrada Manual
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Database Club Search */}
                        {sourceMode === 'database' && (
                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                    Buscar Club *
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre..."
                                        value={clubSearch}
                                        onChange={(e) => {
                                            setClubSearch(e.target.value);
                                            setShowClubDropdown(true);
                                        }}
                                        onFocus={() => setShowClubDropdown(true)}
                                        className="w-full pl-10 pr-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[var(--accent-primary)]/50 transition-all"
                                    />
                                    {showClubDropdown && filteredClubs.length > 0 && (
                                        <div className="absolute top-full mt-2 w-full max-h-64 overflow-y-auto bg-[#1a1a1d] border border-white/10 rounded-xl shadow-2xl z-20 animate-in fade-in slide-in-from-top-2">
                                            {filteredClubs.map(club => (
                                                <button
                                                    key={club.id}
                                                    type="button"
                                                    onClick={() => {
                                                        setClubId(club.id);
                                                        setClubSearch(club.name);
                                                        setShortCode(club.short_name || '');
                                                        setShowClubDropdown(false);
                                                    }}
                                                    className="w-full px-4 py-3 text-left hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 flex items-center gap-3"
                                                >
                                                    {club.logo_url && (
                                                        <img src={club.logo_url} alt="" className="w-8 h-8 object-contain rounded" />
                                                    )}
                                                    <div className="flex-1 min-w-0">
                                                        <div className="text-sm font-semibold text-white truncate">{club.name}</div>
                                                        {club.short_name && (
                                                            <div className="text-xs text-zinc-500 font-mono">{club.short_name}</div>
                                                        )}
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {selectedClub && (
                                    <div className="p-3 bg-[var(--accent-primary)]/5 border border-[var(--accent-primary)]/20 rounded-xl flex items-center gap-3">
                                        <Info className="w-4 h-4 text-[var(--accent-primary)]" />
                                        <div className="text-xs text-zinc-400">
                                            Vinculado a <strong className="text-white">{selectedClub.name}</strong>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Manual Name */}
                        {sourceMode === 'manual' && (
                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                    Nombre del Participante *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: San Isidro Club"
                                    value={manualName}
                                    onChange={(e) => setManualName(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[var(--accent-primary)]/50 transition-all"
                                />
                            </div>
                        )}

                        {/* Participant Type */}
                        <div className="space-y-3">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                Tipo de Participante *
                            </label>
                            <div className="grid grid-cols-3 gap-2">
                                {(['club', 'national_team', 'individual'] as ParticipantType[]).map((t) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setType(t)}
                                        className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                            type === t
                                                ? 'bg-[var(--accent-primary)]/10 border-[var(--accent-primary)]/50 text-[var(--accent-primary)]'
                                                : 'bg-white/5 border-white/10 text-zinc-400 hover:bg-white/10'
                                        }`}
                                    >
                                        {t === 'club' ? 'Club' : t === 'national_team' ? 'Selección' : 'Individual'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Status */}
                        <div className="space-y-3">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                Estado *
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                                {(['active', 'pending', 'inactive', 'disqualified'] as ParticipantStatus[]).map((s) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setStatus(s)}
                                        className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                            status === s
                                                ? 'bg-white/10 border-white/30 text-white'
                                                : 'bg-white/5 border-white/10 text-zinc-500 hover:bg-white/10'
                                        }`}
                                    >
                                        {s === 'active' ? 'Activo' : s === 'pending' ? 'Pendiente' : s === 'inactive' ? 'Inactivo' : 'Descalificado'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Seed and Short Code */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                                    <Hash className="w-3 h-3" />
                                    Seed / Ranking
                                </label>
                                <input
                                    type="number"
                                    placeholder="Ej: 1"
                                    value={seed}
                                    onChange={(e) => setSeed(e.target.value ? Number(e.target.value) : '')}
                                    min="0"
                                    className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white font-mono placeholder:text-zinc-600 focus:outline-none focus:border-[var(--accent-primary)]/50 transition-all"
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                                    <Tag className="w-3 h-3" />
                                    Código Corto
                                </label>
                                <input
                                    type="text"
                                    placeholder="Ej: SIC"
                                    value={shortCode}
                                    onChange={(e) => setShortCode(e.target.value.slice(0, 12))}
                                    maxLength={12}
                                    className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white font-mono uppercase placeholder:text-zinc-600 focus:outline-none focus:border-[var(--accent-primary)]/50 transition-all"
                                />
                            </div>
                        </div>

                        {/* Group (if groups exist) */}
                        {groups.length > 0 && (
                            <div className="space-y-3">
                                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                    Grupo (Opcional)
                                </label>
                                <select
                                    value={groupId}
                                    onChange={(e) => setGroupId(e.target.value)}
                                    className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white focus:outline-none focus:border-[var(--accent-primary)]/50 transition-all"
                                >
                                    <option value="">Sin grupo asignado</option>
                                    {groups.map(g => (
                                        <option key={g.id} value={g.id}>{g.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {/* Notes */}
                        <div className="space-y-3">
                            <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
                                Notas (Opcional)
                            </label>
                            <textarea
                                placeholder="Ej: Lesiones, consideraciones especiales..."
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                rows={3}
                                className="w-full px-4 py-2.5 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[var(--accent-primary)]/50 transition-all resize-none"
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="p-6 border-t border-white/10 bg-white/[0.02] sticky bottom-0">
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={loading}
                                className="flex-1 px-6 py-3 bg-white/5 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl border border-white/10 transition-all"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-[var(--accent-primary)] hover:bg-[#008b56] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-[var(--accent-primary)]/20"
                            >
                                {loading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save className="w-4 h-4" />
                                        {isEditMode ? 'Actualizar' : 'Guardar'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
