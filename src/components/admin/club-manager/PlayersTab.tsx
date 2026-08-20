'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, UserRound, Users } from 'lucide-react';
import type { PersonWithRole } from '@/lib/services/personService';

interface PlayersTabProps {
    clubId: string;
    notify: (text: string, kind?: 'ok' | 'error') => void;
}

type RosterMembership = {
    id: string;
    player_id: string | null;
    jersey_number: number | null;
    position: string | null;
    role: string | null;
    status: string | null;
    player?: {
        id: string;
        first_name?: string | null;
        last_name?: string | null;
        full_name?: string | null;
        name?: string | null;
    } | null;
};

type SeasonRoster = {
    id: string;
    name: string | null;
    status: string | null;
    created_at: string | null;
    season?: {
        season_code?: string | null;
        name?: string | null;
        display_name?: string | null;
        is_active?: boolean | null;
        start_date?: string | null;
    } | null;
    tournament?: { name?: string | null; display_name?: string | null } | null;
    memberships?: RosterMembership[];
};

/** `current` es el plantel vivo del club; el resto son planteles cerrados de una temporada. */
const CURRENT = 'current';

type Division = {
    id: string;
    name: string;
    season?: string | null;
    category?: string | null;
    gender?: string | null;
    status?: string | null;
    players_count?: number;
    is_family_division?: boolean;
};

function personName(person: RosterMembership['player']) {
    if (!person) return 'Jugador sin ficha';
    const joined = [person.first_name, person.last_name].filter(Boolean).join(' ').trim();
    return person.full_name || joined || person.name || 'Jugador sin ficha';
}

function seasonYear(roster: SeasonRoster) {
    const code = roster.season?.season_code?.trim();
    if (code) return code;
    const fromName = roster.name?.match(/\b(19|20)\d{2}\b/)?.[0];
    return fromName || (roster.created_at ? roster.created_at.slice(0, 4) : '—');
}

function seasonLabel(roster: SeasonRoster) {
    const year = seasonYear(roster);
    const competition = roster.tournament?.display_name || roster.tournament?.name;
    return competition ? `${year} · ${competition}` : year;
}

export function PlayersTab({ clubId, notify }: PlayersTabProps) {
    const [seasonRosters, setSeasonRosters] = useState<SeasonRoster[]>([]);
    const [people, setPeople] = useState<PersonWithRole[] | null>(null);
    const [selected, setSelected] = useState<string>(CURRENT);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentBlocked, setCurrentBlocked] = useState<string | null>(null);

    const [divisions, setDivisions] = useState<Division[]>([]);
    const [newDivision, setNewDivision] = useState('');
    const [creatingDivision, setCreatingDivision] = useState(false);
    const [busyDivisionId, setBusyDivisionId] = useState<string | null>(null);

    const [adding, setAdding] = useState(false);
    const [newFirst, setNewFirst] = useState('');
    const [newLast, setNewLast] = useState('');
    const [newPosition, setNewPosition] = useState('');
    const [busyId, setBusyId] = useState<string | null>(null);

    const loadCurrent = useCallback(async () => {
        const response = await fetch(`/api/club-admin/roster?clubId=${encodeURIComponent(clubId)}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
            setCurrentBlocked(payload?.error || 'No se pudo cargar el plantel actual.');
            setPeople([]);
            return;
        }
        setCurrentBlocked(null);
        setPeople(Array.isArray(payload?.data) ? payload.data : []);
    }, [clubId]);

    const loadDivisions = useCallback(async () => {
        const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/divisions`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        setDivisions(response.ok && Array.isArray(payload?.data) ? payload.data : []);
    }, [clubId]);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            setLoading(true);
            setError(null);
            try {
                const [rostersResponse] = await Promise.all([
                    fetch(`/api/clubs/${encodeURIComponent(clubId)}/season-rosters?includeMemberships=true`, { cache: 'no-store' }),
                    loadCurrent(),
                    loadDivisions(),
                ]);
                const payload = await rostersResponse.json().catch(() => null);
                if (cancelled) return;
                if (!rostersResponse.ok) throw new Error(payload?.error || 'No se pudieron cargar las temporadas.');
                setSeasonRosters(Array.isArray(payload?.rosters) ? payload.rosters : []);
            } catch (caught) {
                if (!cancelled) setError(caught instanceof Error ? caught.message : 'No se pudieron cargar los jugadores.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [clubId, loadCurrent, loadDivisions]);

    const sortedRosters = useMemo(
        () => [...seasonRosters].sort((left, right) => seasonYear(right).localeCompare(seasonYear(left), 'es')),
        [seasonRosters],
    );

    const activeRoster = useMemo(
        () => sortedRosters.find((roster) => roster.id === selected) ?? null,
        [sortedRosters, selected],
    );

    const players = useMemo(
        () => (people ?? []).filter((person) => (person.role || 'player').toLowerCase() === 'player'),
        [people],
    );

    const createDivision = async () => {
        const name = newDivision.trim();
        if (!name) return;

        setCreatingDivision(true);
        try {
            const response = await fetch(`/api/clubs/${encodeURIComponent(clubId)}/divisions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name }),
            });
            const payload = await response.json().catch(() => null);
            if (response.status === 409) throw new Error('Ya existe un plantel con ese nombre.');
            if (!response.ok) throw new Error(payload?.error || 'No se pudo crear el plantel.');

            setNewDivision('');
            await loadDivisions();
            notify(`Plantel "${name}" creado`);
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo crear el plantel.', 'error');
        } finally {
            setCreatingDivision(false);
        }
    };

    const removeDivision = async (division: Division) => {
        if (!window.confirm(`¿Borrar el plantel ${division.name}?`)) return;

        setBusyDivisionId(division.id);
        try {
            const params = new URLSearchParams({ division_id: division.id });
            const response = await fetch(
                `/api/clubs/${encodeURIComponent(clubId)}/divisions?${params.toString()}`,
                { method: 'DELETE' },
            );
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo borrar el plantel.');
            await loadDivisions();
            notify(`Plantel "${division.name}" borrado`);
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo borrar el plantel.', 'error');
        } finally {
            setBusyDivisionId(null);
        }
    };

    const addPlayer = async () => {
        const first = newFirst.trim();
        const last = newLast.trim();
        if (!first || !last) return;

        setAdding(true);
        try {
            const response = await fetch('/api/club-admin/roster', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    clubId,
                    first_name: first,
                    last_name: last,
                    role: 'player',
                    position: newPosition.trim() || undefined,
                }),
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo agregar al jugador.');

            setNewFirst('');
            setNewLast('');
            setNewPosition('');
            await loadCurrent();
            notify(`${first} ${last} se sumó al plantel`);
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo agregar al jugador.', 'error');
        } finally {
            setAdding(false);
        }
    };

    const removePlayer = async (person: PersonWithRole) => {
        const label = person.full_name || `${person.first_name} ${person.last_name}`.trim();
        if (!window.confirm(`¿Sacar a ${label} del plantel?`)) return;

        setBusyId(person.id);
        try {
            const params = new URLSearchParams({ clubId, personId: person.id });
            if (person.division_id) params.set('divisionId', person.division_id);
            const response = await fetch(`/api/club-admin/roster?${params.toString()}`, { method: 'DELETE' });
            const payload = await response.json().catch(() => null);
            if (!response.ok) throw new Error(payload?.error || 'No se pudo sacar al jugador.');
            await loadCurrent();
            notify(`${label} salió del plantel`);
        } catch (caught) {
            notify(caught instanceof Error ? caught.message : 'No se pudo sacar al jugador.', 'error');
        } finally {
            setBusyId(null);
        }
    };

    if (loading) {
        return <div className="cm-loading">Cargando planteles...</div>;
    }

    return (
        <>
            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Plantel</h2>
                        <p>Elegí una temporada para ver quiénes la jugaron. El plantel actual es el único que se edita.</p>
                    </div>
                    <div className="cm-field" style={{ minWidth: 240 }}>
                        <label className="cm-label" htmlFor="cm-season">Temporada</label>
                        <select
                            id="cm-season"
                            className="cm-select"
                            value={selected}
                            onChange={(event) => setSelected(event.target.value)}
                        >
                            <option value={CURRENT}>Plantel actual</option>
                            {sortedRosters.map((roster) => (
                                <option key={roster.id} value={roster.id}>{seasonLabel(roster)}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {error && <div className="cm-alert" style={{ marginBottom: 16 }}>{error}</div>}

                {selected === CURRENT ? (
                    <>
                        {currentBlocked ? (
                            <div className="cm-notice">{currentBlocked}</div>
                        ) : (
                            <>
                                <div className="cm-search" style={{ marginBottom: 16 }}>
                                    <input
                                        className="cm-input"
                                        style={{ flex: '1 1 140px' }}
                                        placeholder="Nombre"
                                        value={newFirst}
                                        onChange={(event) => setNewFirst(event.target.value)}
                                        aria-label="Nombre del jugador"
                                    />
                                    <input
                                        className="cm-input"
                                        style={{ flex: '1 1 140px' }}
                                        placeholder="Apellido"
                                        value={newLast}
                                        onChange={(event) => setNewLast(event.target.value)}
                                        aria-label="Apellido del jugador"
                                    />
                                    <input
                                        className="cm-input"
                                        style={{ flex: '0 1 150px' }}
                                        placeholder="Puesto (opcional)"
                                        value={newPosition}
                                        onChange={(event) => setNewPosition(event.target.value)}
                                        aria-label="Puesto del jugador"
                                    />
                                    <button
                                        type="button"
                                        className="cm-btn cm-btn-primary"
                                        onClick={addPlayer}
                                        disabled={adding || !newFirst.trim() || !newLast.trim()}
                                        title={!newFirst.trim() || !newLast.trim() ? 'Escribí nombre y apellido para sumarlo.' : undefined}
                                    >
                                        {adding
                                            ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                            : <Plus size={14} aria-hidden="true" />}
                                        Sumar
                                    </button>
                                </div>

                                {players.length === 0 ? (
                                    <div className="cm-empty">
                                        <strong>El plantel está vacío</strong>
                                        Sumá jugadores con el formulario de arriba.
                                    </div>
                                ) : (
                                    <div className="cm-list">
                                        {players.map((person) => (
                                            <div key={person.id} className="cm-row">
                                                <span className="cm-avatar" aria-hidden="true">
                                                    {person.photo_url || person.avatar_url
                                                        ? <img src={person.photo_url || person.avatar_url} alt="" />
                                                        : <UserRound size={16} />}
                                                </span>
                                                <div className="cm-row-main">
                                                    <div className="cm-row-title">
                                                        {person.full_name || `${person.first_name} ${person.last_name}`.trim()}
                                                    </div>
                                                    <div className="cm-row-sub">
                                                        {[person.position, person.division_name].filter(Boolean).join(' · ') || 'Sin puesto asignado'}
                                                    </div>
                                                </div>
                                                <div className="cm-row-actions">
                                                    {person.status && person.status !== 'active' && (
                                                        <span className="cm-badge">{person.status}</span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        className="cm-btn cm-btn-danger cm-btn-icon"
                                                        onClick={() => removePlayer(person)}
                                                        disabled={busyId === person.id}
                                                        aria-label={`Sacar a ${person.full_name || person.first_name} del plantel`}
                                                    >
                                                        {busyId === person.id
                                                            ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                                            : <Trash2 size={14} aria-hidden="true" />}
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </>
                ) : (
                    <>
                        <div className="cm-notice" style={{ marginBottom: 16 }}>
                            {activeRoster?.name || 'Plantel'} — temporada cerrada, se muestra tal como quedó registrada.
                        </div>

                        {(activeRoster?.memberships ?? []).length === 0 ? (
                            <div className="cm-empty">
                                <strong>Sin jugadores cargados</strong>
                                Esta temporada quedó registrada sin plantel.
                            </div>
                        ) : (
                            <div className="cm-list">
                                {(activeRoster?.memberships ?? []).map((membership) => (
                                    <div key={membership.id} className="cm-row">
                                        <span className="cm-jersey" aria-hidden="true">
                                            {membership.jersey_number ?? '—'}
                                        </span>
                                        <div className="cm-row-main">
                                            <div className="cm-row-title">{personName(membership.player)}</div>
                                            <div className="cm-row-sub">
                                                {[membership.position, membership.role].filter(Boolean).join(' · ') || 'Sin puesto registrado'}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </section>

            {sortedRosters.length === 0 && selected === CURRENT && (
                <div className="cm-notice" style={{ marginTop: 16 }}>
                    Este club todavía no tiene planteles de temporadas anteriores. Aparecen solos cuando
                    se importa un torneo con su plantel.
                </div>
            )}

            <section className="cm-card">
                <div className="cm-card-head">
                    <div>
                        <h2>Planteles</h2>
                        <p>Las categorías del club: primera, intermedia, juveniles. Hace falta al menos una para poder publicarlo.</p>
                    </div>
                </div>

                <div className="cm-search" style={{ marginBottom: 16 }}>
                    <input
                        className="cm-input"
                        placeholder="Nombre del plantel — Primera, M19, Damas A"
                        value={newDivision}
                        onChange={(event) => setNewDivision(event.target.value)}
                        aria-label="Nombre del plantel nuevo"
                    />
                    <button
                        type="button"
                        className="cm-btn"
                        onClick={createDivision}
                        disabled={creatingDivision || !newDivision.trim()}
                        title={!newDivision.trim() ? 'Escribí el nombre del plantel para crearlo.' : undefined}
                    >
                        {creatingDivision
                            ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                            : <Plus size={14} aria-hidden="true" />}
                        Crear
                    </button>
                </div>

                {divisions.length === 0 ? (
                    <div className="cm-empty">
                        <strong>Sin planteles</strong>
                        Creá el primero para poder publicar el club.
                    </div>
                ) : (
                    <div className="cm-list">
                        {divisions.map((division) => (
                            <div key={division.id} className="cm-row">
                                <span className="cm-avatar" aria-hidden="true"><Users size={15} /></span>
                                <div className="cm-row-main">
                                    <div className="cm-row-title">{division.name}</div>
                                    <div className="cm-row-sub">
                                        {[
                                            division.season,
                                            division.gender,
                                            typeof division.players_count === 'number'
                                                ? `${division.players_count} jugador${division.players_count === 1 ? '' : 'es'}`
                                                : null,
                                        ].filter(Boolean).join(' · ') || 'Sin datos cargados'}
                                    </div>
                                </div>
                                <div className="cm-row-actions">
                                    {/* Los planteles compartidos no son de este club: su id es
                                        sintético (`family-division|…`) y borrarlo desde acá no
                                        resuelve a ninguna fila. Se administran desde la familia. */}
                                    {division.is_family_division ? (
                                        <span className="cm-badge" title="Se administra desde la familia de clubes">
                                            Compartido con la familia
                                        </span>
                                    ) : (
                                        <button
                                            type="button"
                                            className="cm-btn cm-btn-danger cm-btn-icon"
                                            onClick={() => removeDivision(division)}
                                            disabled={busyDivisionId === division.id}
                                            aria-label={`Borrar el plantel ${division.name}`}
                                        >
                                            {busyDivisionId === division.id
                                                ? <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                                                : <Trash2 size={14} aria-hidden="true" />}
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </>
    );
}
