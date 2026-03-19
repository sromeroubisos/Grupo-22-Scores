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

interface NewParticipantInput {
    club_id: string;
    name: string;
    type: 'club';
    short_code: string | null;
    seed: null;
    status: 'active' | 'pending';
}

interface AddParticipantDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (participants: NewParticipantInput[]) => Promise<void>;
    clubs: Club[];
    existingParticipants?: Participant[];
    loadingClubs?: boolean;
}

export function AddParticipantDrawer({
    isOpen,
    onClose,
    onAdd,
    clubs,
    existingParticipants = [],
    loadingClubs = false,
}: AddParticipantDrawerProps) {
    // Form state
    const [selectedClubIds, setSelectedClubIds] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [status, setStatus] = useState<'active' | 'pending'>('active');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string>('');

    // Reset form when drawer closes
    useEffect(() => {
        if (!isOpen) {
            setSelectedClubIds([]);
            setSearchQuery('');
            setStatus('active');
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
            const participantsToAdd = selectedClubs.map(club => ({
                club_id: club.id,
                name: club.name,
                type: 'club',
                short_code: club.short_name || null,
                seed: null,
                status
            }));

            await onAdd(participantsToAdd);

            // Reset and close on success
            setSelectedClubIds([]);
            setSearchQuery('');
            setStatus('active');
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al crear participantes');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || typeof document === 'undefined') return null;

    return createPortal((
        <>
            {/* Overlay */}
            <div className="pp-drawer-overlay" onClick={onClose} />

            {/* Panel */}
            <div className="pp-drawer-panel">
                <form onSubmit={handleSubmit} className="flex flex-col h-full">
                    {/* ========== BLOCK 1: HEADER ========== */}
                    <div className="pp-drawer-header">
                        <div className="pp-drawer-header-content">
                            <div className="pp-drawer-header-left">
                                <div className="pp-drawer-icon">
                                    <UserPlus />
                                </div>
                                <h2 className="pp-drawer-title">Agregar Participante</h2>
                                <p className="pp-drawer-subtitle">
                                    Selecciona un club existente para agregarlo al torneo
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                className="pp-drawer-close"
                            >
                                <X />
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
                                                ? 'Crea un club primero antes de agregarlo como participante'
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
