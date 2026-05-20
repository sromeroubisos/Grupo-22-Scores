'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Eye, EyeOff, MoreHorizontal, Plus, Search, ShieldQuestion, SlidersHorizontal, Trash2, Trophy } from 'lucide-react';
import styles from '../tournament-admin.module.css';

type Tournament = {
    id: string;
    name: string;
    display_name: string | null;
    slug: string | null;
    sport_id: string | null;
    season_id: string | null;
    country: string | null;
    region: string | null;
    format: string | null;
    status: string | null;
    is_visible: boolean | null;
    logo_url: string | null;
    primary_color: string | null;
    created_at: string | null;
};

type Club = {
    id: string;
    name: string;
};

type Participant = {
    id: string;
    club_id: string | null;
    name: string | null;
    status: string | null;
    clubs?: { id: string; name: string; slug: string | null; logo_url: string | null } | null;
};

const STATUS_LABELS: Record<string, string> = {
    draft: 'Borrador',
    published: 'Publicado',
    active: 'Activo',
    archived: 'Archivado',
};

function badgeClass(status: string | null, stylesMap: Record<string, string>) {
    const key = status || 'draft';
    if (key === 'published' || key === 'active') return stylesMap.badgePublicado;
    if (key === 'archived') return stylesMap.badgeArchivado;
    return stylesMap.badgeBorrador;
}

function shortId(id: string, sport: string | null, season: string | null): string {
    const t = (season || '').slice(-4) || '----';
    const s = (sport || 'GEN').slice(0, 4).toUpperCase();
    const tail = id.replace(/-/g, '').slice(-4).toUpperCase() || 'XXXX';
    return `T${t}-${s}-${tail}`;
}

export default function TournamentAdminTournamentsPage() {
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [clubs, setClubs] = useState<Club[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [okMsg, setOkMsg] = useState<string | null>(null);

    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [managingId, setManagingId] = useState<string | null>(null);
    const [participants, setParticipants] = useState<Record<string, Participant[]>>({});
    const [participantLoading, setParticipantLoading] = useState<string | null>(null);

    const [linkingTournamentId, setLinkingTournamentId] = useState<string | null>(null);
    const [selectedClubId, setSelectedClubId] = useState('');
    const [linking, setLinking] = useState(false);

    const [requestOpen, setRequestOpen] = useState(false);
    const [availableTournaments, setAvailableTournaments] = useState<Tournament[]>([]);
    const [availableLoading, setAvailableLoading] = useState(false);
    const [availableSearch, setAvailableSearch] = useState('');
    const [requestedIds, setRequestedIds] = useState<string[]>([]);
    const [requestNote, setRequestNote] = useState('');
    const [sendingRequest, setSendingRequest] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const [tournamentsRes, clubsRes] = await Promise.all([
                fetch('/api/admin/torneo/tournaments?limit=300', { cache: 'no-store', credentials: 'include' }),
                fetch('/api/admin/torneo/clubs?limit=1000', { cache: 'no-store', credentials: 'include' }),
            ]);
            const tournamentsPayload = await tournamentsRes.json();
            const clubsPayload = await clubsRes.json();
            if (!tournamentsRes.ok) throw new Error(tournamentsPayload.error || 'Error al cargar torneos');
            if (!clubsRes.ok) throw new Error(clubsPayload.error || 'Error al cargar clubes');

            setTournaments(Array.isArray(tournamentsPayload.data) ? tournamentsPayload.data : []);
            setClubs(Array.isArray(clubsPayload.data) ? clubsPayload.data : []);
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const loadAvailable = useCallback(async (query: string) => {
        setAvailableLoading(true);
        try {
            const params = new URLSearchParams({ limit: '200' });
            if (query.trim()) params.set('search', query.trim());
            const res = await fetch(`/api/admin/torneo/tournaments/available?${params.toString()}`, {
                cache: 'no-store',
                credentials: 'include',
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudieron cargar los torneos');
            setAvailableTournaments(Array.isArray(payload.data) ? payload.data : []);
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        } finally {
            setAvailableLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!requestOpen) return;
        const handle = setTimeout(() => { void loadAvailable(availableSearch); }, 250);
        return () => clearTimeout(handle);
    }, [requestOpen, availableSearch, loadAvailable]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return tournaments;
        return tournaments.filter((tournament) =>
            tournament.name.toLowerCase().includes(q) ||
            (tournament.display_name || '').toLowerCase().includes(q) ||
            (tournament.slug || '').toLowerCase().includes(q) ||
            (tournament.sport_id || '').toLowerCase().includes(q) ||
            (tournament.country || '').toLowerCase().includes(q),
        );
    }, [tournaments, search]);

    const updateStatus = async (id: string, status: string) => {
        setErrorMsg(null);
        setOkMsg(null);
        try {
            const res = await fetch(`/api/admin/torneo/tournaments/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ status, is_visible: status === 'published' }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo actualizar');
            setTournaments((current) => current.map((tournament) => (tournament.id === id ? { ...tournament, ...payload.data } : tournament)));
            setOkMsg(status === 'published' ? 'Torneo publicado.' : 'Torneo despublicado.');
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Eliminar el torneo "${name}"? Esta accion no se puede deshacer.`)) return;
        setErrorMsg(null);
        setOkMsg(null);
        try {
            const res = await fetch(`/api/admin/torneo/tournaments/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo eliminar');
            setTournaments((current) => current.filter((tournament) => tournament.id !== id));
            setOkMsg('Torneo eliminado.');
            if (managingId === id) setManagingId(null);
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        }
    };

    const toggleManage = async (id: string) => {
        if (managingId === id) {
            setManagingId(null);
            return;
        }
        setManagingId(id);
        if (!participants[id]) {
            setParticipantLoading(id);
            try {
                const res = await fetch(`/api/admin/torneo/tournaments/${id}/participants`, {
                    cache: 'no-store',
                    credentials: 'include',
                });
                const payload = await res.json();
                if (res.ok) {
                    setParticipants((current) => ({ ...current, [id]: payload.data || [] }));
                }
            } finally {
                setParticipantLoading(null);
            }
        }
    };

    const removeParticipant = async (tournamentId: string, participantId: string) => {
        if (!confirm('Desvincular este club del torneo?')) return;
        try {
            const res = await fetch(
                `/api/admin/torneo/tournaments/${tournamentId}/participants?participantId=${encodeURIComponent(participantId)}`,
                { method: 'DELETE', credentials: 'include' },
            );
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo desvincular');
            setParticipants((current) => ({
                ...current,
                [tournamentId]: (current[tournamentId] || []).filter((participant) => participant.id !== participantId),
            }));
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        }
    };

    const openLinkClub = (tournamentId: string) => {
        setLinkingTournamentId(tournamentId);
        setSelectedClubId('');
    };

    const closeLinkClub = () => {
        setLinkingTournamentId(null);
        setSelectedClubId('');
    };

    const handleLinkClub = async () => {
        if (!linkingTournamentId || !selectedClubId) return;
        setLinking(true);
        try {
            const res = await fetch(`/api/admin/torneo/tournaments/${linkingTournamentId}/participants`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ club_id: selectedClubId }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo vincular');

            const partsRes = await fetch(`/api/admin/torneo/tournaments/${linkingTournamentId}/participants`, {
                cache: 'no-store',
                credentials: 'include',
            });
            const partsPayload = await partsRes.json();
            if (partsRes.ok) {
                setParticipants((current) => ({ ...current, [linkingTournamentId]: partsPayload.data || [] }));
            }
            closeLinkClub();
            setOkMsg('Club vinculado.');
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        } finally {
            setLinking(false);
        }
    };

    const openRequestModal = () => {
        setRequestOpen(true);
        setRequestedIds([]);
        setRequestNote('');
        setAvailableSearch('');
        setErrorMsg(null);
        setOkMsg(null);
    };

    const closeRequestModal = () => {
        setRequestOpen(false);
        setRequestedIds([]);
        setRequestNote('');
    };

    const toggleRequested = (tournamentId: string) => {
        setRequestedIds((current) => (
            current.includes(tournamentId)
                ? current.filter((id) => id !== tournamentId)
                : [...current, tournamentId]
        ));
    };

    const handleSendRequest = async () => {
        if (requestedIds.length === 0) return;
        setSendingRequest(true);
        setErrorMsg(null);
        setOkMsg(null);
        try {
            const res = await fetch('/api/admin/torneo/tournaments/access-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ tournamentIds: requestedIds, note: requestNote }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo enviar la solicitud');

            if (payload.delivery === 'mailto' && payload.mailtoUrl) {
                window.location.href = payload.mailtoUrl;
            }
            setOkMsg(payload.message || 'Solicitud enviada al Super Admin.');
            closeRequestModal();
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        } finally {
            setSendingRequest(false);
        }
    };

    return (
        <div>
            <header className={styles.pageHeader}>
                <div className={styles.eyebrow}>
                    <div className={styles.eyebrowDash} />
                    <span className={styles.eyebrowLabel}>Admin View</span>
                </div>
                <h1 className={styles.pageTitle}>Mis torneos</h1>
                <p className={styles.pageSubtitle}>
                    Torneos que creaste o sobre los que un Super Admin te concedió acceso. Podés
                    crear torneos nuevos (quedan a tu nombre) o solicitar acceso a otros.
                </p>
            </header>

            {errorMsg && <div className={`${styles.alert} ${styles.alertError}`}>{errorMsg}</div>}
            {okMsg && <div className={`${styles.alert} ${styles.alertSuccess}`}>{okMsg}</div>}

            <div className={styles.topActions}>
                <Link
                    href="/admin/torneo/torneos/crear"
                    prefetch={false}
                    className={styles.btnPrimaryCompact}
                    style={{ textDecoration: 'none' }}
                >
                    <Plus size={16} aria-hidden />
                    Crear torneo
                </Link>
                <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={openRequestModal}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                    <ShieldQuestion size={16} aria-hidden />
                    Solicitar acceso a otros torneos
                </button>
            </div>

            <div className={`${styles.cardStatic} ${styles.searchBar}`}>
                <div className={styles.searchWrap}>
                    <Search className={styles.searchIcon} aria-hidden />
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Buscar torneo por nombre, país o deporte..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                    />
                </div>
            </div>

            <div className={styles.listStack}>
                {loading ? (
                    <div className={`${styles.cardStatic} ${styles.empty}`}>Cargando...</div>
                ) : filtered.length === 0 ? (
                    <div className={`${styles.cardStatic} ${styles.empty}`}>
                        No tenés torneos accesibles todavía. Creá uno nuevo o solicitá acceso a torneos existentes.
                    </div>
                ) : (
                    filtered.map((tournament) => {
                        const isOpen = managingId === tournament.id;
                        const tournamentParticipants = participants[tournament.id] || [];
                        const isPublished = tournament.status === 'published' || tournament.status === 'active';
                        const tag = shortId(tournament.id, tournament.sport_id, tournament.season_id);

                        return (
                            <article key={tournament.id} className={`${styles.card} ${styles.listItem}`}>
                                <span className={styles.cardAccent} aria-hidden />
                                <div className={styles.listItemRow}>
                                    <div className={styles.listAvatar} style={{ background: tournament.primary_color || undefined }}>
                                        {tournament.logo_url ? (
                                            <Image src={tournament.logo_url} alt="" width={42} height={42} unoptimized />
                                        ) : <Trophy size={18} aria-hidden />}
                                    </div>
                                    <div className={styles.listItemBody}>
                                        <div className={styles.listItemMetaRow}>
                                            <span className={`${styles.badge} ${badgeClass(tournament.status, styles)}`}>
                                                {STATUS_LABELS[tournament.status || 'draft'] || tournament.status}
                                            </span>
                                            <span className={styles.idTag}>{tag}</span>
                                        </div>
                                        <h4 className={`${styles.listItemTitle} ${!isPublished ? styles.listItemTitleDim : ''}`}>
                                            {tournament.display_name || tournament.name}
                                        </h4>
                                        <div className={styles.metaRow}>
                                            <span>{tournament.sport_id || '-'}</span>
                                            <span className={styles.metaDot} />
                                            <span>{tournament.format || 'sin formato'}</span>
                                            <span className={styles.metaDot} />
                                            <span>{tournament.country || 'Sin pais'}</span>
                                        </div>
                                    </div>

                                    <div className={styles.actions}>
                                        <Link
                                            href={`/admin/entities/${tournament.id}/manage?type=tournament&tab=estructura`}
                                            prefetch={false}
                                            className={styles.btnGhost}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                                            title="Abrir el gestor: fases, zonas, reglas de puntos y fixture"
                                        >
                                            <SlidersHorizontal size={15} aria-hidden />
                                            Abrir en gestor
                                        </Link>
                                        <button
                                            type="button"
                                            className={styles.btnGhost}
                                            onClick={() => toggleManage(tournament.id)}
                                        >
                                            {isOpen ? 'Cerrar' : 'Clubes'}
                                        </button>
                                        <div className={styles.iconActions}>
                                            {isPublished ? (
                                                <button
                                                    type="button"
                                                    className={styles.iconBtn}
                                                    title="Despublicar"
                                                    onClick={() => updateStatus(tournament.id, 'draft')}
                                                >
                                                    <EyeOff size={18} aria-hidden />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={`${styles.iconBtn} ${styles.iconBtnAccent}`}
                                                    title="Publicar"
                                                    onClick={() => updateStatus(tournament.id, 'published')}
                                                >
                                                    <Eye size={18} aria-hidden />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                                title="Eliminar"
                                                onClick={() => handleDelete(tournament.id, tournament.display_name || tournament.name)}
                                            >
                                                <Trash2 size={18} aria-hidden />
                                            </button>
                                        </div>

                                        <div className={styles.overflowWrap}>
                                            <button
                                                type="button"
                                                className={styles.overflowBtn}
                                                aria-label="Más acciones"
                                                aria-haspopup="menu"
                                                aria-expanded={openMenuId === tournament.id}
                                                onClick={() => setOpenMenuId((current) => (current === tournament.id ? null : tournament.id))}
                                            >
                                                <MoreHorizontal size={18} aria-hidden />
                                            </button>
                                            {openMenuId === tournament.id && (
                                                <>
                                                    <div
                                                        className={styles.overflowScrim}
                                                        onClick={() => setOpenMenuId(null)}
                                                        aria-hidden
                                                    />
                                                    <div className={styles.overflowMenu} role="menu">
                                                        <button
                                                            type="button"
                                                            role="menuitem"
                                                            className={styles.overflowItem}
                                                            onClick={() => {
                                                                setOpenMenuId(null);
                                                                updateStatus(tournament.id, isPublished ? 'draft' : 'published');
                                                            }}
                                                        >
                                                            {isPublished ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
                                                            {isPublished ? 'Despublicar' : 'Publicar'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            role="menuitem"
                                                            className={`${styles.overflowItem} ${styles.overflowItemDanger}`}
                                                            onClick={() => {
                                                                setOpenMenuId(null);
                                                                handleDelete(tournament.id, tournament.display_name || tournament.name);
                                                            }}
                                                        >
                                                            <Trash2 size={15} aria-hidden />
                                                            Eliminar
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {isOpen && (
                                    participantLoading === tournament.id ? (
                                        <div className={styles.emptyManage}>
                                            <p className={styles.emptyMono}>Cargando clubes...</p>
                                        </div>
                                    ) : (
                                        <div className={styles.manageBlock}>
                                            <div className={styles.manageHeader}>
                                                <div>
                                                    <p className={styles.manageEyebrow}>Clubes participantes</p>
                                                    <p className={styles.manageHelp}>
                                                        {tournamentParticipants.length === 0
                                                            ? 'Sin clubes vinculados todavia.'
                                                            : 'Entidades vinculadas a este torneo.'}
                                                    </p>
                                                </div>
                                                <button type="button" className={styles.linkAccent} onClick={() => openLinkClub(tournament.id)}>
                                                    + Vincular club
                                                </button>
                                            </div>

                                            {tournamentParticipants.length > 0 && (
                                                <div className={styles.clubsGrid}>
                                                    {tournamentParticipants.map((participant) => {
                                                        const displayName = participant.clubs?.name || participant.name || participant.club_id || '-';
                                                        const initial = (displayName || '?').trim().charAt(0).toUpperCase();
                                                        return (
                                                            <div key={participant.id} className={styles.clubChip}>
                                                                <div className={styles.clubChipLeft}>
                                                                    <div className={styles.clubAvatar}>{initial}</div>
                                                                    <span className={styles.clubName}>{displayName}</span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    className={styles.clubChipRemove}
                                                                    onClick={() => removeParticipant(tournament.id, participant.id)}
                                                                >
                                                                    Quitar
                                                                </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )
                                )}
                            </article>
                        );
                    })
                )}
            </div>

            {linkingTournamentId && (
                <div
                    className={styles.modalBackdrop}
                    role="dialog"
                    aria-modal="true"
                    onClick={(event) => { if (event.target === event.currentTarget) closeLinkClub(); }}
                >
                    <div className={styles.modal}>
                        <h3 className={styles.modalTitle}>Vincular club a torneo</h3>
                        <p className={styles.modalDesc}>
                            Solo aparecen clubes accesibles para tu usuario.
                        </p>
                        <div className={styles.field}>
                            <label className={styles.fieldLabel} htmlFor="t-link-club">Club</label>
                            <select
                                id="t-link-club"
                                className={styles.select}
                                value={selectedClubId}
                                onChange={(event) => setSelectedClubId(event.target.value)}
                            >
                                <option value="">Seleccionar club...</option>
                                {clubs.map((club) => (
                                    <option key={club.id} value={club.id}>{club.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnGhost} onClick={closeLinkClub} disabled={linking}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className={styles.btnPrimaryCompact}
                                onClick={handleLinkClub}
                                disabled={!selectedClubId || linking}
                            >
                                {linking ? 'Vinculando...' : 'Vincular'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {requestOpen && (
                <div
                    className={styles.modalBackdrop}
                    role="dialog"
                    aria-modal="true"
                    onClick={(event) => { if (event.target === event.currentTarget) closeRequestModal(); }}
                >
                    <div className={styles.modal}>
                        <h3 className={styles.modalTitle}>Solicitar acceso a otros torneos</h3>
                        <p className={styles.modalDesc}>
                            Elegí uno o varios torneos existentes. Se enviará una solicitud al Super
                            Admin para que te conceda el acceso.
                        </p>

                        <div className={styles.searchWrap}>
                            <Search className={styles.searchIcon} aria-hidden />
                            <input
                                className={styles.searchInput}
                                placeholder="Buscar torneos por nombre o slug..."
                                value={availableSearch}
                                onChange={(event) => setAvailableSearch(event.target.value)}
                            />
                        </div>

                        <div className={styles.clubPickGrid}>
                            {availableLoading ? (
                                <div className={styles.emptyInline}>Cargando torneos...</div>
                            ) : availableTournaments.length === 0 ? (
                                <div className={styles.emptyInline}>No hay torneos disponibles para solicitar.</div>
                            ) : (
                                availableTournaments.map((tournament) => {
                                    const selected = requestedIds.includes(tournament.id);
                                    return (
                                        <button
                                            key={tournament.id}
                                            type="button"
                                            className={`${styles.clubPick} ${selected ? styles.clubPickSelected : ''}`}
                                            onClick={() => toggleRequested(tournament.id)}
                                        >
                                            <span className={styles.clubPickAvatar} style={{ background: tournament.primary_color || undefined }}>
                                                {tournament.logo_url ? (
                                                    <Image src={tournament.logo_url} alt="" width={34} height={34} unoptimized />
                                                ) : <Trophy size={16} aria-hidden />}
                                            </span>
                                            <span className={styles.clubPickBody}>
                                                <strong>{tournament.display_name || tournament.name}</strong>
                                                <small>{[tournament.sport_id, tournament.season_id, tournament.country].filter(Boolean).join(' · ') || 'Torneo'}</small>
                                            </span>
                                            <span className={styles.clubPickCheck}>{selected ? 'ON' : 'ADD'}</span>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        <div className={styles.field}>
                            <label className={styles.fieldLabel} htmlFor="t-request-note">Nota para el Super Admin (opcional)</label>
                            <textarea
                                id="t-request-note"
                                className={styles.textarea}
                                rows={3}
                                placeholder="Contá por qué necesitás acceso a estos torneos..."
                                value={requestNote}
                                onChange={(event) => setRequestNote(event.target.value)}
                            />
                        </div>

                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnGhost} onClick={closeRequestModal} disabled={sendingRequest}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className={styles.btnPrimaryCompact}
                                onClick={handleSendRequest}
                                disabled={requestedIds.length === 0 || sendingRequest}
                            >
                                {sendingRequest
                                    ? 'Enviando...'
                                    : `Solicitar acceso${requestedIds.length > 0 ? ` (${requestedIds.length})` : ''}`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
