'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../tournament-admin.module.css';

type Club = {
    id: string;
    name: string;
    slug: string | null;
    sport: string | null;
    sport_id: string | null;
    city: string | null;
    country: string | null;
    is_visible: boolean | null;
};

type Tournament = {
    id: string;
    name: string;
    display_name: string | null;
    season_id: string | null;
};

const SPORT_OPTIONS = [
    { value: 'rugby', label: 'Rugby' },
    { value: 'football', label: 'Fútbol' },
    { value: 'hockey', label: 'Hockey' },
    { value: 'basketball', label: 'Básquet' },
    { value: 'volleyball', label: 'Vóley' },
];

export default function TournamentAdminClubsPage() {
    const [clubs, setClubs] = useState<Club[]>([]);
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [okMsg, setOkMsg] = useState<string | null>(null);

    const [creating, setCreating] = useState(false);
    const [newClub, setNewClub] = useState({
        name: '',
        sport: 'rugby',
        city: '',
        country: '',
    });

    const [linkingClubId, setLinkingClubId] = useState<string | null>(null);
    const [selectedTournamentId, setSelectedTournamentId] = useState('');
    const [linking, setLinking] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const [clubsRes, tournamentsRes] = await Promise.all([
                fetch('/api/admin/torneo/clubs', { cache: 'no-store', credentials: 'include' }),
                fetch('/api/admin/torneo/tournaments?limit=300', { cache: 'no-store', credentials: 'include' }),
            ]);

            const clubsPayload = await clubsRes.json();
            const tournamentsPayload = await tournamentsRes.json();

            if (!clubsRes.ok) throw new Error(clubsPayload.error || 'Error al cargar clubes');
            if (!tournamentsRes.ok) throw new Error(tournamentsPayload.error || 'Error al cargar torneos');

            setClubs(Array.isArray(clubsPayload.data) ? clubsPayload.data : []);
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

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return clubs;
        return clubs.filter((c) =>
            c.name.toLowerCase().includes(q) ||
            (c.slug || '').toLowerCase().includes(q) ||
            (c.city || '').toLowerCase().includes(q) ||
            (c.country || '').toLowerCase().includes(q),
        );
    }, [clubs, search]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newClub.name.trim()) return;
        setCreating(true);
        setErrorMsg(null);
        setOkMsg(null);
        try {
            const res = await fetch('/api/admin/torneo/clubs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    name: newClub.name.trim(),
                    sport: newClub.sport,
                    city: newClub.city.trim() || null,
                    country: newClub.country.trim() || null,
                }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo crear el club');
            setOkMsg(`Club "${payload.data.name}" creado.`);
            setNewClub({ name: '', sport: newClub.sport, city: '', country: '' });
            await refresh();
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        } finally {
            setCreating(false);
        }
    };

    const openLinkModal = (clubId: string) => {
        setLinkingClubId(clubId);
        setSelectedTournamentId('');
        setErrorMsg(null);
    };

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

    return (
        <div>
            <header className={styles.pageHeader}>
                <div className={styles.eyebrow}>
                    <div className={styles.eyebrowDash} />
                    <span className={styles.eyebrowLabel}>Admin View</span>
                </div>
                <h1 className={styles.pageTitle}>Clubes</h1>
                <p className={styles.pageSubtitle}>
                    Crea clubes nuevos o vincula clubes existentes a un torneo. Solo ves los clubes
                    que creaste o que el Super Admin te concedió.
                </p>
            </header>

            {errorMsg && <div className={`${styles.alert} ${styles.alertError}`}>{errorMsg}</div>}
            {okMsg && <div className={`${styles.alert} ${styles.alertSuccess}`}>{okMsg}</div>}

            <div className={styles.layoutGrid}>
                <section className={styles.colLeft}>
                    <div className={`${styles.cardStatic} ${styles.formCard}`}>
                        <p className={styles.formEyebrow}>Nuevo registro</p>
                        <form className={styles.form} onSubmit={handleCreate}>
                            <div className={styles.field}>
                                <label className={styles.fieldLabel} htmlFor="club-name">Nombre del club</label>
                                <input
                                    id="club-name"
                                    className={styles.input}
                                    placeholder="Ej: Club Atlético Nórdico"
                                    value={newClub.name}
                                    onChange={(e) => setNewClub((s) => ({ ...s, name: e.target.value }))}
                                    required
                                    minLength={2}
                                />
                            </div>

                            <div className={styles.formGrid2}>
                                <div className={styles.field}>
                                    <label className={styles.fieldLabel} htmlFor="club-sport">Deporte</label>
                                    <select
                                        id="club-sport"
                                        className={styles.select}
                                        value={newClub.sport}
                                        onChange={(e) => setNewClub((s) => ({ ...s, sport: e.target.value }))}
                                    >
                                        {SPORT_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.fieldLabel} htmlFor="club-country">País</label>
                                    <input
                                        id="club-country"
                                        className={styles.input}
                                        placeholder="Argentina"
                                        value={newClub.country}
                                        onChange={(e) => setNewClub((s) => ({ ...s, country: e.target.value }))}
                                    />
                                </div>
                            </div>

                            <div className={styles.field}>
                                <label className={styles.fieldLabel} htmlFor="club-city">Ciudad</label>
                                <input
                                    id="club-city"
                                    className={styles.input}
                                    placeholder="Buenos Aires"
                                    value={newClub.city}
                                    onChange={(e) => setNewClub((s) => ({ ...s, city: e.target.value }))}
                                />
                            </div>

                            <button type="submit" className={styles.btnPrimary} disabled={creating}>
                                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                </svg>
                                {creating ? 'Creando…' : 'Crear club'}
                            </button>
                        </form>
                    </div>
                </section>

                <section className={styles.colRight}>
                    <div className={`${styles.cardStatic} ${styles.searchBar}`}>
                        <div className={styles.searchWrap}>
                            <svg className={styles.searchIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            <input
                                type="text"
                                className={styles.searchInput}
                                placeholder="Buscar club por nombre, ciudad o país…"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className={styles.listStack}>
                        {loading ? (
                            <div className={`${styles.cardStatic} ${styles.empty}`}>Cargando…</div>
                        ) : filtered.length === 0 ? (
                            <div className={`${styles.cardStatic} ${styles.empty}`}>
                                No tenés clubes accesibles todavía.
                            </div>
                        ) : (
                            filtered.map((club) => (
                                <article key={club.id} className={`${styles.card} ${styles.listItem}`}>
                                    <div className={styles.listItemRow}>
                                        <div className={styles.listItemBody}>
                                            <div className={styles.listItemMetaRow}>
                                                <span className={`${styles.badge} ${club.is_visible ? styles.badgePublicado : styles.badgeBorrador}`}>
                                                    {club.is_visible ? 'Visible' : 'Oculto'}
                                                </span>
                                                <span className={styles.idTag}>{club.id}</span>
                                            </div>
                                            <h4 className={styles.listItemTitle}>{club.name}</h4>
                                            <div className={styles.metaRow}>
                                                <span>{club.sport_id || club.sport || '—'}</span>
                                                <span className={styles.metaDot} />
                                                <span>{club.city || 'Sin ciudad'}</span>
                                                <span className={styles.metaDot} />
                                                <span>{club.country || 'Sin país'}</span>
                                            </div>
                                        </div>
                                        <div className={styles.actions}>
                                            <button
                                                type="button"
                                                className={styles.btnGhost}
                                                onClick={() => openLinkModal(club.id)}
                                            >
                                                Vincular a torneo
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))
                        )}
                    </div>
                </section>
            </div>

            {linkingClubId && (
                <div
                    className={styles.modalBackdrop}
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => { if (e.target === e.currentTarget) closeLinkModal(); }}
                >
                    <div className={styles.modal}>
                        <h3 className={styles.modalTitle}>Vincular club a un torneo</h3>
                        <p className={styles.modalDesc}>
                            El club aparecerá como participante del torneo seleccionado.
                        </p>
                        <div className={styles.field}>
                            <label className={styles.fieldLabel} htmlFor="link-tournament">Torneo</label>
                            <select
                                id="link-tournament"
                                className={styles.select}
                                value={selectedTournamentId}
                                onChange={(e) => setSelectedTournamentId(e.target.value)}
                            >
                                <option value="">Seleccionar torneo…</option>
                                {tournaments.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.display_name || t.name}{t.season_id ? ` · ${t.season_id}` : ''}
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
                                className={styles.btnPrimary}
                                style={{ width: 'auto', margin: 0, padding: '12px 18px' }}
                                onClick={handleLink}
                                disabled={!selectedTournamentId || linking}
                            >
                                {linking ? 'Vinculando…' : 'Vincular'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
