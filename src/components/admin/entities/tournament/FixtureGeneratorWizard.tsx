'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Dices, RefreshCw, WandSparkles } from 'lucide-react';
import type { TournamentParticipantInfo } from '@/lib/types/fixture';
import {
    daySlotTimes,
    placeInSlots,
    planRounds,
    slotLanes,
    validateSlotConfig,
    type BusySlot,
    type PairingScope,
    type SlotConfig,
} from '@/lib/fixture/autoFixture';

type BusyEntry = BusySlot & { phaseId: string | null; groupId: string | null; status: string | null };
import { SharedDayWizard } from './SharedDayWizard';
import './fixture-generator-wizard.css';

type GroupInfo = { id: string; name: string; phaseId: string | null };

type Props = {
    tournamentId: string;
    phaseId: string;
    phaseName: string;
    participants: TournamentParticipantInfo[];
    groups: GroupInfo[];
    onDone: (message: string) => Promise<void> | void;
};

const STEPS = ['Cruces', 'Calendario', 'Revisión'] as const;
const WEEKDAYS = [
    { n: 1, label: 'Lun' }, { n: 2, label: 'Mar' }, { n: 3, label: 'Mié' }, { n: 4, label: 'Jue' },
    { n: 5, label: 'Vie' }, { n: 6, label: 'Sáb' }, { n: 0, label: 'Dom' },
];

function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newSeed() {
    return Math.floor(Math.random() * 2_000_000_000);
}

function longDate(iso: string) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function FixtureGeneratorWizard({ tournamentId, phaseId, phaseName, participants, groups, onDone }: Props) {
    const [step, setStep] = useState(0);
    const [assignments, setAssignments] = useState<Array<{ participant_id: string; group_id: string | null }> | null>(null);

    const [scope, setScope] = useState<PairingScope>('all');
    const [legs, setLegs] = useState(1);
    const [seed, setSeed] = useState<number | undefined>(undefined);
    const [replace, setReplace] = useState(true);

    const [dayMode, setDayMode] = useState<'weekdays' | 'range'>('weekdays');
    const [weekdays, setWeekdays] = useState<number[]>([6]);
    const [startDate, setStartDate] = useState(todayIso());
    const [endDate, setEndDate] = useState('');
    const [windowStart, setWindowStart] = useState('10:00');
    const [windowEnd, setWindowEnd] = useState('18:00');
    const [durationMin, setDurationMin] = useState(80);
    const [gapMin, setGapMin] = useState(10);
    const [venuesText, setVenuesText] = useState('');
    const [fieldsPerVenue, setFieldsPerVenue] = useState(1);
    // Partidos que ya ocupan el calendario del torneo (de esta fase y de las otras).
    const [busyRows, setBusyRows] = useState<BusyEntry[]>([]);
    const [simultaneous, setSimultaneous] = useState<'none' | 'last_round' | 'all_rounds'>('none');

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sharedDay, setSharedDay] = useState(false);

    // Partidos que ya tiene cada zona, y las zonas elegidas (null = todas).
    const [existingByGroup, setExistingByGroup] = useState<Map<string, { scheduled: number; played: number }> | null>(null);
    const [onlyZones, setOnlyZones] = useState<string[] | null>(null);

    useEffect(() => {
        let alive = true;
        fetch(`/api/tournaments/${tournamentId}/fixture/auto?phaseId=${encodeURIComponent(phaseId)}`, { cache: 'no-store' })
            .then((r) => r.json())
            .then((json) => {
                if (!alive) return;
                const map = new Map<string, { scheduled: number; played: number }>();
                for (const g of json?.groups ?? []) if (g?.groupId) map.set(String(g.groupId), { scheduled: Number(g.scheduled) || 0, played: Number(g.played) || 0 });
                setExistingByGroup(map);
                setBusyRows(Array.isArray(json?.busy) ? json.busy : []);
                // La sede del torneo viene cargada: se juega ahí, con sus canchas.
                if (json?.venue?.name) {
                    setVenuesText((cur) => cur || json.venue.name);
                    setFieldsPerVenue((cur) => (cur > 1 ? cur : Math.max(1, Number(json.venue.fieldsCount) || 1)));
                }
            })
            .catch(() => alive && setExistingByGroup(new Map()));
        return () => { alive = false; };
    }, [tournamentId, phaseId]);

    // Quién está en esta fase y en qué zona. Sin asignaciones, entran todos.
    useEffect(() => {
        let alive = true;
        // Con la temporada de la URL: sin ella el endpoint lee la actual y las zonas de otra temporada no aparecen.
        const season = new URLSearchParams(window.location.search).get('seasonId');
        fetch(`/api/tournaments/${tournamentId}/phase-participants${season ? `?seasonId=${encodeURIComponent(season)}` : ''}`)
            .then((r) => r.json())
            .then((json) => {
                if (!alive) return;
                const rows = (json?.assignments ?? []).filter((a: { phase_id: string }) => a.phase_id === phaseId);
                setAssignments(rows);
            })
            .catch(() => alive && setAssignments([]));
        return () => { alive = false; };
    }, [tournamentId, phaseId]);

    const teams = useMemo(() => {
        const byParticipant = new Map((assignments ?? []).map((a) => [a.participant_id, a.group_id]));
        const scoped = byParticipant.size > 0 ? participants.filter((p) => byParticipant.has(p.id)) : participants;
        return scoped
            .filter((p) => p.clubId)
            .map((p) => ({ id: p.clubId as string, name: p.name, groupId: byParticipant.get(p.id) ?? null }));
    }, [assignments, participants]);

    const names = useMemo(() => new Map(teams.map((t) => [t.id, t.name])), [teams]);
    // En el orden de la fase (Zona A, B…), no en el orden en que se cargaron los equipos.
    const groupIdsInUse = useMemo(() => {
        const order = new Map(groups.map((g, i) => [g.id, i]));
        return Array.from(new Set(teams.map((t) => t.groupId).filter(Boolean)))
            .sort((a, b) => (order.get(a as string) ?? Infinity) - (order.get(b as string) ?? Infinity));
    }, [teams, groups]);
    const hasZones = groupIdsInUse.length >= 2;

    useEffect(() => {
        if (assignments !== null) setScope(hasZones ? 'within_groups' : 'all');
    }, [assignments, hasZones]);

    const matchesIn = (gid: string) => {
        const e = existingByGroup?.get(gid);
        return e ? e.scheduled + e.played : 0;
    };

    // Si unas zonas ya tienen fixture y otras no (se sumaron después), se proponen solo las vacías.
    useEffect(() => {
        if (assignments === null || existingByGroup === null) return;
        const zones = groupIdsInUse as string[];
        const empty = zones.filter((gid) => matchesIn(gid) === 0);
        setOnlyZones(empty.length > 0 && empty.length < zones.length ? empty : null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assignments, existingByGroup, groupIdsInUse]);

    const zonesActive = scope === 'within_groups' && hasZones && onlyZones !== null;
    const toggleZone = (gid: string) => {
        // Con "Todas" marcada, tocar una zona deja solo esa; después se suman o se sacan de a una.
        if (onlyZones === null) {
            setOnlyZones([gid]);
            return;
        }
        const next = onlyZones.includes(gid) ? onlyZones.filter((x) => x !== gid) : [...onlyZones, gid];
        const ordered = (groupIdsInUse as string[]).filter((x) => next.includes(x));
        setOnlyZones(ordered.length === groupIdsInUse.length ? null : ordered);
    };
    const planTeams = useMemo(
        () => (zonesActive ? teams.filter((t) => t.groupId && onlyZones!.includes(t.groupId)) : teams),
        [teams, zonesActive, onlyZones],
    );
    const chosenNames = zonesActive ? onlyZones!.map((gid) => groups.find((g) => g.id === gid)?.name ?? 'Zona') : [];
    const chosenWithMatches = zonesActive ? onlyZones!.filter((gid) => matchesIn(gid) > 0) : [];

    const slots: SlotConfig = useMemo(() => ({
        startDate,
        endDate: endDate || null,
        // En modo "de tal a tal fecha" se juega todos los días del rango.
        weekdays: dayMode === 'range' ? [0, 1, 2, 3, 4, 5, 6] : weekdays,
        windowStart, windowEnd, durationMin, gapMin,
        venues: venuesText.split(/[,\n]/).map((v) => v.trim()).filter(Boolean),
        fieldsPerVenue,
        seed,
        simultaneous,
    }), [startDate, endDate, dayMode, weekdays, windowStart, windowEnd, durationMin, gapMin, venuesText, fieldsPerVenue, seed, simultaneous]);

    const problems = validateSlotConfig(slots);
    const rounds = useMemo(() => planRounds({ teams: planTeams, scope, legs, seed }), [planTeams, scope, legs, seed]);
    // Lo que ya está en el calendario, menos lo que este fixture va a reemplazar
    // (la misma regla que aplica el servidor al guardar).
    const takenSlots = useMemo(() => busyRows.filter((b) => !(replace
        && b.phaseId === phaseId
        && b.status === 'scheduled'
        && (!zonesActive || (b.groupId !== null && onlyZones!.includes(b.groupId))))), [busyRows, replace, phaseId, zonesActive, onlyZones]);
    const placement = useMemo(() => placeInSlots(rounds, { ...slots, busy: takenSlots }), [rounds, slots, takenSlots]);
    const matchCount = rounds.reduce((s, r) => s + r.matches.length, 0);
    const lanesCount = slotLanes(slots).length;
    const perDay = daySlotTimes(slots).length * lanesCount;
    const busyInRange = takenSlots.filter((b) => b.date >= startDate && (!endDate || b.date <= endDate)).length;
    const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null;

    const canNext = step === 0 ? rounds.length > 0 : step === 1 ? problems.length === 0 : false;
    const blocker = step === 0
        ? (teams.length < 2 ? 'Cargá al menos dos equipos en la fase para generar el fixture.'
            : zonesActive && onlyZones!.length === 0 ? 'Elegí al menos una zona para generar.'
                : rounds.length === 0 ? (zonesActive ? 'Las zonas elegidas necesitan al menos dos equipos.' : 'Para cruzar zonas hacen falta al menos dos zonas con equipos.') : '')
        : step === 1 ? problems[0] ?? '' : '';

    const generate = async () => {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/fixture/auto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phaseId, mode: 'commit', teams: planTeams.map((t) => ({ id: t.id, groupId: t.groupId })),
                    scope, legs, seed, slots, replace,
                    groupIds: zonesActive ? onlyZones : undefined,
                }),
            });
            const json = await response.json().catch(() => null);
            if (!response.ok) throw new Error(json?.error ?? 'No se pudo generar el fixture.');
            await onDone(`Fixture generado${zonesActive ? ` para ${chosenNames.join(', ')}` : ''}: ${json.matches} partidos en ${json.rounds} fechas.`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo generar el fixture.');
        } finally {
            setBusy(false);
        }
    };

    if (sharedDay) {
        return <SharedDayWizard tournamentId={tournamentId} tournamentName="Este torneo" phaseId={phaseId} onDone={onDone} onBack={() => setSharedDay(false)} />;
    }

    return (
        <section className="fgw basalt-card" aria-label={`Generar fixture de ${phaseName}`}>
            <header className="fgw-head">
                <div>
                    <span className="operation-fixture-kicker">Generación automática</span>
                    <h4>Fixture de {phaseName}</h4>
                    <button type="button" className="fgw-link" onClick={() => setSharedDay(true)}>
                        ¿Se juega junto con otros torneos en la misma sede? Armá la jornada compartida
                    </button>
                </div>
                <ol className="fgw-steps" aria-label="Pasos">
                    {STEPS.map((label, i) => (
                        <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
                            <span>{i < step ? <Check size={12} /> : i + 1}</span>{label}
                        </li>
                    ))}
                </ol>
            </header>

            <div className="fgw-summary" role="status">
                <strong>{planTeams.length}</strong> equipos
                {hasZones ? <> · <strong>{zonesActive ? onlyZones!.length : groupIdsInUse.length}</strong> {zonesActive ? `de ${groupIdsInUse.length} zonas` : 'zonas'}</> : null}
                {' · '}<strong>{matchCount}</strong> partidos · <strong>{rounds.length}</strong> fechas
                {placement.lastDate ? <> · hasta el <strong>{longDate(placement.lastDate)}</strong></> : null}
            </div>

            <div key={step} className="fgw-body">
                {step === 0 && (
                    <>
                        <h5>¿Quién juega contra quién?</h5>
                        <div className="fgw-cards" role="radiogroup" aria-label="Tipo de cruces">
                            {([
                                ['within_groups', 'Dentro de cada zona', 'Los de la zona A juegan entre sí, los de la B entre sí.', hasZones],
                                ['between_groups', 'Entre zonas', 'Cada equipo de una zona juega contra los de las otras.', hasZones],
                                ['all', 'Todos contra todos', 'Un solo grupo, sin mirar las zonas.', true],
                            ] as const).map(([value, title, text, enabled]) => (
                                <button key={value} type="button" role="radio" aria-checked={scope === value} disabled={!enabled}
                                    className={`fgw-card ${scope === value ? 'is-on' : ''}`} onClick={() => setScope(value)}>
                                    <strong>{title}</strong><span>{enabled ? text : 'Armá al menos dos zonas con equipos para usar esta opción.'}</span>
                                </button>
                            ))}
                        </div>
                        <h5>¿Cuántas veces se enfrentan?</h5>
                        <div className="fgw-seg" role="radiogroup" aria-label="Cantidad de enfrentamientos">
                            {[1, 2, 3, 4].map((n) => (
                                <button key={n} type="button" role="radio" aria-checked={legs === n} className={legs === n ? 'is-on' : ''} onClick={() => setLegs(n)}>
                                    {n === 1 ? 'Una vez' : n === 2 ? 'Ida y vuelta' : `${n} veces`}
                                </button>
                            ))}
                        </div>
                        {hasZones && scope === 'within_groups' && (
                            <>
                                <h5>¿Para qué zonas?</h5>
                                <div className="fgw-days" role="group" aria-label="Zonas a generar">
                                    <button type="button" aria-pressed={onlyZones === null} className={onlyZones === null ? 'is-on' : ''} onClick={() => setOnlyZones(null)}>Todas las zonas</button>
                                    {groupIdsInUse.map((gid) => {
                                        const on = onlyZones === null || onlyZones.includes(gid as string);
                                        return (
                                            <button key={gid as string} type="button" aria-pressed={onlyZones !== null && on} className={onlyZones !== null && on ? 'is-on' : ''} onClick={() => toggleZone(gid as string)}>
                                                {groupName(gid as string) ?? 'Zona'}
                                            </button>
                                        );
                                    })}
                                </div>
                                <p className="fgw-hint">
                                    {onlyZones === null
                                        ? 'Se arma el fixture de todas las zonas. Tocá una zona para generar solo esa.'
                                        : 'Solo se generan las zonas marcadas. Los partidos de las otras no se tocan, y las fechas que ya existen se reusan: la Fecha 1 de una zona nueva cae en la Fecha 1 del torneo.'}
                                </p>
                            </>
                        )}
                        {hasZones && (
                            <ul className="fgw-zones">
                                {groupIdsInUse.map((gid) => {
                                    const n = matchesIn(gid as string);
                                    const skipped = zonesActive && !onlyZones!.includes(gid as string);
                                    return (
                                        <li key={gid as string} className={skipped ? 'is-off' : undefined}>
                                            <b>{groupName(gid as string) ?? 'Zona'}</b> {teams.filter((t) => t.groupId === gid).map((t) => t.name).join(' · ')}
                                            {existingByGroup !== null ? <em>{n === 0 ? ' · sin partidos' : ` · ya tiene ${n} partido${n === 1 ? '' : 's'}`}{skipped ? ', no se toca' : ''}</em> : null}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </>
                )}

                {step === 1 && (
                    <>
                        <h5>¿Cuándo se juega?</h5>
                        <div className="fgw-seg" role="radiogroup" aria-label="Modo de fechas">
                            <button type="button" role="radio" aria-checked={dayMode === 'weekdays'} className={dayMode === 'weekdays' ? 'is-on' : ''} onClick={() => setDayMode('weekdays')}>Días de la semana</button>
                            <button type="button" role="radio" aria-checked={dayMode === 'range'} className={dayMode === 'range' ? 'is-on' : ''} onClick={() => setDayMode('range')}>De tal fecha a tal fecha</button>
                        </div>
                        {dayMode === 'weekdays' && (
                            <div className="fgw-days" role="group" aria-label="Días de juego">
                                {WEEKDAYS.map((d) => (
                                    <button key={d.n} type="button" aria-pressed={weekdays.includes(d.n)} className={weekdays.includes(d.n) ? 'is-on' : ''}
                                        onClick={() => setWeekdays((cur) => cur.includes(d.n) ? cur.filter((x) => x !== d.n) : [...cur, d.n])}>{d.label}</button>
                                ))}
                            </div>
                        )}
                        <div className="fgw-grid">
                            <label><span>{dayMode === 'range' ? 'Desde' : 'Primera fecha'}</span><input className="basalt-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
                            <label><span>{dayMode === 'range' ? 'Hasta' : 'Hasta (opcional)'}</span><input className="basalt-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
                        </div>
                        <h5>¿Entre qué horas?</h5>
                        <div className="fgw-grid fgw-grid-4">
                            <label><span>Desde las</span><input className="basalt-input" type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} /></label>
                            <label><span>Hasta las</span><input className="basalt-input" type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} /></label>
                            <label><span>Dura (min)</span><input className="basalt-input" type="number" min={1} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value) || 0)} /></label>
                            <label><span>Entre partidos (min)</span><input className="basalt-input" type="number" min={0} value={gapMin} onChange={(e) => setGapMin(Number(e.target.value) || 0)} /></label>
                        </div>
                        <div className="fgw-grid">
                            <label><span>Sedes (separadas por coma, opcional)</span>
                                <input className="basalt-input" type="text" value={venuesText} onChange={(e) => setVenuesText(e.target.value)} placeholder="Club Atlético, Club Universitario" /></label>
                            <label><span>Canchas por sede</span>
                                <input className="basalt-input" type="number" min={1} max={50} value={fieldsPerVenue} onChange={(e) => setFieldsPerVenue(Math.max(1, Math.min(50, Math.floor(Number(e.target.value)) || 1)))} /></label>
                        </div>
                        <p className="fgw-hint">
                            {lanesCount > 1
                                ? `Se juegan hasta ${lanesCount} partidos al mismo horario${fieldsPerVenue > 1 ? `, uno por cancha` : ''}.`
                                : 'Con una sola cancha, los partidos van uno después del otro.'}
                            {busyInRange > 0 ? ` Hay ${busyInRange} partido${busyInRange === 1 ? '' : 's'} del torneo ya programado${busyInRange === 1 ? '' : 's'} en esas fechas: sus horarios no se pisan.` : ''}
                        </p>
                        <h5>¿Se juegan todos al mismo tiempo?</h5>
                        <div className="fgw-seg" role="radiogroup" aria-label="Partidos simultáneos">
                            {([
                                ['none', 'No'],
                                ['last_round', 'Solo la última fecha'],
                                ['all_rounds', 'Todas las fechas'],
                            ] as const).map(([value, label]) => (
                                <button key={value} type="button" role="radio" aria-checked={simultaneous === value} className={simultaneous === value ? 'is-on' : ''} onClick={() => setSimultaneous(value)}>{label}</button>
                            ))}
                        </div>
                        {simultaneous !== 'none' && <p className="fgw-hint">Los partidos de {simultaneous === 'last_round' ? 'la última fecha' : 'cada fecha'} arrancan a las {windowStart}, el mismo día. Así ningún equipo sabe cómo salió otro antes de jugar.</p>}
                        {problems.length === 0 && <p className="fgw-hint">Entran {perDay} partidos por día. Cada fecha del fixture usa un día.</p>}
                    </>
                )}

                {step === 2 && (
                    <>
                        <div className="fgw-review-head">
                            <h5>Así quedaría</h5>
                            <button type="button" className="fgw-dice" onClick={() => setSeed(newSeed())}><Dices size={15} />Sortear de nuevo</button>
                        </div>
                        {placement.spilledRounds.length > 0 && <p className="fgw-warn">{placement.spilledRounds.length} fechas no entran en un día y siguen en el siguiente. Sumá canchas o ampliá el horario.</p>}
                        {placement.pastEndDate > 0 && <p className="fgw-warn">{placement.pastEndDate} partidos quedan después de la fecha límite.</p>}
                        <div className="fgw-rounds">
                            {rounds.map((round) => {
                                const placed = placement.placed.filter((p) => p.roundNumber === round.number);
                                return (
                                    <details key={round.number} open={round.number <= 2}>
                                        <summary><b>Fecha {round.number}</b><span>{placed[0] ? longDate(placed[0].date) : ''} · {round.matches.length} partidos</span></summary>
                                        <ul>
                                            {placed.map((p, i) => (
                                                <li key={i}><time>{p.time}</time><span>{names.get(p.homeId)} <i>vs</i> {names.get(p.awayId)}</span>{p.venue ? <em>{p.venue}</em> : null}</li>
                                            ))}
                                            {round.byes.length > 0 && <li className="fgw-bye">Libre: {round.byes.map((b) => names.get(b)).join(', ')}</li>}
                                        </ul>
                                    </details>
                                );
                            })}
                        </div>
                        <label className="operation-toggle"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /><span>
                            {zonesActive
                                ? `Reemplazar los partidos sin jugar de ${chosenNames.join(', ')} (las otras zonas y los que tienen resultado no se tocan)`
                                : 'Reemplazar los partidos sin jugar de esta fase (los que ya tienen resultado no se tocan)'}
                        </span></label>
                        {!replace && chosenWithMatches.length > 0 && (
                            <p className="fgw-warn">{chosenWithMatches.map((gid) => groupName(gid) ?? 'Zona').join(', ')} ya {chosenWithMatches.length === 1 ? 'tiene' : 'tienen'} partidos: sin reemplazar, se suman a los que hay y pueden quedar repetidos.</p>
                        )}
                    </>
                )}
            </div>

            {(blocker || error) && <p className="fgw-warn" role="alert">{error ?? blocker}</p>}

            <footer className="fgw-foot">
                <button type="button" className="basalt-btn" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}><ArrowLeft size={15} />Atrás</button>
                {step < 2 ? (
                    <button type="button" className="basalt-btn basalt-btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>Siguiente<ArrowRight size={15} /></button>
                ) : (
                    <button type="button" className="basalt-btn basalt-btn-primary" disabled={busy || matchCount === 0} onClick={() => void generate()}>
                        {busy ? <RefreshCw size={15} className="spin" /> : <WandSparkles size={15} />}Generar {matchCount} partidos
                    </button>
                )}
            </footer>
        </section>
    );
}
