'use client';

/**
 * ADD PARTICIPANT DRAWER - PREMIUM CLUB SELECTION
 * Block-based design with club-first approach
 *
 * Features:
 * - Premium block-based layout
 * - Searchable club picker
 * - Duplicate club validation
 * - Auto-fill from club data
 * - Visual summary before save
 * - Robust footer with proper buttons
 */

import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, UserPlus, IdCard, Search, AlertCircle } from 'lucide-react';
import LogoUploader from '@/components/LogoUploader';
import { useDialog } from './useDialog';
import './participants-premium.css';
import './drawer-premium.css';

interface Club {
    id: string;
    name: string;
    short_name?: string | null;
    logo_url?: string | null;
    slug?: string | null;
    organizer?: {
        name: string;
    };
}

interface Participant {
    id: string;
    club_id: string | null;
    name: string;
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

interface NewParticipantInput {
    club_id: string;
    name: string;
    type: 'club';
    short_code: string | null;
    seed: null;
    status: 'active' | 'pending';
    group_id: string | null;
}

interface AddParticipantDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (participants: NewParticipantInput[]) => Promise<void>;
    clubs: Club[];
    phases: TournamentPhase[];
    groups: TournamentGroup[];
    existingParticipants?: Participant[];
    loadingClubs?: boolean;
    /** Deporte con el que se da de alta un club rápido. */
    sport?: string;
    /** El padre suma el club recién creado al catálogo que alimenta la lista. */
    onClubCreated?: (club: Club) => void;
}

const QUICK_CATEGORIES = ['Superior', 'Intermedia', 'Preintermedia', 'M19', 'M17', 'M16', 'M15'];

const QUICK_TYPES = [
    { value: 'club', label: 'Club' },
    { value: 'seleccion', label: 'Selección' },
    { value: 'academia', label: 'Academia' },
    { value: 'franquicia', label: 'Franquicia' },
];

export function AddParticipantDrawer({
    isOpen,
    onClose,
    onAdd,
    clubs,
    phases,
    groups,
    existingParticipants = [],
    loadingClubs = false,
    sport = 'rugby',
    onClubCreated,
}: AddParticipantDrawerProps) {
    // Form state
    const [selectedClubIds, setSelectedClubIds] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [status, setStatus] = useState<'active' | 'pending'>('active');
    const [selectedPhaseId, setSelectedPhaseId] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');

    // Alta rápida de club
    const [quickOpen, setQuickOpen] = useState(false);
    const [quickName, setQuickName] = useState('');
    const [quickShort, setQuickShort] = useState('');
    const [quickCity, setQuickCity] = useState('');
    const [quickType, setQuickType] = useState('club');
    const [quickCategories, setQuickCategories] = useState<string[]>([]);
    const [quickCustom, setQuickCustom] = useState('');
    const [quickLogo, setQuickLogo] = useState<string | null>(null);
    const [quickSaving, setQuickSaving] = useState(false);
    const [quickError, setQuickError] = useState('');

    const resetQuick = () => {
        setQuickName('');
        setQuickShort('');
        setQuickCity('');
        setQuickType('club');
        setQuickCategories([]);
        setQuickCustom('');
        setQuickLogo(null);
        setQuickError('');
    };

    const toggleQuickCategory = (name: string) => {
        setQuickCategories((prev) =>
            prev.includes(name) ? prev.filter((item) => item !== name) : [...prev, name]
        );
    };

    const addCustomCategory = () => {
        const value = quickCustom.trim();
        if (value.length < 2) return;
        setQuickCategories((prev) => (prev.includes(value) ? prev : [...prev, value]));
        setQuickCustom('');
    };

    const handleQuickCreate = async () => {
        const name = quickName.trim();
        if (name.length < 2) {
            setQuickError('Poné el nombre del club (mínimo 2 letras).');
            return;
        }
        setQuickSaving(true);
        setQuickError('');
        try {
            const response = await fetch('/api/admin/torneo/clubs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    name,
                    short_name: quickShort.trim() || null,
                    city: quickCity.trim() || null,
                    entity_type: quickType,
                    sport,
                    is_visible: true,
                    logo_url: quickLogo,
                    divisions: quickCategories.map((category) => ({ name: category, category })),
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.data?.id) {
                throw new Error(payload?.error || 'No se pudo crear el club');
            }
            const created = payload.data as Club;
            onClubCreated?.({
                id: created.id,
                name: created.name,
                short_name: created.short_name ?? null,
                slug: created.slug ?? null,
                logo_url: quickLogo ?? created.logo_url ?? null,
            });
            setSelectedClubIds((prev) => (prev.includes(created.id) ? prev : [...prev, created.id]));
            setSearchQuery('');
            resetQuick();
            setQuickOpen(false);
        } catch (err: unknown) {
            setQuickError(err instanceof Error ? err.message : 'No se pudo crear el club');
        } finally {
            setQuickSaving(false);
        }
    };

    // Reset form when drawer closes
    useEffect(() => {
        if (!isOpen) {
            setQuickOpen(false);
            resetQuick();
            setSelectedClubIds([]);
            setSearchQuery('');
            setStatus('active');
            setSelectedPhaseId('');
            setSelectedGroupId('');
            setError('');
        }
    }, [isOpen]);

    // Filtered clubs based on search
    const filteredClubs = useMemo(() => {
        if (!searchQuery.trim()) return clubs;

        const query = searchQuery.toLowerCase();
        return clubs.filter(club =>
            club.name.toLowerCase().includes(query) ||
            club.short_name?.toLowerCase().includes(query) ||
            club.slug?.toLowerCase().includes(query)
        );
    }, [clubs, searchQuery]);

    // Selected clubs details
    const selectedClubs = useMemo(() =>
        clubs.filter(c => selectedClubIds.includes(c.id)),
        [clubs, selectedClubIds]
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
            setSelectedGroupId('');
            return;
        }

        setSelectedGroupId((current) =>
            availableGroups.some((group) => group.id === current) ? current : ''
        );
    }, [availableGroups, selectedPhaseId]);

    // Helper to check if club is already a participant
    const isAlreadyParticipant = (clubId: string) => {
        return existingParticipants.some(p => p.club_id === clubId);
    };

    // Handle club selection (toggle)
    const handleToggleClub = (clubId: string) => {
        if (isAlreadyParticipant(clubId)) return;

        setSelectedClubIds(prev =>
            prev.includes(clubId)
                ? prev.filter(id => id !== clubId)
                : [...prev, clubId]
        );
        setError('');
    };

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (selectedClubIds.length === 0) {
            setError('Debes seleccionar al menos un club');
            return;
        }

        setLoading(true);
        setError('');

        try {
            const participantsToAdd: NewParticipantInput[] = selectedClubs.map(club => ({
                club_id: club.id,
                name: club.name,
                type: 'club',
                short_code: club.short_name || null,
                seed: null,
                status,
                group_id: selectedGroupId || null,
            }));

            await onAdd(participantsToAdd);

            // Reset and close on success
            setSelectedClubIds([]);
            setSearchQuery('');
            setStatus('active');
            setSelectedPhaseId('');
            setSelectedGroupId('');
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al crear participantes');
        } finally {
            setLoading(false);
        }
    };

    const { ref: drawerRef, dialogProps: drawerDialogProps } = useDialog<HTMLDivElement>({
        open: isOpen,
        onClose,
        labelledBy: 'add-participant-title',
    });

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal((
        <>
            {/* Overlay — presentational; Escape and the close button are the
                real dismissal paths. */}
            <div className="pp-drawer-overlay" onClick={onClose} aria-hidden="true" />

            {/* Panel */}
            <div ref={drawerRef} className="pp-drawer-panel" {...drawerDialogProps}>
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    {/* ========== BLOCK 1: HEADER ========== */}
                    <div className="pp-drawer-header">
                        <div className="pp-drawer-header-content">
                            <div className="pp-drawer-header-left">
                                <div className="pp-drawer-icon">
                                    <UserPlus />
                                </div>
                                <h2 id="add-participant-title" className="pp-drawer-title">Agregar Participante</h2>
                                <p className="pp-drawer-subtitle">
                                    Selecciona un club existente para agregarlo al torneo
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="pp-drawer-close"
                                aria-label="Cerrar"
                            >
                                <X aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    {/* ========== BLOCK 2: BODY ========== */}
                    <div className="pp-drawer-body">
                        {/* Error Message */}
                        {error && (
                            <div className="pp-error-message">
                                <AlertCircle />
                                {error}
                            </div>
                        )}

                        {/* Section: Club Selection */}
                        <div className="pp-drawer-section">
                            <label className="pp-drawer-section-title">Seleccionar Club</label>

                            {/* Alta rápida: el club no está en la lista */}
                            {!quickOpen ? (
                                <button
                                    type="button"
                                    className="pp-drawer-btn"
                                    onClick={() => setQuickOpen(true)}
                                >
                                    <UserPlus aria-hidden="true" /> ¿No está el club? Crearlo rápido
                                </button>
                            ) : (
                                <div
                                    className="pp-info-card"
                                    style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'stretch' }}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
                                            event.preventDefault();
                                            void handleQuickCreate();
                                        }
                                    }}
                                >
                                    <strong>Crear club rápido</strong>

                                    {quickError && (
                                        <div className="pp-error-message">
                                            <AlertCircle />
                                            {quickError}
                                        </div>
                                    )}

                                    <div className="pp-form-field">
                                        <label className="pp-form-label" htmlFor="quick-club-name">Nombre</label>
                                        <input
                                            id="quick-club-name"
                                            className="pp-form-input"
                                            value={quickName}
                                            onChange={(e) => setQuickName(e.target.value)}
                                            placeholder="Banco Nación"
                                            autoFocus
                                        />
                                    </div>

                                    <div className="pp-form-grid-2">
                                        <div className="pp-form-field">
                                            <label className="pp-form-label" htmlFor="quick-club-short">Nombre corto</label>
                                            <input
                                                id="quick-club-short"
                                                className="pp-form-input"
                                                value={quickShort}
                                                onChange={(e) => setQuickShort(e.target.value)}
                                                placeholder="BNA"
                                                maxLength={12}
                                            />
                                        </div>
                                        <div className="pp-form-field">
                                            <label className="pp-form-label" htmlFor="quick-club-city">Ciudad</label>
                                            <input
                                                id="quick-club-city"
                                                className="pp-form-input"
                                                value={quickCity}
                                                onChange={(e) => setQuickCity(e.target.value)}
                                                placeholder="Buenos Aires"
                                            />
                                        </div>
                                    </div>

                                    <div className="pp-form-field">
                                        <label className="pp-form-label">Tipo</label>
                                        <div className="pp-segmented-control" role="radiogroup" aria-label="Tipo de club">
                                            {QUICK_TYPES.map((type) => (
                                                <button
                                                    key={type.value}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={quickType === type.value}
                                                    className={`pp-segment-option ${quickType === type.value ? 'selected' : ''}`}
                                                    onClick={() => setQuickType(type.value)}
                                                >
                                                    {type.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="pp-form-field">
                                        <label className="pp-form-label">Categorías</label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                            {Array.from(new Set([...QUICK_CATEGORIES, ...quickCategories])).map((category) => {
                                                const on = quickCategories.includes(category);
                                                return (
                                                    <button
                                                        key={category}
                                                        type="button"
                                                        aria-pressed={on}
                                                        className={`pp-segment-option ${on ? 'selected' : ''}`}
                                                        onClick={() => toggleQuickCategory(category)}
                                                    >
                                                        {category}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                            <input
                                                className="pp-form-input"
                                                value={quickCustom}
                                                onChange={(e) => setQuickCustom(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        addCustomCategory();
                                                    }
                                                }}
                                                placeholder="Otra categoría (ej. Femenino)"
                                                aria-label="Otra categoría"
                                            />
                                            <button type="button" className="pp-drawer-btn" onClick={addCustomCategory}>
                                                Agregar
                                            </button>
                                        </div>
                                    </div>

                                    <div className="pp-form-field">
                                        <label className="pp-form-label">Logotipo</label>
                                        {quickLogo ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                <img src={quickLogo} alt="Logotipo del club" style={{ width: 48, height: 48, objectFit: 'contain' }} />
                                                <button type="button" className="pp-drawer-btn" onClick={() => setQuickLogo(null)}>
                                                    Quitar
                                                </button>
                                            </div>
                                        ) : (
                                            <LogoUploader onUpload={(url) => setQuickLogo(url)} />
                                        )}
                                    </div>

                                    <div className="pp-drawer-actions">
                                        <button
                                            type="button"
                                            className="pp-drawer-btn"
                                            onClick={() => { resetQuick(); setQuickOpen(false); }}
                                            disabled={quickSaving}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            className="pp-drawer-btn primary"
                                            onClick={() => void handleQuickCreate()}
                                            disabled={quickSaving || quickName.trim().length < 2}
                                        >
                                            {quickSaving ? 'Creando...' : 'Crear y seleccionar'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Search Input */}
                            <div className="pp-club-search">
                                <Search />
                                <input
                                    type="text"
                                    className="pp-club-search-input"
                                    placeholder="Buscar por nombre, código o slug..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>

                            {/* Club List */}
                            <div className="pp-club-list">
                                {loadingClubs ? (
                                    <div className="pp-club-empty">
                                        <div className="pp-drawer-spinner" />
                                        <div className="pp-club-empty-title">Cargando clubes</div>
                                        <p className="pp-club-empty-text">
                                            Estamos trayendo la lista de clubes desde la base de datos.
                                        </p>
                                    </div>
                                ) : filteredClubs.length === 0 ? (
                                    <div className="pp-club-empty">
                                        <IdCard />
                                        <div className="pp-club-empty-title">
                                            {clubs.length === 0
                                                ? 'No hay clubes creados'
                                                : 'No se encontraron clubes'}
                                        </div>
                                        <p className="pp-club-empty-text">
                                            {clubs.length === 0
                                                ? 'Creá un club con "Crearlo rápido" y se agrega como participante'
                                                : 'Prueba con otro término de búsqueda'}
                                        </p>
                                    </div>
                                ) : (
                                    filteredClubs.map(club => {
                                        const isSelected = selectedClubIds.includes(club.id);
                                        const isExists = isAlreadyParticipant(club.id);

                                        return (
                                            <div
                                                key={club.id}
                                                className={`pp-club-card ${isSelected ? 'selected' : ''} ${isExists ? 'disabled' : ''}`}
                                                onClick={() => handleToggleClub(club.id)}
                                            >
                                                <div className="pp-club-logo">
                                                    {club.logo_url ? (
                                                        <img src={club.logo_url} alt={club.name} />
                                                    ) : (
                                                        <IdCard />
                                                    )}
                                                </div>
                                                <div className="pp-club-info">
                                                    <div className="pp-club-name">{club.name}</div>
                                                    <div className="pp-club-meta">
                                                        {club.short_name || club.slug || '---'}
                                                        {club.organizer?.name && ` • ${club.organizer.name}`}
                                                    </div>
                                                </div>
                                                {isExists && (
                                                    <div className="pp-club-badge">Ya agregado</div>
                                                )}
                                                {isSelected && !isExists && (
                                                    <div className="pp-club-badge selected">Seleccionado</div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            {/* Selected Clubs Summary */}
                            {selectedClubs.length > 0 && (
                                <div className="pp-summary-section">
                                    <div className="pp-summary-label">
                                        Clubes Seleccionados ({selectedClubs.length})
                                    </div>
                                    <div className="pp-summary-grid">
                                        {selectedClubs.map(club => (
                                            <div key={club.id} className="pp-summary-item">
                                                <div className="pp-summary-item-logo">
                                                    {club.logo_url ? (
                                                        <img src={club.logo_url} alt={club.name} />
                                                    ) : (
                                                        <IdCard />
                                                    )}
                                                </div>
                                                <span className="pp-summary-item-name">{club.name}</span>
                                                <button
                                                    type="button"
                                                    className="pp-summary-item-remove"
                                                    onClick={() => handleToggleClub(club.id)}
                                                >
                                                    <X />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Section: Metadata Information */}
                        {selectedClubIds.length > 0 && (
                            <div className="pp-drawer-section">
                                <div className="pp-info-card">
                                    <AlertCircle />
                                    <p>
                                        Los participantes se agregarán con sus nombres y códigos cortos por defecto.
                                        Podrás editar seeds y rankings individualmente una vez guardados.
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Section: Initial Status */}
                        {selectedClubIds.length > 0 && (
                            <div className="pp-drawer-section">
                                <label className="pp-drawer-section-title">Estado Inicial (Para todos)</label>

                                <div className="pp-segmented-control">
                                    <button
                                        type="button"
                                        className={`pp-segment-option ${status === 'active' ? 'selected' : ''}`}
                                        onClick={() => setStatus('active')}
                                    >
                                        Activo
                                    </button>
                                    <button
                                        type="button"
                                        className={`pp-segment-option ${status === 'pending' ? 'selected' : ''}`}
                                        onClick={() => setStatus('pending')}
                                    >
                                        Pendiente
                                    </button>
                                </div>
                            </div>
                        )}

                        {selectedClubIds.length > 0 && phasesWithGroups.length > 0 && (
                            <div className="pp-drawer-section">
                                <label className="pp-drawer-section-title">Agregar a grupo por fase</label>

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
                                                value={selectedGroupId}
                                                onChange={(event) => setSelectedGroupId(event.target.value)}
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

                                <div className="pp-info-card">
                                    <AlertCircle />
                                    <p>
                                        Si seleccionas fase y grupo, todos los clubes elegidos se crearan directamente en ese grupo.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ========== BLOCK 3: FOOTER ========== */}
                    <div className="pp-drawer-footer">
                        <div className="pp-drawer-actions">
                            <button
                                type="button"
                                onClick={onClose}
                                className="pp-drawer-btn"
                                disabled={loading}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="pp-drawer-btn primary"
                                disabled={loading || loadingClubs || selectedClubIds.length === 0 || clubs.length === 0}
                            >
                                {loading ? (
                                    <>
                                        <div className="pp-drawer-spinner" />
                                        Guardando...
                                    </>
                                ) : (
                                    `Guardar ${selectedClubIds.length} Participantes`
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </>
    ), document.body);
}
