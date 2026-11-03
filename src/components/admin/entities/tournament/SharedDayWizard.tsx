'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Plus, RefreshCw, WandSparkles, X } from 'lucide-react';
import './fixture-generator-wizard.css';

/**
 * Jornada compartida: varios torneos en la misma sede, el mismo día (el Seven
 * de Olivos: Mayores, M19 y Gordos). Se elige la sede con sus canchas, los
 * torneos en el orden en que se intercalan, y el horario; el servidor arma
 * todo junto sin pisar nada de lo que ya hay en la sede.
 */

type Venue = { id: string; name: string; fields_count: number };
type PhaseOption = { id: string; name: string; phase_type: string };
type Row = { tournamentId: string; name: string; phaseId: string; phases: PhaseOption[] };
type PreviewEntry = { tag: string; tournamentName: string; phaseName: string; teams: Array<{ id: string; name: string }>; matches: number };
type Placed = { tag?: string; homeId: string; awayId: string; date: string; time: string; venue: string | null; roundNumber: number };

type Props = {
    tournamentId: string;
    tournamentName: string;
    phaseId: string;
    onDone: (message: string) => Promise<void> | void;
    onBack: () => void;
};

const STEPS = ['Sede y torneos', 'Horario', 'Revisión'] as const;

function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadPhases(tournamentId: string): Promise<PhaseOption[]> {
    const res = await fetch(`/api/tournaments/${tournamentId}/phases`, { cache: 'no-store' });
    const json = await res.json().catch(() => null);
    const rows = (json?.data ?? []) as Array<PhaseOption & { order_index?: number | null }>;
    // Las llaves no se intercalan: son los cruces que salen de las zonas.
    return rows
        .filter((p) => p.phase_type !== 'playoff' && p.phase_type !== 'knockout')
        .sort((a, b) => Number(a.order_index ?? 0) - Number(b.order_index ?? 0))
        .map((p) => ({ id: p.id, name: p.name, phase_type: p.phase_type }));
}

export function SharedDayWizard({ tournamentId, tournamentName, phaseId, onDone, onBack }: Props) {
    const [step, setStep] = useState(0);
    const [venues, setVenues] = useState<Venue[]>([]);
    const [venueId, setVenueId] = useState<string>('');
    const [newVenueName, setNewVenueName] = useState('');
    const [fields, setFields] = useState(1);
    const [rows, setRows] = useState<Row[]>([]);
    const [suggested, setSuggested] = useState<Array<{ tournamentId: string; name: string }>>([]);
    const [search, setSearch] = useState('');
    const [results, setResults] = useState<Array<{ id: string; name: string }>>([]);

    const [date, setDate] = useState(todayIso());
    const [windowStart, setWindowStart] = useState('09:00');
    const [windowEnd, setWindowEnd] = useState('19:00');
    const [durationMin, setDurationMin] = useState(14);
    const [gapMin, setGapMin] = useState(4);
    const [restMin, setRestMin] = useState(20);
    const [legs, setLegs] = useState(1);
    const [replace, setReplace] = useState(true);

    const [preview, setPreview] = useState<{ placed: Placed[]; entries: PreviewEntry[]; busy: number } | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // La sede del torneo (si tiene) y los torneos que ya juegan ahí.
    useEffect(() => {
        let alive = true;
        (async () => {
            const [venuesRes, phases] = await Promise.all([
                fetch(`/api/tournaments/${tournamentId}/venues`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
                loadPhases(tournamentId),
            ]);
            if (!alive) return;
            const all = (venuesRes?.all ?? []) as Venue[];
            const linked = (venuesRes?.linked ?? []) as Venue[];
            setVenues(all);
            if (linked[0]) {
                setVenueId(linked[0].id);
                setFields(linked[0].fields_count);
            }
            setSuggested(((venuesRes?.sharing ?? []) as Array<{ tournamentId: string; name: string }>)
                .filter((s, i, arr) => arr.findIndex((x) => x.tournamentId === s.tournamentId) === i));
            setRows([{ tournamentId, name: venuesRes?.tournamentName || tournamentName, phaseId: phases.some((p) => p.id === phaseId) ? phaseId : phases[0]?.id ?? '', phases }]);
        })();
        return () => { alive = false; };
    }, [tournamentId, tournamentName, phaseId]);

    // Búsqueda de otros torneos (los que el admin puede editar).
    useEffect(() => {
        const q = search.trim();
        if (q.length < 2) { setResults([]); return; }
        let alive = true;
        const t = setTimeout(async () => {
            const res = await fetch(`/api/admin/torneo/tournaments?search=${encodeURIComponent(q)}&fields=basic&limit=10`, { cache: 'no-store' }).catch(() => null);
            const json = res ? await res.json().catch(() => null) : null;
            if (alive) setResults(((json?.data ?? []) as Array<{ id: string; name: string; display_name?: string | null }>).map((x) => ({ id: x.id, name: x.display_name || x.name })));
        }, 250);
        return () => { alive = false; clearTimeout(t); };
    }, [search]);

    const addTournament = useCallback(async (id: string, name: string) => {
        if (rows.some((r) => r.tournamentId === id)) return;
        const phases = await loadPhases(id);
        setRows((cur) => (cur.some((r) => r.tournamentId === id) ? cur : [...cur, { tournamentId: id, name, phaseId: phases[0]?.id ?? '', phases }]));
        setSearch('');
        setResults([]);
    }, [rows]);

    const move = (i: number, delta: number) => setRows((cur) => {
        const next = [...cur];
        const j = i + delta;
        if (j < 0 || j >= next.length) return cur;
        [next[i], next[j]] = [next[j], next[i]];
        return next;
    });

    const venue = venues.find((v) => v.id === venueId) ?? null;
    const venueName = venueId === 'new' ? newVenueName.trim() : venue?.name ?? '';
    const ready0 = venueName.length > 0 && rows.length > 0 && rows.every((r) => r.phaseId);
    const blocker = step === 0
        ? (!venueName ? 'Elegí la sede o creá una nueva.' : rows.some((r) => !r.phaseId) ? 'Cada torneo necesita una fase con equipos.' : '')
        : '';

    const requestBody = useMemo(() => ({
        venue: { name: venueName, fieldsCount: fields },
        entries: rows.map((r) => ({ tournamentId: r.tournamentId, phaseId: r.phaseId })),
        legs,
        replace,
        slots: { startDate: date, windowStart, windowEnd, durationMin, gapMin, restMin },
    }), [venueName, fields, rows, legs, replace, date, windowStart, windowEnd, durationMin, gapMin, restMin]);

    const callShared = async (mode: 'preview' | 'commit') => {
        const res = await fetch(`/api/tournaments/${tournamentId}/fixture/shared`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...requestBody, mode }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error ?? 'No se pudo armar la jornada.');
        return json;
    };

    const goReview = async () => {
        setBusy(true);
        setError(null);
        try {
            const json = await callShared('preview');
            setPreview({ placed: json.placement?.placed ?? [], entries: json.entries ?? [], busy: Number(json.busy) || 0 });
            setStep(2);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo armar la jornada.');
        } finally {
            setBusy(false);
        }
    };

    const generate = async () => {
        setBusy(true);
        setError(null);
        try {
            const json = await callShared('commit');
            await onDone(`Jornada armada en ${venueName}: ${json.matches} partidos de ${rows.length} torneo${rows.length === 1 ? '' : 's'}.`);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo armar la jornada.');
        } finally {
            setBusy(false);
        }
    };

    const nameOf = (tag: string | undefined, id: string) => preview?.entries.find((e) => e.tag === tag)?.teams.find((t) => t.id === id)?.name ?? id;
    const tournamentOf = (tag: string | undefined) => preview?.entries.find((e) => e.tag === tag)?.tournamentName ?? '';
    const total = preview?.entries.reduce((s, e) => s + e.matches, 0) ?? 0;
    const suggestions = suggested.filter((s) => !rows.some((r) => r.tournamentId === s.tournamentId));

    return (
        <section className="fgw basalt-card" aria-label="Jornada compartida">
            <header className="fgw-head">
                <div>
                    <span className="operation-fixture-kicker">Jornada compartida</span>
                    <h4>Varios torneos en una misma sede</h4>
                </div>
                <ol className="fgw-steps" aria-label="Pasos">
                    {STEPS.map((label, i) => (
                        <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''} aria-current={i === step ? 'step' : undefined}>
                            <span>{i < step ? <Check size={12} /> : i + 1}</span>{label}
                        </li>
                    ))}
                </ol>
            </header>

            <div key={step} className="fgw-body">
                {step === 0 && (
                    <>
                        <h5>¿Dónde se juega?</h5>
                        <div className="fgw-grid">
                            <label><span>Sede</span>
                                <select className="basalt-input" value={venueId} onChange={(e) => {
                                    setVenueId(e.target.value);
                                    const v = venues.find((x) => x.id === e.target.value);
                                    if (v) setFields(v.fields_count);
                                }}>
                                    <option value="">Elegí una sede</option>
                                    {venues.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.fields_count} cancha{v.fields_count === 1 ? '' : 's'}</option>)}
                                    <option value="new">Nueva sede…</option>
                                </select></label>
                            <label><span>Canchas</span>
                                <input className="basalt-input" type="number" min={1} max={50} value={fields} onChange={(e) => setFields(Math.max(1, Math.min(50, Math.floor(Number(e.target.value)) || 1)))} /></label>
                        </div>
                        {venueId === 'new' && (
                            <label className="fgw-wide"><span>Nombre de la sede</span>
                                <input className="basalt-input" type="text" value={newVenueName} onChange={(e) => setNewVenueName(e.target.value)} placeholder="Olivos" /></label>
                        )}
                        <p className="fgw-hint">La sede queda guardada y asignada a todos los torneos de la jornada. Si sumás canchas, se actualiza para todos.</p>

                        <h5>¿Qué torneos se juegan? (en este orden se intercalan)</h5>
                        <ul className="fgw-cups" aria-label="Torneos de la jornada">
                            {rows.map((r, i) => (
                                <li key={r.tournamentId} className="fgw-cup">
                                    <b>{i + 1}.</b>
                                    <span className="fgw-team-name">{r.name}</span>
                                    <select className="basalt-input" aria-label={`Fase de ${r.name}`} value={r.phaseId} onChange={(e) => setRows(rows.map((x) => (x.tournamentId === r.tournamentId ? { ...x, phaseId: e.target.value } : x)))}>
                                        {r.phases.length === 0 && <option value="">Sin fases para generar</option>}
                                        {r.phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                    <button type="button" className="fgw-team-x" aria-label={`Subir ${r.name}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={15} /></button>
                                    <button type="button" className="fgw-team-x" aria-label={`Bajar ${r.name}`} disabled={i === rows.length - 1} onClick={() => move(i, 1)}><ArrowDown size={15} /></button>
                                    {r.tournamentId !== tournamentId && (
                                        <button type="button" className="fgw-team-x" aria-label={`Quitar ${r.name}`} onClick={() => setRows(rows.filter((x) => x.tournamentId !== r.tournamentId))}><X size={15} /></button>
                                    )}
                                </li>
                            ))}
                        </ul>
                        {suggestions.length > 0 && (
                            <div className="fgw-days" role="group" aria-label="Torneos de la misma sede">
                                {suggestions.map((s) => (
                                    <button key={s.tournamentId} type="button" onClick={() => void addTournament(s.tournamentId, s.name)}><Plus size={13} />{s.name}</button>
                                ))}
                            </div>
                        )}
                        <label className="fgw-wide"><span>Sumar otro torneo</span>
                            <input className="basalt-input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscá por nombre: Seven de Olivos M19" /></label>
                        {results.length > 0 && (
                            <div className="fgw-days" role="group" aria-label="Resultados">
                                {results.filter((x) => !rows.some((r) => r.tournamentId === x.id)).map((x) => (
                                    <button key={x.id} type="button" onClick={() => void addTournament(x.id, x.name)}><Plus size={13} />{x.name}</button>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {step === 1 && (
                    <>
                        <h5>¿Cuándo se juega?</h5>
                        <div className="fgw-grid fgw-grid-4">
                            <label><span>Día</span><input className="basalt-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                            <label><span>Desde las</span><input className="basalt-input" type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} /></label>
                            <label><span>Hasta las</span><input className="basalt-input" type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} /></label>
                            <label><span>Dura (min)</span><input className="basalt-input" type="number" min={1} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value) || 0)} /></label>
                        </div>
                        <div className="fgw-grid">
                            <label><span>Entre partidos (min)</span><input className="basalt-input" type="number" min={0} value={gapMin} onChange={(e) => setGapMin(Number(e.target.value) || 0)} /></label>
                            <label><span>Descanso de cada equipo (min)</span><input className="basalt-input" type="number" min={0} value={restMin} onChange={(e) => setRestMin(Number(e.target.value) || 0)} /></label>
                        </div>
                        <h5>¿Cuántas veces se enfrentan?</h5>
                        <div className="fgw-seg" role="radiogroup" aria-label="Cantidad de enfrentamientos">
                            {[1, 2].map((n) => (
                                <button key={n} type="button" role="radio" aria-checked={legs === n} className={legs === n ? 'is-on' : ''} onClick={() => setLegs(n)}>{n === 1 ? 'Una vez' : 'Ida y vuelta'}</button>
                            ))}
                        </div>
                        <label className="operation-toggle"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /><span>Reemplazar los partidos sin jugar de esas fases (los que tienen resultado no se tocan)</span></label>
                        <p className="fgw-hint">Se juega todo ese día, una fecha detrás de la otra, en {fields === 1 ? 'la cancha' : `las ${fields} canchas`} de {venueName}. Los partidos que ya hay en esa sede no se pisan. Si no entra, sigue al día siguiente.</p>
                    </>
                )}

                {step === 2 && preview && (
                    <>
                        <div className="fgw-summary" role="status">
                            <strong>{total}</strong> partidos · {preview.entries.map((e) => `${e.tournamentName}: ${e.matches}`).join(' · ')}
                            {preview.busy > 0 ? <> · <strong>{preview.busy}</strong> ya ocupados en la sede</> : null}
                        </div>
                        {preview.placed.length < total && <p className="fgw-warn">{total - preview.placed.length} partidos no entran: sumá canchas o ampliá el horario.</p>}
                        <div className="fgw-rounds">
                            {Array.from(new Set(preview.placed.map((p) => p.date))).sort().map((day) => (
                                <details key={day} open>
                                    <summary><b>{day}</b><span>{preview.placed.filter((p) => p.date === day).length} partidos</span></summary>
                                    <ul>
                                        {preview.placed.filter((p) => p.date === day).sort((a, b) => a.time.localeCompare(b.time) || String(a.venue).localeCompare(String(b.venue))).map((p, i) => (
                                            <li key={i}><time>{p.time}</time><span><em>{tournamentOf(p.tag)}</em> · {nameOf(p.tag, p.homeId)} <i>vs</i> {nameOf(p.tag, p.awayId)}</span>{p.venue ? <em>{p.venue}</em> : null}</li>
                                        ))}
                                    </ul>
                                </details>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {(blocker || error) && <p className="fgw-warn" role="alert">{error ?? blocker}</p>}

            <footer className="fgw-foot">
                <button type="button" className="basalt-btn" disabled={busy} onClick={step === 0 ? onBack : () => setStep(step - 1)}><ArrowLeft size={15} />{step === 0 ? 'Volver al generador' : 'Atrás'}</button>
                {step === 0 && <button type="button" className="basalt-btn basalt-btn-primary" disabled={!ready0} onClick={() => setStep(1)}>Siguiente<ArrowRight size={15} /></button>}
                {step === 1 && (
                    <button type="button" className="basalt-btn basalt-btn-primary" disabled={busy} onClick={() => void goReview()}>
                        {busy ? <RefreshCw size={15} className="spin" /> : <ArrowRight size={15} />}Ver cómo queda
                    </button>
                )}
                {step === 2 && (
                    <button type="button" className="basalt-btn basalt-btn-primary" disabled={busy || !preview || preview.placed.length < total} onClick={() => void generate()}>
                        {busy ? <RefreshCw size={15} className="spin" /> : <WandSparkles size={15} />}Generar {total} partidos
                    </button>
                )}
            </footer>
        </section>
    );
}
