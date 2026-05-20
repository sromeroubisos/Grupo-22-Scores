'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarPlus, ArrowRight, Users } from 'lucide-react';
import styles from '../../tournament-admin.module.css';
import p from '../partidos.module.css';

type TournamentOpt = { id: string; name: string; display_name: string | null };

type RoundOpt = { id: string; name: string };
type PhaseOpt = { id: string; name: string; phaseType: string; rounds: RoundOpt[] };
type ParticipantOpt = { clubId: string; name: string };

type Fixture = {
    phases?: Array<{
        id: string;
        name: string;
        phaseType: string;
        rounds?: Array<{ id: string; name: string }>;
    }>;
    participants?: Array<{ clubId: string | null; name: string }>;
};

const PLAYOFF_PHASE_TYPES = new Set(['playoff', 'knockout']);

function CrearPartidoForm() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const presetTournamentId = searchParams.get('tournamentId') ?? '';

    const [tournaments, setTournaments] = useState<TournamentOpt[]>([]);
    const [tournamentId, setTournamentId] = useState(presetTournamentId);
    const [phases, setPhases] = useState<PhaseOpt[]>([]);
    const [participants, setParticipants] = useState<ParticipantOpt[]>([]);

    const [phaseId, setPhaseId] = useState('');
    const [roundId, setRoundId] = useState('');
    const [homeClubId, setHomeClubId] = useState('');
    const [awayClubId, setAwayClubId] = useState('');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('15:00');
    const [venue, setVenue] = useState('');
    const [status, setStatus] = useState<'scheduled'>('scheduled');

    const [loadingFixture, setLoadingFixture] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await fetch('/api/admin/torneo/tournaments', {
                    cache: 'no-store',
                    credentials: 'include',
                });
                const payload = await res.json();
                const list: TournamentOpt[] = Array.isArray(payload.data) ? payload.data : [];
                setTournaments(list);
                if (!presetTournamentId && list.length === 1) {
                    setTournamentId(list[0].id);
                }
            } catch {
                setError('No se pudieron cargar los torneos.');
            }
        })();
    }, [presetTournamentId]);

    const loadFixture = useCallback(async (tid: string) => {
        setLoadingFixture(true);
        setPhases([]);
        setParticipants([]);
        setPhaseId('');
        setRoundId('');
        setHomeClubId('');
        setAwayClubId('');
        try {
            const res = await fetch(`/api/tournaments/${tid}/fixture`, {
                cache: 'no-store',
                credentials: 'include',
            });
            const fixture: Fixture = await res.json();
            if (!res.ok) throw new Error('No se pudo cargar la estructura del torneo.');
            const ph: PhaseOpt[] = (fixture.phases ?? []).map((x) => ({
                id: x.id,
                name: x.name,
                phaseType: x.phaseType,
                rounds: (x.rounds ?? []).map((r) => ({ id: r.id, name: r.name })),
            }));
            setPhases(ph);
            setParticipants(
                (fixture.participants ?? [])
                    .filter((x): x is { clubId: string; name: string } => Boolean(x.clubId))
                    .map((x) => ({ clubId: x.clubId, name: x.name })),
            );
            if (ph.length === 1) setPhaseId(ph[0].id);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo cargar el torneo.');
        } finally {
            setLoadingFixture(false);
        }
    }, []);

    useEffect(() => {
        if (tournamentId) {
            setError(null);
            loadFixture(tournamentId);
        }
    }, [tournamentId, loadFixture]);

    const selectedPhase = useMemo(
        () => phases.find((x) => x.id === phaseId) ?? null,
        [phases, phaseId],
    );
    const rounds = selectedPhase?.rounds ?? [];
    const roundRequired = selectedPhase
        ? PLAYOFF_PHASE_TYPES.has(selectedPhase.phaseType)
        : false;

    const canSubmit =
        !!tournamentId &&
        !!phaseId &&
        !!homeClubId &&
        !!awayClubId &&
        homeClubId !== awayClubId &&
        !!date &&
        !!time &&
        (!roundRequired || !!roundId) &&
        !submitting;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        setError(null);
        try {
            const res = await fetch('/api/admin/torneo/matches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    tournamentId,
                    phaseId,
                    roundId: roundId || null,
                    homeClubId,
                    awayClubId,
                    dateTime: `${date}T${time}:00`,
                    venue: venue.trim(),
                    status,
                }),
            });
            const payload = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(payload?.error || 'No se pudo crear el partido.');
            }
            router.push('/admin/torneo/partidos');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo crear el partido.');
            setSubmitting(false);
        }
    }

    return (
        <div>
            <div className={styles.pageHeader}>
                <div className={styles.eyebrow}>
                    <div className={styles.eyebrowDash} />
                    <span className={styles.eyebrowLabel}>Operación · Crear</span>
                </div>
                <h1 className={styles.pageTitle}>Crear partido</h1>
            </div>

            {error && <div className={p.formError}>{error}</div>}

            <form className={p.formWrap} onSubmit={handleSubmit}>
                {/* Tournament / phase / round */}
                <div className={p.formCard}>
                    <div className={`${p.formGrid} ${p.formGrid3}`}>
                        <div className={p.field}>
                            <label className={p.label} htmlFor="torneo">Torneo</label>
                            <select
                                id="torneo"
                                className={p.select}
                                value={tournamentId}
                                onChange={(e) => setTournamentId(e.target.value)}
                            >
                                <option value="">Seleccionar torneo…</option>
                                {tournaments.map((t) => (
                                    <option key={t.id} value={t.id}>
                                        {t.display_name || t.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className={p.field}>
                            <label className={p.label} htmlFor="fase">Fase</label>
                            <select
                                id="fase"
                                className={p.select}
                                value={phaseId}
                                disabled={!tournamentId || loadingFixture || phases.length === 0}
                                onChange={(e) => {
                                    setPhaseId(e.target.value);
                                    setRoundId('');
                                }}
                            >
                                <option value="">
                                    {loadingFixture ? 'Cargando…' : 'Seleccionar fase…'}
                                </option>
                                {phases.map((ph) => (
                                    <option key={ph.id} value={ph.id}>{ph.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className={p.field}>
                            <label className={p.label} htmlFor="jornada">
                                Jornada {roundRequired ? '(requerida)' : '(opcional)'}
                            </label>
                            <select
                                id="jornada"
                                className={p.select}
                                value={roundId}
                                disabled={!phaseId || rounds.length === 0}
                                onChange={(e) => setRoundId(e.target.value)}
                            >
                                <option value="">
                                    {rounds.length === 0 ? 'Sin jornadas' : 'Sin jornada específica'}
                                </option>
                                {rounds.map((r) => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Teams */}
                <div className={`${p.formCard} ${p.formCardAccent}`}>
                    <h3 className={p.formSectionTitle}>
                        <Users size={14} aria-hidden />
                        Equipos
                    </h3>
                    <div className={p.teamsRow}>
                        <div className={p.field}>
                            <label className={p.label} htmlFor="local">Local</label>
                            <select
                                id="local"
                                className={p.select}
                                value={homeClubId}
                                disabled={participants.length === 0}
                                onChange={(e) => setHomeClubId(e.target.value)}
                            >
                                <option value="">Seleccionar equipo…</option>
                                {participants.map((c) => (
                                    <option
                                        key={c.clubId}
                                        value={c.clubId}
                                        disabled={c.clubId === awayClubId}
                                    >
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <span className={p.teamsVs}>VS</span>
                        <div className={p.field}>
                            <label className={p.label} htmlFor="visitante">Visitante</label>
                            <select
                                id="visitante"
                                className={p.select}
                                value={awayClubId}
                                disabled={participants.length === 0}
                                onChange={(e) => setAwayClubId(e.target.value)}
                            >
                                <option value="">Seleccionar equipo…</option>
                                {participants.map((c) => (
                                    <option
                                        key={c.clubId}
                                        value={c.clubId}
                                        disabled={c.clubId === homeClubId}
                                    >
                                        {c.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Schedule & venue */}
                <div className={p.formCard}>
                    <div className={`${p.formGrid} ${p.formGrid2}`}>
                        <div className={`${p.formGrid} ${p.formGrid2}`}>
                            <div className={p.field}>
                                <label className={p.label} htmlFor="fecha">Fecha</label>
                                <input
                                    id="fecha"
                                    type="date"
                                    className={p.input}
                                    value={date}
                                    onChange={(e) => setDate(e.target.value)}
                                />
                            </div>
                            <div className={p.field}>
                                <label className={p.label} htmlFor="hora">Hora</label>
                                <input
                                    id="hora"
                                    type="time"
                                    className={p.input}
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className={p.field}>
                            <label className={p.label} htmlFor="venue">Lugar / Cancha</label>
                            <input
                                id="venue"
                                type="text"
                                className={p.input}
                                placeholder="Ej: Cancha 1"
                                value={venue}
                                onChange={(e) => setVenue(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Status */}
                <div className={p.formCard}>
                    <div className={p.field}>
                        <label className={p.label}>Estado inicial</label>
                        <div className={p.statusToggle}>
                            <button
                                type="button"
                                className={`${p.statusOption} ${status === 'scheduled' ? p.statusOptionActive : ''}`}
                                onClick={() => setStatus('scheduled')}
                            >
                                Programado
                            </button>
                        </div>
                    </div>
                </div>

                <div className={p.formActions}>
                    <Link href="/admin/torneo/partidos" className={p.btnSecondary}>
                        Cancelar
                    </Link>
                    <button type="submit" className={p.btnSubmit} disabled={!canSubmit}>
                        <CalendarPlus size={16} aria-hidden />
                        {submitting ? 'Creando…' : 'Crear partido'}
                        {!submitting && <ArrowRight size={16} aria-hidden />}
                    </button>
                </div>
            </form>
        </div>
    );
}

export default function CrearPartidoPage() {
    return (
        <Suspense fallback={<div className={p.stateCard}>Cargando…</div>}>
            <CrearPartidoForm />
        </Suspense>
    );
}
