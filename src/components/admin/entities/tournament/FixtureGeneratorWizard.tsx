'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Dices, RefreshCw, WandSparkles } from 'lucide-react';
import type { TournamentParticipantInfo } from '@/lib/types/fixture';
import {
    daySlotTimes,
    placeInSlots,
    planRounds,
    validateSlotConfig,
    type PairingScope,
    type SlotConfig,
} from '@/lib/fixture/autoFixture';
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
    const [simultaneous, setSimultaneous] = useState<'none' | 'last_round' | 'all_rounds'>('none');

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Quién está en esta fase y en qué zona. Sin asignaciones, entran todos.
    useEffect(() => {
        let alive = true;
        fetch(`/api/tournaments/${tournamentId}/phase-participants`)
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
    const groupIdsInUse = useMemo(() => Array.from(new Set(teams.map((t) => t.groupId).filter(Boolean))), [teams]);
    const hasZones = groupIdsInUse.length >= 2;

    useEffect(() => {
        if (assignments !== null) setScope(hasZones ? 'within_groups' : 'all');
    }, [assignments, hasZones]);

    const slots: SlotConfig = useMemo(() => ({
        startDate,
        endDate: endDate || null,
        // En modo "de tal a tal fecha" se juega todos los días del rango.
        weekdays: dayMode === 'range' ? [0, 1, 2, 3, 4, 5, 6] : weekdays,
        windowStart, windowEnd, durationMin, gapMin,
        venues: venuesText.split(/[,\n]/).map((v) => v.trim()).filter(Boolean),
        seed,
        simultaneous,
    }), [startDate, endDate, dayMode, weekdays, windowStart, windowEnd, durationMin, gapMin, venuesText, seed, simultaneous]);

    const problems = validateSlotConfig(slots);
    const rounds = useMemo(() => planRounds({ teams, scope, legs, seed }), [teams, scope, legs, seed]);
    const placement = useMemo(() => placeInSlots(rounds, slots), [rounds, slots]);
    const matchCount = rounds.reduce((s, r) => s + r.matches.length, 0);
    const perDay = daySlotTimes(slots).length * Math.max(1, slots.venues.length);
    const groupName = (id: string | null) => groups.find((g) => g.id === id)?.name ?? null;

    const canNext = step === 0 ? rounds.length > 0 : step === 1 ? problems.length === 0 : false;
    const blocker = step === 0
        ? (teams.length < 2 ? 'Cargá al menos dos equipos en la fase para generar el fixture.' : rounds.length === 0 ? 'Para cruzar zonas hacen falta al menos dos zonas con equipos.' : '')
        : step === 1 ? problems[0] ?? '' : '';

    const generate = async () => {
        setBusy(true);
        setError(null);
        try {
            const response = await fetch(`/api/tournaments/${tournamentId}/fixture/auto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phaseId, mode: 'commit', teams: teams.map((t) => ({ id: t.id, groupId: t.groupId })),
                    scope, legs, seed, slots, replace,
                }),
            });
            const json = await response.json().catch(() => null);
            if (!response.ok) throw new Error(json?.error ?? 'No se pudo generar el fixture.');
            await onDone(`Fixture generado: ${json.matches} partidos en ${json.rounds} fechas.`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo generar el fixture.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="fgw basalt-card" aria-label={`Generar fixture de ${phaseName}`}>
            <header className="fgw-head">
                <div>
                    <span className="operation-fixture-kicker">Generación automática</span>
                    <h4>Fixture de {phaseName}</h4>
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
                <strong>{teams.length}</strong> equipos
                {hasZones ? <> · <strong>{groupIdsInUse.length}</strong> zonas</> : null}
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
                        {hasZones && (
                            <ul className="fgw-zones">
                                {groupIdsInUse.map((gid) => (
                                    <li key={gid as string}><b>{groupName(gid as string) ?? 'Zona'}</b> {teams.filter((t) => t.groupId === gid).map((t) => t.name).join(' · ')}</li>
                                ))}
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
                        <label className="fgw-wide"><span>Canchas o sedes (separadas por coma, opcional)</span>
                            <input className="basalt-input" type="text" value={venuesText} onChange={(e) => setVenuesText(e.target.value)} placeholder="Cancha 1, Cancha 2" /></label>
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
                        <label className="operation-toggle"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /><span>Reemplazar los partidos sin jugar de esta fase (los que ya tienen resultado no se tocan)</span></label>
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
