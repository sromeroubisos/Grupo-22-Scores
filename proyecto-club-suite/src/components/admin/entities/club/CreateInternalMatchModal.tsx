'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    Swords,
    Calendar,
    Shield,
    Users,
    Sparkles,
    Loader2,
    X,
} from 'lucide-react';
import type { Division } from '@/lib/services/divisionService';

type ClubTournamentOption = {
    id: string;
    name: string;
    originalName?: string | null;
    seasonId?: string | null;
    sportId?: string | null;
    status?: string | null;
    reviewStatus?: string | null;
    isPending: boolean;
};

type ClubRivalOption = {
    id: string;
    name: string;
    normalizedName?: string | null;
    officialClubId?: string | null;
    reviewStatus?: string | null;
    createdAt?: string | null;
};

interface CreateInternalMatchModalProps {
    open: boolean;
    clubId: string;
    divisions: Division[];
    onClose: () => void;
}

export function CreateInternalMatchModal({
    open,
    clubId,
    divisions,
    onClose,
}: CreateInternalMatchModalProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [createForm, setCreateForm] = useState({
        rival: '',
        rivalMode: 'existing' as 'existing' | 'new',
        date: '',
        time: '',
        venue: '',
        isHome: true,
        matchType: 'amistoso',
        tournamentId: '',
        tournamentMode: 'none' as 'none' | 'existing' | 'new',
        newTournamentName: '',
        newTournamentSeasonId: String(new Date().getFullYear()),
        divisionId: '',
        notes: '',
    });
    const [creating, setCreating] = useState(false);
    const [clubTournaments, setClubTournaments] = useState<ClubTournamentOption[]>([]);
    const [loadingClubTournaments, setLoadingClubTournaments] = useState(false);
    const [clubTournamentsError, setClubTournamentsError] = useState<string | null>(null);
    const [clubRivals, setClubRivals] = useState<ClubRivalOption[]>([]);
    const [loadingClubRivals, setLoadingClubRivals] = useState(false);
    const [clubRivalsError, setClubRivalsError] = useState<string | null>(null);

    const loadClubTournamentOptions = useCallback(async () => {
        setLoadingClubTournaments(true);
        setClubTournamentsError(null);
        try {
            const params = new URLSearchParams({ club: clubId });
            const response = await fetch(`/api/club-admin/tournaments?${params.toString()}`, {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) {
                throw new Error(payload?.error || 'No se pudieron cargar los torneos');
            }
            setClubTournaments(Array.isArray(payload.data?.tournaments) ? payload.data.tournaments : []);
        } catch (error) {
            setClubTournaments([]);
            setClubTournamentsError(error instanceof Error ? error.message : 'No se pudieron cargar los torneos');
        } finally {
            setLoadingClubTournaments(false);
        }
    }, [clubId]);

    const loadClubRivalOptions = useCallback(async () => {
        setLoadingClubRivals(true);
        setClubRivalsError(null);
        try {
            const params = new URLSearchParams({ club: clubId });
            const response = await fetch(`/api/club-admin/rivals?${params.toString()}`, {
                credentials: 'same-origin',
                cache: 'no-store',
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) {
                throw new Error(payload?.error || 'No se pudieron cargar los rivales');
            }
            setClubRivals(Array.isArray(payload.data?.rivals) ? payload.data.rivals : []);
        } catch (error) {
            setClubRivals([]);
            setClubRivalsError(error instanceof Error ? error.message : 'No se pudieron cargar los rivales');
        } finally {
            setLoadingClubRivals(false);
        }
    }, [clubId]);

    useEffect(() => {
        if (!open) return;
        void loadClubTournamentOptions();
        void loadClubRivalOptions();
    }, [open, loadClubTournamentOptions, loadClubRivalOptions]);

    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    useEffect(() => {
        function handleKeyDown(e: KeyboardEvent) {
            if (e.key === 'Escape') onClose();
        }
        if (open) {
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [open, onClose]);

    useEffect(() => {
        const panel = panelRef.current;
        if (!panel) return;

        function onMouseMove(e: MouseEvent) {
            const x = e.clientX / window.innerWidth;
            const y = e.clientY / window.innerHeight;
            panel.style.boxShadow = `
                ${(x - 0.5) * 20}px ${(y - 0.5) * 20}px 50px -12px rgba(0, 0, 0, 0.5),
                inset 0 0 20px rgba(255, 255, 255, 0.02)
            `;
        }

        if (open) {
            document.addEventListener('mousemove', onMouseMove);
            return () => document.removeEventListener('mousemove', onMouseMove);
        }
    }, [open]);

    const handleSubmit = async () => {
        const rivalName = createForm.rival.trim();
        if (!rivalName || !createForm.date || !createForm.time) {
            alert('Completá rival, fecha y hora');
            return;
        }
        if (createForm.tournamentMode === 'new' && !createForm.newTournamentName.trim()) {
            alert('Completa el nombre del torneo');
            return;
        }
        setCreating(true);
        try {
            if (createForm.rivalMode === 'new') {
                const rivalRes = await fetch('/api/club-admin/rivals', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ clubId, name: rivalName }),
                });
                const rivalPayload = await rivalRes.json().catch(() => null);
                if (!rivalRes.ok || !rivalPayload?.ok) {
                    console.warn('[ClubAdmin CREATE match] could not save rival:', rivalPayload?.error);
                }
            }

            const response = await fetch('/api/club-admin/matches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubId,
                    awayClubId: rivalName,
                    rivalName: rivalName,
                    date: createForm.date,
                    time: createForm.time,
                    venue: createForm.venue,
                    isHome: createForm.isHome,
                    matchType: createForm.matchType,
                    tournamentId: createForm.tournamentMode === 'existing' ? createForm.tournamentId : null,
                    newTournament: createForm.tournamentMode === 'new'
                        ? {
                            name: createForm.newTournamentName,
                            seasonId: createForm.newTournamentSeasonId,
                        }
                        : null,
                    divisionId: createForm.divisionId || null,
                    notes: createForm.notes,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok || !payload?.ok) {
                throw new Error(payload?.error || 'Error al crear');
            }
            const data = payload.data;
            onClose();
            window.open(`/club-admin/matches/${data.id}?club=${encodeURIComponent(clubId)}`, '_blank');
            setTimeout(() => window.location.reload(), 500);
        } catch (error) {
            alert(error instanceof Error ? error.message : 'Error al crear el partido');
        } finally {
            setCreating(false);
        }
    };

    const updateForm = (patch: Partial<typeof createForm>) => {
        setCreateForm((prev) => ({ ...prev, ...patch }));
    };

    if (!open) return null;

    return createPortal(
        <div
            className="cim-backdrop"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
        >
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;500;800&family=Space+Mono:wght@400;700&display=swap');

                .cim-backdrop {
                    position: fixed;
                    inset: 0;
                    z-index: 10000;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    padding: 16px;
                    background-color: var(--color-bg-primary);
                    background-image:
                        radial-gradient(circle at 20% 30%, rgba(0, 255, 136, 0.05) 0%, transparent 40%),
                        radial-gradient(circle at 80% 70%, rgba(0, 136, 255, 0.05) 0%, transparent 40%);
                    overflow-y: auto;
                }

                .cim-glass {
                    position: relative;
                    width: 100%;
                    max-width: 640px;
                    background: var(--color-bg-hover);
                    backdrop-filter: blur(40px) saturate(150%);
                    -webkit-backdrop-filter: blur(40px) saturate(150%);
                    border: 1px solid var(--color-border);
                    border-radius: 32px;
                    padding: 40px;
                    box-shadow:
                        0 25px 50px -12px rgba(0, 0, 0, 0.5),
                        inset 0 0 20px rgba(255, 255, 255, 0.02);
                    animation: cim-panelEntry 1s cubic-bezier(0.16, 1, 0.3, 1);
                    overflow: hidden;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    color: var(--color-text-primary);
                }

                .cim-glass::before {
                    content: "";
                    position: absolute;
                    top: 0; left: 0; right: 0; height: 100%;
                    background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 50%, rgba(255,255,255,0.05) 100%);
                    pointer-events: none;
                }

                @keyframes cim-panelEntry {
                    from { opacity: 0; transform: translateY(40px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }

                .cim-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    margin-bottom: 40px;
                }

                .cim-header-content h1 {
                    font-size: 2rem;
                    font-weight: 800;
                    letter-spacing: -0.03em;
                    margin-bottom: 8px;
                    background: linear-gradient(to bottom, #fff 40%, rgba(255,255,255,0.5));
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                .cim-header-content p {
                    color: var(--color-text-secondary);
                    font-size: 1rem;
                }

                .cim-btn-close {
                    background: var(--color-bg-hover);
                    border: 1px solid var(--color-border);
                    width: 40px;
                    height: 40px;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.3s ease;
                    color: var(--color-text-primary);
                    flex-shrink: 0;
                }

                .cim-btn-close:hover {
                    background: var(--color-bg-tertiary);
                    transform: rotate(90deg);
                }

                .cim-section {
                    margin-bottom: 32px;
                    position: relative;
                }

                .cim-section-label {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    font-family: 'Space Mono', monospace;
                    font-size: 0.7rem;
                    font-weight: 700;
                    text-transform: uppercase;
                    letter-spacing: 0.2em;
                    color: var(--color-text-secondary);
                    margin-bottom: 16px;
                }

                .cim-grid-3 {
                    display: grid;
                    grid-template-columns: 1fr 1fr 1.5fr;
                    gap: 16px;
                }

                .cim-grid-2 {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 16px;
                }

                @media (max-width: 640px) {
                    .cim-backdrop {
                        align-items: flex-start;
                        padding: 8px;
                    }
                    .cim-glass {
                        padding: 20px;
                        border-radius: 20px;
                        max-width: 100%;
                    }
                    .cim-header {
                        margin-bottom: 24px;
                    }
                    .cim-header-content h1 {
                        font-size: 1.35rem;
                    }
                    .cim-header-content p {
                        font-size: 0.9rem;
                    }
                    .cim-grid-3, .cim-grid-2 {
                        grid-template-columns: 1fr;
                    }
                    .cim-new-panel .cim-grid-3 > .cim-input-group {
                        grid-column: unset !important;
                    }
                    .cim-section {
                        margin-bottom: 24px;
                    }
                    .cim-section-label {
                        font-size: 0.65rem;
                        margin-bottom: 12px;
                    }
                    .cim-input-group input,
                    .cim-input-group select,
                    .cim-input-group textarea {
                        padding: 16px;
                        font-size: 1rem;
                        border-radius: 14px;
                    }
                    .cim-actions {
                        flex-direction: column;
                        gap: 12px;
                        margin-top: 32px;
                        padding-top: 24px;
                    }
                    .cim-btn {
                        width: 100%;
                        padding: 14px 24px;
                        border-radius: 14px;
                    }
                }

                .cim-input-group {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .cim-input-group label {
                    font-size: 0.8rem;
                    font-weight: 500;
                    color: var(--color-text-secondary);
                    padding-left: 4px;
                    font-family: 'Plus Jakarta Sans', sans-serif;
                }

                .cim-input-group input,
                .cim-input-group select,
                .cim-input-group textarea {
                    background: rgba(255, 255, 255, 0.03);
                    border: 1px solid var(--color-border);
                    border-radius: 12px;
                    padding: 14px 16px;
                    color: var(--color-text-primary);
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    font-size: 0.95rem;
                    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    width: 100%;
                    outline: none;
                    -webkit-appearance: none;
                    appearance: none;
                }

                .cim-input-group input:focus,
                .cim-input-group select:focus,
                .cim-input-group textarea:focus {
                    background: var(--color-bg-tertiary);
                    border-color: var(--color-border-light);
                    box-shadow: 0 0 20px var(--color-border);
                }

                .cim-input-group select {
                    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
                    background-repeat: no-repeat;
                    background-position: right 16px center;
                    padding-right: 40px;
                }

                .cim-input-group ::placeholder {
                    color: var(--color-text-muted);
                }

                .cim-input-group option {
                    background: var(--color-bg-secondary);
                    color: var(--color-text-primary);
                }

                .cim-error-container {
                    margin-top: 10px;
                    padding: 12px;
                    background: color-mix(in srgb, var(--color-error) 5%, transparent);
                    border-left: 2px solid var(--color-error);
                    border-radius: 4px 12px 12px 4px;
                    animation: cim-shake 0.5s cubic-bezier(.36,.07,.19,.97) both;
                }

                .cim-error-text {
                    font-family: 'Space Mono', monospace;
                    font-size: 0.75rem;
                    color: var(--color-error);
                    line-height: 1.4;
                }

                @keyframes cim-shake {
                    10%, 90% { transform: translate3d(-1px, 0, 0); }
                    20%, 80% { transform: translate3d(2px, 0, 0); }
                    30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
                    40%, 60% { transform: translate3d(4px, 0, 0); }
                }

                .cim-actions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 16px;
                    margin-top: 48px;
                    padding-top: 32px;
                    border-top: 1px solid var(--color-border);
                }

                .cim-btn {
                    padding: 16px 32px;
                    border-radius: 16px;
                    font-weight: 700;
                    font-size: 0.95rem;
                    cursor: pointer;
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    font-family: 'Plus Jakarta Sans', sans-serif;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    border: none;
                }

                .cim-btn-ghost {
                    background: transparent;
                    border: 1px solid var(--color-border);
                    color: var(--color-text-secondary);
                }

                .cim-btn-ghost:hover {
                    background: var(--color-bg-hover);
                    color: var(--color-text-primary);
                    transform: translateY(-2px);
                }

                .cim-btn-primary {
                    background: #00ff88;
                    color: #00331a;
                    box-shadow: 0 10px 30px rgba(0, 255, 136, 0.2);
                    position: relative;
                    overflow: hidden;
                }

                .cim-btn-primary:hover {
                    transform: translateY(-4px) scale(1.02);
                    box-shadow: 0 15px 40px rgba(0, 255, 136, 0.4);
                }

                .cim-btn-primary::after {
                    content: "";
                    position: absolute;
                    top: -50%; left: -50%; width: 200%; height: 200%;
                    background: radial-gradient(circle, rgba(255,255,255,0.4) 0%, transparent 60%);
                    opacity: 0;
                    transition: opacity 0.3s;
                }

                .cim-btn-primary:active::after {
                    opacity: 1;
                    transform: scale(0.1);
                    transition: 0s;
                }

                .cim-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                    transform: none !important;
                }

                .cim-info-text {
                    font-family: 'Space Mono', monospace;
                    font-size: 0.75rem;
                    color: var(--color-text-secondary);
                    line-height: 1.4;
                    margin-top: 8px;
                }

                .cim-new-panel {
                    margin-top: 12px;
                    padding: 16px;
                    background: color-mix(in srgb, var(--color-success) 5%, transparent);
                    border: 1px solid color-mix(in srgb, var(--color-success) 20%, transparent);
                    border-radius: 12px;
                }

                .cim-loading-text {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-family: 'Space Mono', monospace;
                    font-size: 0.75rem;
                    color: var(--color-text-secondary);
                    margin-top: 8px;
                }

                [data-theme="light"] .cim-glass {
                    background: rgba(255, 255, 255, 0.7);
                    box-shadow:
                        0 25px 50px -12px rgba(0, 0, 0, 0.1),
                        inset 0 0 20px rgba(0, 0, 0, 0.02);
                }

                [data-theme="light"] .cim-glass::before {
                    background: linear-gradient(135deg, rgba(0,0,0,0.05) 0%, transparent 50%, rgba(0,0,0,0.02) 100%);
                }

                [data-theme="light"] .cim-header-content h1 {
                    background: linear-gradient(to bottom, #0f172a 40%, rgba(15,23,42,0.5));
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }

                [data-theme="light"] .cim-input-group input:focus,
                [data-theme="light"] .cim-input-group select:focus,
                [data-theme="light"] .cim-input-group textarea:focus {
                    background: rgba(0, 0, 0, 0.03);
                    border-color: rgba(0, 0, 0, 0.2);
                    box-shadow: 0 0 20px rgba(0, 0, 0, 0.05);
                }

                [data-theme="light"] .cim-btn-primary::after {
                    background: radial-gradient(circle, rgba(0,0,0,0.15) 0%, transparent 60%);
                }
            `}</style>

            <div className="cim-glass" ref={panelRef}>
                <header className="cim-header">
                    <div className="cim-header-content">
                        <h1>Crear partido interno</h1>
                        <p>Planificá un nuevo encuentro para tu club.</p>
                    </div>
                    <button className="cim-btn-close" onClick={onClose} aria-label="Cerrar">
                        <X className="w-5 h-5" />
                    </button>
                </header>

                <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }}>
                    {/* RIVAL SECTION */}
                    <section className="cim-section">
                        <div className="cim-section-label">
                            <Swords className="w-3.5 h-3.5" /> Rival
                        </div>
                        <div className="cim-input-group">
                            <select
                                value={createForm.rivalMode === 'new' ? '__new__' : createForm.rival}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '__new__') {
                                        updateForm({ rivalMode: 'new', rival: '' });
                                        return;
                                    }
                                    updateForm({ rivalMode: 'existing', rival: value });
                                }}
                            >
                                <option value="">Seleccionar rival...</option>
                                {clubRivals.map((rival) => (
                                    <option key={rival.id} value={rival.name}>{rival.name}</option>
                                ))}
                                <option value="__new__">Escribir rival nuevo...</option>
                            </select>
                            {loadingClubRivals && (
                                <div className="cim-loading-text">
                                    <Loader2 className="w-3 h-3 animate-spin" /> Cargando rivales...
                                </div>
                            )}
                            {clubRivalsError && (
                                <div className="cim-error-container">
                                    <div className="cim-error-text">{clubRivalsError}</div>
                                </div>
                            )}
                        </div>
                        {createForm.rivalMode === 'new' && (
                            <div className="cim-new-panel">
                                <div className="cim-input-group">
                                    <label>Nombre del rival</label>
                                    <input
                                        type="text"
                                        value={createForm.rival}
                                        onChange={(e) => updateForm({ rival: e.target.value })}
                                        placeholder="Ej: Club Atlético River Plate"
                                    />
                                </div>
                                <p className="cim-info-text">
                                    El rival queda guardado en tu club para reutilizarlo y pendiente de revisión por un Super Admin.
                                </p>
                            </div>
                        )}
                    </section>

                    {/* PROGRAMACIÓN SECTION */}
                    <section className="cim-section">
                        <div className="cim-section-label">
                            <Calendar className="w-3.5 h-3.5" /> Programación
                        </div>
                        <div className="cim-grid-3">
                            <div className="cim-input-group">
                                <label>Fecha</label>
                                <input
                                    type="date"
                                    value={createForm.date}
                                    onChange={(e) => updateForm({ date: e.target.value })}
                                />
                            </div>
                            <div className="cim-input-group">
                                <label>Hora</label>
                                <input
                                    type="time"
                                    value={createForm.time}
                                    onChange={(e) => updateForm({ time: e.target.value })}
                                />
                            </div>
                            <div className="cim-input-group">
                                <label>Sede / Cancha</label>
                                <input
                                    type="text"
                                    value={createForm.venue}
                                    onChange={(e) => updateForm({ venue: e.target.value })}
                                    placeholder="Nombre de la cancha"
                                />
                            </div>
                        </div>
                    </section>

                    {/* DETALLES SECTION */}
                    <section className="cim-section">
                        <div className="cim-section-label">
                            <Shield className="w-3.5 h-3.5" /> Detalles del Partido
                        </div>
                        <div className="cim-grid-3">
                            <div className="cim-input-group">
                                <label>Condición</label>
                                <select
                                    value={createForm.isHome ? 'home' : 'away'}
                                    onChange={(e) => updateForm({ isHome: e.target.value === 'home' })}
                                >
                                    <option value="home">Local</option>
                                    <option value="away">Visitante</option>
                                </select>
                            </div>
                            <div className="cim-input-group">
                                <label>Tipo</label>
                                <select
                                    value={createForm.matchType}
                                    onChange={(e) => updateForm({ matchType: e.target.value })}
                                >
                                    <option value="amistoso">Amistoso</option>
                                    <option value="entrenamiento">Entrenamiento</option>
                                    <option value="interno">Interno</option>
                                    <option value="otro">Otro</option>
                                </select>
                            </div>
                            <div className="cim-input-group">
                                <label>Torneo</label>
                                <select
                                    value={createForm.tournamentMode === 'new' ? '__new__' : createForm.tournamentId}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === '__new__') {
                                            updateForm({ tournamentMode: 'new', tournamentId: '' });
                                            return;
                                        }
                                        updateForm({
                                            tournamentMode: value ? 'existing' : 'none',
                                            tournamentId: value,
                                        });
                                    }}
                                >
                                    <option value="">Sin torneo</option>
                                    <option value="__new__">Crear torneo nuevo pendiente</option>
                                    {clubTournaments.filter((t) => t.isPending).map((t) => (
                                        <option key={t.id} value={t.id}>{t.name} (pendiente)</option>
                                    ))}
                                    {clubTournaments.filter((t) => !t.isPending).map((t) => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        {loadingClubTournaments && (
                            <div className="cim-loading-text" style={{ marginTop: 12 }}>
                                <Loader2 className="w-3 h-3 animate-spin" /> Cargando torneos...
                            </div>
                        )}
                        {clubTournamentsError && (
                            <div className="cim-error-container" style={{ marginTop: 16 }}>
                                <div className="cim-error-text">{clubTournamentsError}</div>
                            </div>
                        )}
                        {createForm.tournamentMode === 'new' && (
                            <div className="cim-new-panel">
                                <div className="cim-grid-3">
                                    <div className="cim-input-group" style={{ gridColumn: 'span 2' }}>
                                        <label>Nombre del torneo</label>
                                        <input
                                            type="text"
                                            value={createForm.newTournamentName}
                                            onChange={(e) => updateForm({ newTournamentName: e.target.value })}
                                            placeholder="Ej: Copa Apertura M19"
                                        />
                                    </div>
                                    <div className="cim-input-group">
                                        <label>Temporada</label>
                                        <input
                                            type="text"
                                            value={createForm.newTournamentSeasonId}
                                            onChange={(e) => updateForm({ newTournamentSeasonId: e.target.value })}
                                            placeholder="2026"
                                        />
                                    </div>
                                </div>
                                <p className="cim-info-text">
                                    El torneo queda pendiente de revisión y solo se usa dentro de tu club hasta que un Super Admin lo publique o lo vincule.
                                </p>
                            </div>
                        )}
                    </section>

                    {/* EQUIPO SECTION */}
                    <section className="cim-section">
                        <div className="cim-section-label">
                            <Users className="w-3.5 h-3.5" /> Equipo y Notas
                        </div>
                        <div className="cim-grid-2">
                            <div className="cim-input-group">
                                <label>Equipo / División</label>
                                <select
                                    value={createForm.divisionId}
                                    onChange={(e) => updateForm({ divisionId: e.target.value })}
                                >
                                    <option value="">Seleccionar equipo...</option>
                                    {divisions.map((division) => (
                                        <option key={division.id} value={division.id}>{division.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="cim-input-group">
                                <label>Notas</label>
                                <textarea
                                    value={createForm.notes}
                                    onChange={(e) => updateForm({ notes: e.target.value })}
                                    placeholder="Observaciones adicionales..."
                                    rows={1}
                                    style={{ resize: 'none' }}
                                />
                            </div>
                        </div>
                    </section>

                    {/* ACTIONS */}
                    <div className="cim-actions">
                        <button type="button" className="cim-btn cim-btn-ghost" onClick={onClose} disabled={creating}>
                            Cancelar
                        </button>
                        <button type="submit" className="cim-btn cim-btn-primary" disabled={creating}>
                            {creating ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" /> Creando...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4" /> Crear partido
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
