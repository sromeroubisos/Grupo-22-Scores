'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Hash, Info, Repeat2, Save, Search, Tag, UserPlus, X } from 'lucide-react';
import { useDialog } from './useDialog';
import './participants-premium.css';
import './drawer-premium.css';

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
    phase_id: string | null;
}

interface TournamentPhase {
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

type ParticipantSavePayload = Partial<Participant> & {
    replace_across_tournament?: boolean;
};

interface Props {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: ParticipantSavePayload) => Promise<void>;
    participant?: Participant | null;
    clubs: Club[];
    phases: TournamentPhase[];
    groups: TournamentGroup[];
    existingParticipants: Participant[];
}

const TYPE_OPTIONS: Array<{ value: ParticipantType; label: string }> = [
    { value: 'club', label: 'Club' },
    { value: 'national_team', label: 'Seleccion' },
    { value: 'individual', label: 'Individual' },
];

const STATUS_OPTIONS: Array<{ value: ParticipantStatus; label: string }> = [
    { value: 'active', label: 'Activo' },
    { value: 'pending', label: 'Pendiente' },
    { value: 'inactive', label: 'Inactivo' },
    { value: 'disqualified', label: 'Descalificado' },
];

export function UpsertParticipantDrawer({
    isOpen,
    onClose,
    onSave,
    participant,
    clubs,
    phases,
    groups,
    existingParticipants,
}: Props) {
    const isEditMode = !!participant;

    const [sourceMode, setSourceMode] = useState<'database' | 'manual'>('database');
    const [clubId, setClubId] = useState('');
    const [clubSearch, setClubSearch] = useState('');
    const [manualName, setManualName] = useState('');
    const [type, setType] = useState<ParticipantType>('club');
    const [status, setStatus] = useState<ParticipantStatus>('active');
    const [seed, setSeed] = useState<number | ''>('');
    const [selectedPhaseId, setSelectedPhaseId] = useState('');
    const [groupId, setGroupId] = useState('');
    const [shortCode, setShortCode] = useState('');
    const [notes, setNotes] = useState('');
    const [replaceAcrossTournament, setReplaceAcrossTournament] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const resetForm = () => {
        setSourceMode('database');
        setClubId('');
        setClubSearch('');
        setManualName('');
        setType('club');
        setStatus('active');
        setSeed('');
        setSelectedPhaseId('');
        setGroupId('');
        setShortCode('');
        setNotes('');
        setReplaceAcrossTournament(false);
        setError(null);
    };

    useEffect(() => {
        if (participant) {
            const currentGroup = groups.find((group) => group.id === participant.group_id);
            setSourceMode(participant.club_id ? 'database' : 'manual');
            setClubId(participant.club_id || '');
            setClubSearch(participant.club_id ? participant.name : '');
            setManualName(participant.name);
            setType(participant.type);
            setStatus(participant.status);
            setSeed(participant.seed || '');
            setSelectedPhaseId(currentGroup?.phase_id || '');
            setGroupId(participant.group_id || '');
            setShortCode(participant.short_code || '');
            setNotes(participant.notes || '');
            setReplaceAcrossTournament(false);
            setError(null);
            return;
        }

        resetForm();
    }, [groups, participant]);

    const filteredClubs = useMemo(() => {
        if (!clubSearch.trim()) {
            return clubs.slice(0, 20);
        }

        const query = clubSearch.toLowerCase();
        return clubs
            .filter((club) =>
                club.name.toLowerCase().includes(query) ||
                club.short_name?.toLowerCase().includes(query)
            )
            .slice(0, 24);
    }, [clubs, clubSearch]);

    const selectedClub = clubs.find((club) => club.id === clubId);
    const isReplacingLinkedClub = Boolean(
        isEditMode &&
        participant?.club_id &&
        sourceMode === 'database' &&
        clubId &&
        clubId !== participant.club_id
    );

    const phasesWithGroups = useMemo(
        () => phases.filter((phase) => groups.some((group) => group.phase_id === phase.id)),
        [groups, phases]
    );

    const availableGroups = useMemo(() => {
        if (!selectedPhaseId) return [];
        return groups.filter((group) => group.phase_id === selectedPhaseId);
    }, [groups, selectedPhaseId]);

    useEffect(() => {
        if (!selectedPhaseId) {
            setGroupId('');
            return;
        }

        setGroupId((current) =>
            availableGroups.some((group) => group.id === current) ? current : ''
        );
    }, [availableGroups, selectedPhaseId]);

    const validateForm = (): string | null => {
        if (sourceMode === 'database' && !clubId) {
            return 'Debes seleccionar un club de la base de datos.';
        }

        if (sourceMode === 'manual' && !manualName.trim()) {
            return 'El nombre del participante es obligatorio.';
        }

        if (seed !== '' && (Number(seed) < 0 || !Number.isInteger(Number(seed)))) {
            return 'El seed debe ser un numero entero mayor o igual a 0.';
        }

        const finalName = sourceMode === 'database' ? selectedClub?.name || '' : manualName.trim();
        const duplicate = existingParticipants.some((item) => {
            if (isEditMode && item.id === participant?.id) {
                return false;
            }

            return (
                (clubId && item.club_id === clubId) ||
                item.name.toLowerCase() === finalName.toLowerCase()
            );
        });

        if (duplicate) {
            return 'Este participante ya esta registrado en el torneo.';
        }

        return null;
    };

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError(null);

        const validationError = validateForm();
        if (validationError) {
            setError(validationError);
            return;
        }

        setLoading(true);

        try {
            const data: ParticipantSavePayload = {
                club_id: sourceMode === 'database' ? clubId : null,
                name: sourceMode === 'database' ? (selectedClub?.name || manualName) : manualName.trim(),
                type,
                status,
                seed: seed === '' ? null : Number(seed),
                group_id: groupId || null,
                short_code: shortCode.trim() || null,
                notes: notes.trim() || null,
                replace_across_tournament: isReplacingLinkedClub && replaceAcrossTournament,
            };

            await onSave(data);
            resetForm();
            onClose();
        } catch (err: unknown) {
            const message =
                err instanceof Error && err.message
                    ? err.message
                    : typeof err === 'string'
                        ? err
                        : 'Error al guardar el participante.';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    const handleClose = () => {
        if (loading) {
            return;
        }

        resetForm();
        onClose();
    };

    // Declared before the early return so the hook order stays stable. handleClose
    // already no-ops while saving, so Escape can't discard an in-flight submit.
    const { ref: drawerRef, dialogProps: drawerDialogProps } = useDialog<HTMLDivElement>({
        open: isOpen,
        onClose: handleClose,
        labelledBy: 'upsert-participant-title',
    });

    if (!isOpen || typeof document === 'undefined') {
        return null;
    }

    return createPortal(
        <>
            {/* Presentational: the panel owns dismissal via Escape and the close
                button, so this click target is a convenience, not the only path. */}
            <div className="pp-drawer-overlay" onClick={handleClose} aria-hidden="true" />

            <div
                ref={drawerRef}
                className="pp-drawer-panel pp-drawer-panel-wide"
                {...drawerDialogProps}
            >
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    <div className="pp-drawer-header">
                        <div className="pp-drawer-header-content">
                            <div className="pp-drawer-header-left">
                                <div className="pp-drawer-icon">
                                    <UserPlus />
                                </div>
                                <h2 id="upsert-participant-title" className="pp-drawer-title">
                                    {isEditMode ? 'Editar Participante' : 'Nuevo Participante'}
                                </h2>
                                <p className="pp-drawer-subtitle">
                                    {isEditMode
                                        ? 'Ajusta el club vinculado, la configuracion competitiva y las notas del participante.'
                                        : 'Crea un nuevo participante para este torneo.'}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={handleClose}
                                disabled={loading}
                                className="pp-drawer-close"
                                aria-label="Cerrar"
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    <div className="pp-drawer-body">
                        {error && (
                            <div className="pp-error-message">
                                <AlertCircle />
                                {error}
                            </div>
                        )}

                        {!isEditMode && (
                            <div className="pp-drawer-section">
                                <label className="pp-drawer-section-title">Origen del participante</label>
                                <div className="pp-form-grid-2">
                                    <button
                                        type="button"
                                        onClick={() => setSourceMode('database')}
                                        className={`pp-segment-option ${sourceMode === 'database' ? 'selected' : ''}`}
                                    >
                                        Base de datos
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setSourceMode('manual')}
                                        className={`pp-segment-option ${sourceMode === 'manual' ? 'selected' : ''}`}
                                    >
                                        Entrada manual
                                    </button>
                                </div>
                            </div>
                        )}

                        {sourceMode === 'database' ? (
                            <div className="pp-drawer-section">
                                <label className="pp-drawer-section-title">Club vinculado</label>

                                <div className="pp-club-search">
                                    <Search />
                                    <input
                                        type="text"
                                        className="pp-club-search-input"
                                        placeholder="Buscar por nombre o codigo..."
                                        value={clubSearch}
                                        onChange={(event) => setClubSearch(event.target.value)}
                                    />
                                </div>

                                <div className="pp-club-list pp-upsert-club-list">
                                    {filteredClubs.length === 0 ? (
                                        <div className="pp-club-empty">
                                            <Search />
                                            <div className="pp-club-empty-title">No se encontraron clubes</div>
                                            <p className="pp-club-empty-text">
                                                Cambia el termino de busqueda para localizar otro club.
                                            </p>
                                        </div>
                                    ) : (
                                        filteredClubs.map((club) => {
                                            const isSelected = club.id === clubId;

                                            return (
                                                <button
                                                    key={club.id}
                                                    type="button"
                                                    className={`pp-club-card ${isSelected ? 'selected' : ''}`}
                                                    onClick={() => {
                                                        setClubId(club.id);
                                                        setClubSearch(club.name);
                                                        setShortCode(club.short_name || '');
                                                    }}
                                                >
                                                    <div className="pp-club-logo">
                                                        {club.logo_url ? <img src={club.logo_url} alt={club.name} /> : <Tag />}
                                                    </div>
                                                    <div className="pp-club-info">
                                                        <div className="pp-club-name">{club.name}</div>
                                                        <div className="pp-club-meta">{club.short_name || 'Sin codigo corto'}</div>
                                                    </div>
                                                </button>
                                            );
                                        })
                                    )}
                                </div>

                                {selectedClub && (
                                    <div className="pp-info-card pp-info-card-success">
                                        <Info />
                                        <p>
                                            Vinculado a <strong>{selectedClub.name}</strong>.
                                            {' '}Este club se usara como referencia principal del participante.
                                        </p>
                                    </div>
                                )}

                                {isReplacingLinkedClub && (
                                    <label className="pp-replace-scope-card">
                                        <input
                                            type="checkbox"
                                            checked={replaceAcrossTournament}
                                            onChange={(event) => setReplaceAcrossTournament(event.target.checked)}
                                            disabled={loading}
                                        />
                                        <div className="pp-replace-scope-icon">
                                            <Repeat2 />
                                        </div>
                                        <div className="pp-replace-scope-content">
                                            <strong>Reemplazar en todo el torneo</strong>
                                            <span>
                                                Actualiza fixture, tabla guardada e incidentes para que {selectedClub?.name || 'el club nuevo'} herede
                                                los partidos, puntos y registros de {participant?.name || 'el club anterior'}.
                                            </span>
                                        </div>
                                    </label>
                                )}
                            </div>
                        ) : (
                            <div className="pp-drawer-section">
                                <label className="pp-drawer-section-title">Identidad manual</label>
                                <div className="pp-form-field">
                                    <label className="pp-form-label">Nombre del participante *</label>
                                    <input
                                        type="text"
                                        required
                                        value={manualName}
                                        onChange={(event) => setManualName(event.target.value)}
                                        placeholder="Ej: San Isidro Club"
                                        className="pp-form-input"
                                    />
                                </div>
                            </div>
                        )}

                        <div className="pp-drawer-section">
                            <label className="pp-drawer-section-title">Configuracion competitiva</label>

                            <div className="pp-form-field">
                                <label className="pp-form-label">Tipo de participante *</label>
                                <div className="pp-upsert-segmented pp-upsert-segmented-3">
                                    {TYPE_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setType(option.value)}
                                            className={`pp-segment-option ${type === option.value ? 'selected' : ''}`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="pp-form-field">
                                <label className="pp-form-label">Estado *</label>
                                <div className="pp-upsert-segmented pp-upsert-segmented-2">
                                    {STATUS_OPTIONS.map((option) => (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => setStatus(option.value)}
                                            className={`pp-segment-option ${status === option.value ? 'selected' : ''}`}
                                        >
                                            {option.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="pp-form-grid-2">
                                <div className="pp-form-field">
                                    <label className="pp-form-label pp-inline-label">
                                        <Hash />
                                        Seed / ranking
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={seed}
                                        onChange={(event) => setSeed(event.target.value ? Number(event.target.value) : '')}
                                        placeholder="Ej: 1"
                                        className="pp-form-input mono"
                                    />
                                </div>

                                <div className="pp-form-field">
                                    <label className="pp-form-label pp-inline-label">
                                        <Tag />
                                        Codigo corto
                                    </label>
                                    <input
                                        type="text"
                                        value={shortCode}
                                        onChange={(event) => setShortCode(event.target.value)}
                                        placeholder="Ej: SIC"
                                        className="pp-form-input mono pp-text-uppercase"
                                    />
                                </div>
                            </div>

                            {groups.length > 0 && phasesWithGroups.length > 0 && (
                                <div className="pp-form-grid-2">
                                    <div className="pp-form-field">
                                        <label className="pp-form-label">Fase</label>
                                        <div className="pp-select-wrap">
                                            <select
                                                value={selectedPhaseId}
                                                onChange={(event) => setSelectedPhaseId(event.target.value)}
                                                className="pp-form-input pp-form-select"
                                            >
                                                <option value="">Sin fase</option>
                                                {phasesWithGroups.map((phase) => (
                                                    <option key={phase.id} value={phase.id}>
                                                        {phase.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className="pp-form-field">
                                        <label className="pp-form-label">Grupo</label>
                                        <div className="pp-select-wrap">
                                            <select
                                                value={groupId}
                                                onChange={(event) => setGroupId(event.target.value)}
                                                className="pp-form-input pp-form-select"
                                                disabled={!selectedPhaseId}
                                            >
                                                <option value="">Sin grupo asignado</option>
                                                {availableGroups.map((group) => (
                                                    <option key={group.id} value={group.id}>
                                                        {group.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {groups.length > 0 && phasesWithGroups.length === 0 && (
                                <div className="pp-form-field">
                                    <label className="pp-form-label">Grupo</label>
                                    <div className="pp-select-wrap">
                                        <select
                                            value={groupId}
                                            onChange={(event) => setGroupId(event.target.value)}
                                            className="pp-form-input pp-form-select"
                                        >
                                            <option value="">Sin grupo asignado</option>
                                            {groups.map((group) => (
                                                <option key={group.id} value={group.id}>
                                                    {group.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="pp-drawer-section">
                            <label className="pp-drawer-section-title">Notas operativas</label>
                            <div className="pp-form-field">
                                <label className="pp-form-label">Observaciones internas</label>
                                <textarea
                                    rows={4}
                                    value={notes}
                                    onChange={(event) => setNotes(event.target.value)}
                                    placeholder="Lesiones, aclaraciones administrativas, restricciones..."
                                    className="pp-form-input pp-form-textarea"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pp-drawer-footer">
                        <div className="pp-drawer-actions">
                            <button
                                type="button"
                                onClick={handleClose}
                                className="pp-drawer-btn"
                                disabled={loading}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="pp-drawer-btn primary"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <div className="pp-drawer-spinner" />
                                        Guardando...
                                    </>
                                ) : (
                                    <>
                                        <Save />
                                        {isEditMode ? 'Actualizar participante' : 'Guardar participante'}
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </>,
        document.body
    );
}
