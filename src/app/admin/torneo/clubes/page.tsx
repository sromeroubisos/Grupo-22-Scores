'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight, Plus, Search, ShieldQuestion } from 'lucide-react';
import styles from '../tournament-admin.module.css';
import { fetchScopedClubCatalog } from '@/lib/admin/scopedClubCatalog';

type Division = {
    id?: string;
    name: string;
    sport: string;
    gender: string;
    category: string;
    season: string;
    status: string;
};

type Club = {
    id: string;
    name: string;
    short_name: string | null;
    slug: string | null;
    sport: string | null;
    sport_id: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    is_visible: boolean | null;
    logo_url: string | null;
    primary_color: string | null;
    divisions?: Division[];
};

type AvailableClub = {
    id: string;
    name: string;
    short_name: string | null;
    slug: string | null;
    sport: string | null;
    sport_id: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
    logo_url: string | null;
    primary_color: string | null;
};

type Tournament = {
    id: string;
    name: string;
    display_name: string | null;
    season_id: string | null;
};

function getClubInitial(club: { short_name?: string | null; name?: string | null }) {
    return (club.short_name || club.name || '?')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase();
}

export default function TournamentAdminClubsPage() {
    const [clubs, setClubs] = useState<Club[]>([]);
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [okMsg, setOkMsg] = useState<string | null>(null);

    const [linkingClubId, setLinkingClubId] = useState<string | null>(null);
    const [selectedTournamentId, setSelectedTournamentId] = useState('');
    const [linking, setLinking] = useState(false);

    const [requestOpen, setRequestOpen] = useState(false);
    const [availableClubs, setAvailableClubs] = useState<AvailableClub[]>([]);
    const [availableLoading, setAvailableLoading] = useState(false);
    const [availableSearch, setAvailableSearch] = useState('');
    const [requestedIds, setRequestedIds] = useState<string[]>([]);
    const [requestNote, setRequestNote] = useState('');
    const [sendingRequest, setSendingRequest] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const [clubsResult, tournamentsRes] = await Promise.all([
                fetchScopedClubCatalog<Club>(),
                fetch('/api/admin/torneo/tournaments?limit=300', { cache: 'no-store', credentials: 'include' }),
            ]);

            const tournamentsPayload = await tournamentsRes.json();

            if (!clubsResult.ok) throw new Error(clubsResult.error || 'Error al cargar clubes');
            if (!tournamentsRes.ok) throw new Error(tournamentsPayload.error || 'Error al cargar torneos');

            setClubs(clubsResult.rows);
            setTournaments(Array.isArray(tournamentsPayload.data) ? tournamentsPayload.data : []);
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
            const res = await fetch(`/api/admin/torneo/clubs/available?${params.toString()}`, {
                cache: 'no-store',
                credentials: 'include',
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudieron cargar los clubes');
            setAvailableClubs(Array.isArray(payload.data) ? payload.data : []);
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
        if (!q) return clubs;
        return clubs.filter((club) =>
            club.name.toLowerCase().includes(q) ||
            (club.slug || '').toLowerCase().includes(q) ||
            (club.short_name || '').toLowerCase().includes(q) ||
            (club.city || '').toLowerCase().includes(q) ||
            (club.country || '').toLowerCase().includes(q),
        );
    }, [clubs, search]);

    const closeLinkModal = () => {
        setLinkingClubId(null);
        setSelectedTournamentId('');
    };

    const handleLink = async () => {
        if (!linkingClubId || !selectedTournamentId) return;
        setLinking(true);
        setErrorMsg(null);
        setOkMsg(null);
        try {
            const res = await fetch(`/api/admin/torneo/tournaments/${selectedTournamentId}/participants`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ club_id: linkingClubId }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo vincular');
            setOkMsg('Club vinculado al torneo.');
            closeLinkModal();
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

    const toggleRequested = (clubId: string) => {
        setRequestedIds((current) => (
            current.includes(clubId)
                ? current.filter((id) => id !== clubId)
                : [...current, clubId]
        ));
    };

    const handleSendRequest = async () => {
        if (requestedIds.length === 0) return;
        setSendingRequest(true);
        setErrorMsg(null);
        setOkMsg(null);
        try {
            const res = await fetch('/api/admin/torneo/clubs/access-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ clubIds: requestedIds, note: requestNote }),
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
                <h1 className={styles.pageTitle}>Mis clubes</h1>
                <p className={styles.pageSubtitle}>
                    Clubes que creaste o sobre los que un Super Admin te concedió acceso. Podés
                    crear clubes nuevos o solicitar acceso a otros que ya existen.
                </p>
            </header>

            {errorMsg && <div className={`${styles.alert} ${styles.alertError}`}>{errorMsg}</div>}
            {okMsg && <div className={`${styles.alert} ${styles.alertSuccess}`}>{okMsg}</div>}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
                <Link
                    href="/admin/torneo/clubes/crear"
                    prefetch={false}
                    className={styles.btnPrimaryCompact}
                    style={{ textDecoration: 'none' }}
                >
                    <Plus size={16} aria-hidden />
                    Crear club
                </Link>
                <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={openRequestModal}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
                >
                    <ShieldQuestion size={16} aria-hidden />
                    Solicitar acceso a otros clubes
                </button>
            </div>

            <div className={`${styles.cardStatic} ${styles.searchBar}`}>
                <div className={styles.searchWrap}>
                    <Search className={styles.searchIcon} aria-hidden />
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Buscar club por nombre, ciudad, país o slug..."
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
                        No tenés clubes accesibles todavía. Creá uno nuevo o solicitá acceso a clubes existentes.
                    </div>
                ) : (
                    filtered.map((club) => (
                        <article key={club.id} className={`${styles.card} ${styles.listItem} ${styles.clubCard}`}>
                            {/* Mobile: the whole card is a button to load the
                                roster the club fields for its tournaments. */}
                            <Link
                                href={`/admin/torneo/clubes/${encodeURIComponent(club.id)}/plantel`}
                                prefetch={false}
                                className={styles.clubCompactLink}
                                aria-label={`Armar el plantel de ${club.name}`}
                            >
                                <span
                                    className={styles.clubCompactAvatar}
                                    style={{ background: club.primary_color || undefined }}
                                >
                                    {club.logo_url ? (
                                        <Image src={club.logo_url} alt="" width={44} height={44} unoptimized />
                                    ) : getClubInitial(club)}
                                </span>
                                <span className={styles.clubCompactName}>{club.name}</span>
                                <ChevronRight className={styles.clubCompactChevron} size={20} aria-hidden />
                            </Link>

                            <div className={styles.listItemRow}>
                                <Link
                                    href={`/admin/torneo/clubes/${encodeURIComponent(club.id)}/plantel`}
                                    prefetch={false}
                                    className={styles.clubRowLink}
                                    aria-label={`Armar el plantel de ${club.name}`}
                                >
                                    <div className={styles.listAvatar} style={{ background: club.primary_color || undefined }}>
                                        {club.logo_url ? (
                                            <Image src={club.logo_url} alt="" width={42} height={42} unoptimized />
                                        ) : getClubInitial(club)}
                                    </div>
                                    <div className={styles.listItemBody}>
                                        <div className={styles.listItemMetaRow}>
                                            <span className={`${styles.badge} ${club.is_visible ? styles.badgePublicado : styles.badgeBorrador}`}>
                                                {club.is_visible ? 'Visible' : 'Borrador'}
                                            </span>
                                            <span className={styles.idTag}>{club.slug || club.id}</span>
                                        </div>
                                        <h4 className={styles.listItemTitle}>{club.name}</h4>
                                        <div className={styles.metaRow}>
                                            <span>{club.sport_id || club.sport || '-'}</span>
                                            <span className={styles.metaDot} />
                                            <span>{[club.city, club.region, club.country].filter(Boolean).join(' · ') || 'Sin ubicación'}</span>
                                            <span className={styles.metaDot} />
                                            <span>{club.divisions?.length || 0} planteles</span>
                                        </div>
                                    </div>
                                </Link>
                            </div>
                        </article>
                    ))
                )}
            </div>

            {linkingClubId && (
                <div
                    className={styles.modalBackdrop}
                    role="dialog"
                    aria-modal="true"
                    onClick={(event) => { if (event.target === event.currentTarget) closeLinkModal(); }}
                >
                    <div className={styles.modal}>
                        <h3 className={styles.modalTitle}>Vincular club a un torneo</h3>
                        <p className={styles.modalDesc}>
                            El club quedará como participante activo del torneo seleccionado.
                        </p>
                        <div className={styles.field}>
                            <label className={styles.fieldLabel} htmlFor="link-tournament">Torneo</label>
                            <select
                                id="link-tournament"
                                className={styles.select}
                                value={selectedTournamentId}
                                onChange={(event) => setSelectedTournamentId(event.target.value)}
                            >
                                <option value="">Seleccionar torneo...</option>
                                {tournaments.map((tournament) => (
                                    <option key={tournament.id} value={tournament.id}>
                                        {tournament.display_name || tournament.name}{tournament.season_id ? ` · ${tournament.season_id}` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnGhost} onClick={closeLinkModal} disabled={linking}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className={styles.btnPrimaryCompact}
                                onClick={handleLink}
                                disabled={!selectedTournamentId || linking}
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
                        <h3 className={styles.modalTitle}>Solicitar acceso a otros clubes</h3>
                        <p className={styles.modalDesc}>
                            Elegí uno o varios clubes existentes. Se enviará una solicitud al Super
                            Admin para que te conceda el acceso.
                        </p>

                        <div className={styles.searchWrap}>
                            <Search className={styles.searchIcon} aria-hidden />
                            <input
                                className={styles.searchInput}
                                placeholder="Buscar clubes por nombre, ciudad o slug..."
                                value={availableSearch}
                                onChange={(event) => setAvailableSearch(event.target.value)}
                            />
                        </div>

                        <div className={styles.clubPickGrid}>
                            {availableLoading ? (
                                <div className={styles.emptyInline}>Cargando clubes...</div>
                            ) : availableClubs.length === 0 ? (
                                <div className={styles.emptyInline}>No hay clubes disponibles para solicitar.</div>
                            ) : (
                                availableClubs.map((club) => {
                                    const selected = requestedIds.includes(club.id);
                                    return (
                                        <button
                                            key={club.id}
                                            type="button"
                                            className={`${styles.clubPick} ${selected ? styles.clubPickSelected : ''}`}
                                            onClick={() => toggleRequested(club.id)}
                                        >
                                            <span className={styles.clubPickAvatar} style={{ background: club.primary_color || undefined }}>
                                                {club.logo_url ? (
                                                    <Image src={club.logo_url} alt="" width={34} height={34} unoptimized />
                                                ) : getClubInitial(club)}
                                            </span>
                                            <span className={styles.clubPickBody}>
                                                <strong>{club.name}</strong>
                                                <small>{[club.city, club.country].filter(Boolean).join(' · ') || club.sport_id || club.sport || 'Club'}</small>
                                            </span>
                                            <span className={styles.clubPickCheck}>{selected ? 'ON' : 'ADD'}</span>
                                        </button>
                                    );
                                })
                            )}
                        </div>

                        <div className={styles.field}>
                            <label className={styles.fieldLabel} htmlFor="request-note">Nota para el Super Admin (opcional)</label>
                            <textarea
                                id="request-note"
                                className={styles.textarea}
                                rows={3}
                                placeholder="Contá por qué necesitás acceso a estos clubes..."
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
