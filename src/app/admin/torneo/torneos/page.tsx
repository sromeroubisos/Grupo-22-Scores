'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from '../tournament-admin.module.css';

type Tournament = {
    id: string;
    name: string;
    display_name: string | null;
    slug: string | null;
    sport_id: string | null;
    season_id: string | null;
    country: string | null;
    status: string | null;
    is_visible: boolean | null;
    is_popular: boolean | null;
    union_id: string | null;
    created_at: string | null;
};

type Participant = {
    id: string;
    club_id: string | null;
    name: string | null;
    status: string | null;
    clubs?: { id: string; name: string; slug: string | null; logo_url: string | null } | null;
};

const SPORT_OPTIONS = [
    { value: 'football', label: 'Fútbol' },
    { value: 'rugby', label: 'Rugby' },
    { value: 'hockey', label: 'Hockey' },
    { value: 'basketball', label: 'Básquet' },
    { value: 'volleyball', label: 'Vóley' },
];

const SEASONS = ['2026', '2025', '2024'];

const STATUS_LABELS: Record<string, string> = {
    draft: 'Borrador',
    published: 'Publicado',
    archived: 'Archivado',
};

function badgeClass(status: string | null, styles: Record<string, string>) {
    const key = status || 'draft';
    if (key === 'published') return styles.badgePublicado;
    if (key === 'archived') return styles.badgeArchivado;
    return styles.badgeBorrador;
}

function shortId(id: string, sport: string | null, season: string | null): string {
    const t = (season || '').slice(-4) || '----';
    const s = (sport || 'GEN').slice(0, 4).toUpperCase();
    const tail = id.replace(/-/g, '').slice(-4).toUpperCase() || 'XXXX';
    return `T${t}-${s}-${tail}`;
}

export default function TournamentAdminTournamentsPage() {
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [okMsg, setOkMsg] = useState<string | null>(null);

    const [creating, setCreating] = useState(false);
    const [newT, setNewT] = useState({
        name: '',
        sport_id: 'football',
        season_id: '2026',
        country: 'Argentina',
        status: 'draft',
    });

    const [managingId, setManagingId] = useState<string | null>(null);
    const [participants, setParticipants] = useState<Record<string, Participant[]>>({});
    const [participantLoading, setParticipantLoading] = useState<string | null>(null);

    const [linkingTournamentId, setLinkingTournamentId] = useState<string | null>(null);
    const [accessibleClubs, setAccessibleClubs] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedClubId, setSelectedClubId] = useState('');
    const [linking, setLinking] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const res = await fetch('/api/admin/torneo/tournaments?limit=300', {
                cache: 'no-store',
                credentials: 'include',
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'Error al cargar torneos');
            setTournaments(Array.isArray(payload.data) ? payload.data : []);
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
        if (!q) return tournaments;
        return tournaments.filter((t) =>
            t.name.toLowerCase().includes(q) ||
            (t.display_name || '').toLowerCase().includes(q) ||
            (t.slug || '').toLowerCase().includes(q) ||
            (t.sport_id || '').toLowerCase().includes(q),
        );
    }, [tournaments, search]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newT.name.trim().length < 3) {
            setErrorMsg('El nombre del torneo debe tener al menos 3 caracteres');
            return;
        }
        setCreating(true);
        setErrorMsg(null);
        setOkMsg(null);
        try {
            const res = await fetch('/api/admin/torneo/tournaments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    name: newT.name.trim(),
                    sport_id: newT.sport_id,
                    season_id: newT.season_id,
                    country: newT.country.trim() || null,
                    status: newT.status,
                }),
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo crear el torneo');
            setOkMsg(`Torneo "${payload.data.name}" creado.`);
            setNewT({ ...newT, name: '' });
            await refresh();
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        } finally {
            setCreating(false);
        }
    };

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
            setTournaments((current) => current.map((t) => (t.id === id ? { ...t, ...payload.data } : t)));
            setOkMsg(status === 'published' ? 'Torneo publicado.' : 'Torneo despublicado.');
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        }
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`¿Eliminar el torneo "${name}"? Esta acción no se puede deshacer.`)) return;
        setErrorMsg(null);
        setOkMsg(null);
        try {
            const res = await fetch(`/api/admin/torneo/tournaments/${id}`, {
                method: 'DELETE',
                credentials: 'include',
            });
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo eliminar');
            setTournaments((current) => current.filter((t) => t.id !== id));
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
                    setParticipants((curr) => ({ ...curr, [id]: payload.data || [] }));
                }
            } finally {
                setParticipantLoading(null);
            }
        }
    };

    const removeParticipant = async (tournamentId: string, participantId: string) => {
        if (!confirm('¿Desvincular este club del torneo?')) return;
        try {
            const res = await fetch(
                `/api/admin/torneo/tournaments/${tournamentId}/participants?participantId=${encodeURIComponent(participantId)}`,
                { method: 'DELETE', credentials: 'include' },
            );
            const payload = await res.json();
            if (!res.ok) throw new Error(payload.error || 'No se pudo desvincular');
            setParticipants((curr) => ({
                ...curr,
                [tournamentId]: (curr[tournamentId] || []).filter((p) => p.id !== participantId),
            }));
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : 'Error inesperado');
        }
    };

    const openLinkClub = async (tournamentId: string) => {
        setLinkingTournamentId(tournamentId);
        setSelectedClubId('');
        try {
            const res = await fetch('/api/admin/torneo/clubs?limit=500', {
                cache: 'no-store',
                credentials: 'include',
            });
            const payload = await res.json();
            if (res.ok && Array.isArray(payload.data)) {
                setAccessibleClubs(payload.data.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name })));
            }
        } catch {
            setAccessibleClubs([]);
        }
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

            // Reload participants of the modified tournament
            const partsRes = await fetch(`/api/admin/torneo/tournaments/${linkingTournamentId}/participants`, {
                cache: 'no-store',
                credentials: 'include',
            });
            const partsPayload = await partsRes.json();
            if (partsRes.ok) {
                setParticipants((curr) => ({ ...curr, [linkingTournamentId]: partsPayload.data || [] }));
            }
            closeLinkClub();
            setOkMsg('Club vinculado.');
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
                <h1 className={styles.pageTitle}>Torneos</h1>
                <p className={styles.pageSubtitle}>
                    Centro de mando operativo. Crea nuevas competiciones, gestiona el estado de
                    publicación y audita los clubes participantes vinculados.
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
                                <label className={styles.fieldLabel} htmlFor="t-name">Nombre del torneo</label>
                                <input
                                    id="t-name"
                                    className={styles.input}
                                    placeholder="Ej: Apertura Regional"
                                    value={newT.name}
                                    onChange={(e) => setNewT((s) => ({ ...s, name: e.target.value }))}
                                    required
                                    minLength={3}
                                />
                            </div>

                            <div className={styles.formGrid2}>
                                <div className={styles.field}>
                                    <label className={styles.fieldLabel} htmlFor="t-sport">Deporte</label>
                                    <select
                                        id="t-sport"
                                        className={styles.select}
                                        value={newT.sport_id}
                                        onChange={(e) => setNewT((s) => ({ ...s, sport_id: e.target.value }))}
                                    >
                                        {SPORT_OPTIONS.map((opt) => (
                                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.fieldLabel} htmlFor="t-season">Temporada</label>
                                    <select
                                        id="t-season"
                                        className={styles.select}
                                        value={newT.season_id}
                                        onChange={(e) => setNewT((s) => ({ ...s, season_id: e.target.value }))}
                                    >
                                        {SEASONS.map((season) => (
                                            <option key={season} value={season}>{season}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className={styles.field}>
                                <label className={styles.fieldLabel} htmlFor="t-country">País</label>
                                <input
                                    id="t-country"
                                    className={styles.input}
                                    placeholder="Argentina"
                                    value={newT.country}
                                    onChange={(e) => setNewT((s) => ({ ...s, country: e.target.value }))}
                                />
                            </div>

                            <div className={styles.field}>
                                <span className={styles.fieldLabel}>Estado inicial</span>
                                <div className={styles.radioGroup}>
                                    <label className={styles.radioLabel}>
                                        <input
                                            type="radio"
                                            name="status"
                                            className={styles.radioInput}
                                            checked={newT.status === 'draft'}
                                            onChange={() => setNewT((s) => ({ ...s, status: 'draft' }))}
                                        />
                                        <span className={styles.radioBox} aria-hidden />
                                        <span className={styles.radioText}>Borrador</span>
                                    </label>
                                    <label className={styles.radioLabel}>
                                        <input
                                            type="radio"
                                            name="status"
                                            className={styles.radioInput}
                                            checked={newT.status === 'published'}
                                            onChange={() => setNewT((s) => ({ ...s, status: 'published' }))}
                                        />
                                        <span className={styles.radioBox} aria-hidden />
                                        <span className={styles.radioText}>Publicado</span>
                                    </label>
                                </div>
                            </div>

                            <button type="submit" className={styles.btnPrimary} disabled={creating}>
                                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
                                </svg>
                                {creating ? 'Creando…' : 'Crear torneo'}
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
                                placeholder="Buscar torneo por nombre o deporte…"
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
                                No tenés torneos accesibles todavía.
                            </div>
                        ) : (
                            filtered.map((t) => {
                                const isOpen = managingId === t.id;
                                const tParticipants = participants[t.id] || [];
                                const isPublished = t.status === 'published';
                                const tag = shortId(t.id, t.sport_id, t.season_id);

                                return (
                                    <article key={t.id} className={`${styles.card} ${styles.listItem}`}>
                                        <div className={styles.listItemRow}>
                                            <div className={styles.listItemBody}>
                                                <div className={styles.listItemMetaRow}>
                                                    <span className={`${styles.badge} ${badgeClass(t.status, styles)}`}>
                                                        {STATUS_LABELS[t.status || 'draft'] || t.status}
                                                    </span>
                                                    <span className={styles.idTag}>{tag}</span>
                                                </div>
                                                <h4 className={`${styles.listItemTitle} ${!isPublished ? styles.listItemTitleDim : ''}`}>
                                                    {t.display_name || t.name}
                                                </h4>
                                                <div className={styles.metaRow}>
                                                    <span>{t.sport_id || '—'}</span>
                                                    <span className={styles.metaDot} />
                                                    <span>Temporada {t.season_id || '—'}</span>
                                                    <span className={styles.metaDot} />
                                                    <span>{t.country || 'Sin país'}</span>
                                                </div>
                                            </div>

                                            <div className={styles.actions}>
                                                <button
                                                    type="button"
                                                    className={styles.btnGhost}
                                                    onClick={() => toggleManage(t.id)}
                                                >
                                                    {isOpen ? 'Cerrar' : 'Gestionar'}
                                                </button>
                                                {isPublished ? (
                                                    <button
                                                        type="button"
                                                        className={styles.iconBtn}
                                                        title="Despublicar"
                                                        onClick={() => updateStatus(t.id, 'draft')}
                                                    >
                                                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                                                        </svg>
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        className={`${styles.iconBtn} ${styles.iconBtnAccent}`}
                                                        title="Publicar"
                                                        onClick={() => updateStatus(t.id, 'published')}
                                                    >
                                                        <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                        </svg>
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                                    title="Eliminar"
                                                    onClick={() => handleDelete(t.id, t.display_name || t.name)}
                                                >
                                                    <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </div>

                                        {isOpen && (
                                            participantLoading === t.id ? (
                                                <div className={styles.emptyManage}>
                                                    <p className={styles.emptyMono}>Cargando clubes…</p>
                                                </div>
                                            ) : tParticipants.length === 0 ? (
                                                <div className={styles.manageBlock}>
                                                    <div className={styles.manageHeader}>
                                                        <div>
                                                            <p className={styles.manageEyebrow}>Clubes Participantes</p>
                                                            <p className={styles.manageHelp}>Sin clubes vinculados todavía.</p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className={styles.linkAccent}
                                                            onClick={() => openLinkClub(t.id)}
                                                        >
                                                            + Vincular nuevo club
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className={styles.manageBlock}>
                                                    <div className={styles.manageHeader}>
                                                        <div>
                                                            <p className={styles.manageEyebrow}>Clubes Participantes</p>
                                                            <p className={styles.manageHelp}>
                                                                Entidades vinculadas a este torneo específico.
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            className={styles.linkAccent}
                                                            onClick={() => openLinkClub(t.id)}
                                                        >
                                                            + Vincular nuevo club
                                                        </button>
                                                    </div>

                                                    <div className={styles.clubsGrid}>
                                                        {tParticipants.map((p) => {
                                                            const displayName = p.clubs?.name || p.name || p.club_id || '—';
                                                            const initial = (displayName || '?').trim().charAt(0).toUpperCase();
                                                            return (
                                                                <div key={p.id} className={styles.clubChip}>
                                                                    <div className={styles.clubChipLeft}>
                                                                        <div className={styles.clubAvatar}>{initial}</div>
                                                                        <span className={styles.clubName}>{displayName}</span>
                                                                    </div>
                                                                    <button
                                                                        type="button"
                                                                        className={styles.clubChipRemove}
                                                                        onClick={() => removeParticipant(t.id, p.id)}
                                                                    >
                                                                        Quitar
                                                                    </button>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )
                                        )}
                                    </article>
                                );
                            })
                        )}
                    </div>
                </section>
            </div>

            {linkingTournamentId && (
                <div
                    className={styles.modalBackdrop}
                    role="dialog"
                    aria-modal="true"
                    onClick={(e) => { if (e.target === e.currentTarget) closeLinkClub(); }}
                >
                    <div className={styles.modal}>
                        <h3 className={styles.modalTitle}>Vincular club a torneo</h3>
                        <p className={styles.modalDesc}>
                            Solo aparecen los clubes a los que tenés acceso.
                        </p>
                        <div className={styles.field}>
                            <label className={styles.fieldLabel} htmlFor="t-link-club">Club</label>
                            <select
                                id="t-link-club"
                                className={styles.select}
                                value={selectedClubId}
                                onChange={(e) => setSelectedClubId(e.target.value)}
                            >
                                <option value="">Seleccionar club…</option>
                                {accessibleClubs.map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.modalActions}>
                            <button type="button" className={styles.btnGhost} onClick={closeLinkClub} disabled={linking}>
                                Cancelar
                            </button>
                            <button
                                type="button"
                                className={styles.btnPrimary}
                                style={{ width: 'auto', margin: 0, padding: '12px 18px' }}
                                onClick={handleLinkClub}
                                disabled={!selectedClubId || linking}
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
