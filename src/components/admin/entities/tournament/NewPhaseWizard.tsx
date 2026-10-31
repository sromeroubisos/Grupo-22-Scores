'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { getPhaseDefaults } from '@/lib/data/phaseDefaults';
import { buildPhaseRequestBody, type PhaseFormSnapshot, type PhaseType } from '@/lib/data/phasePayload';
import { getDefaultPlayoffStageNames, getPlayoffMatchCounts } from '@/lib/utils/playoffStages';
import './fixture-generator-wizard.css';

type ExistingPhase = { id: string; name: string; phase_type: string };

type Props = {
    tournamentId: string;
    sportId: string;
    phases: ExistingPhase[];
    onCreated: (phase: { id: string | null; type: PhaseType; name: string }) => Promise<void> | void;
    onCancel: () => void;
};

const STEPS = ['Tipo', 'Detalles', 'Conexión', 'Listo'] as const;
const ZONE_COLORS = ['#00a365', '#3b82f6', '#eab308', '#a855f7', '#f97316', '#14b8a6', '#ef4444', '#22c55e'];
const letter = (i: number) => String.fromCharCode(65 + i);

const TYPES: Array<{ value: PhaseType; title: string; text: string; base: string }> = [
    { value: 'league', title: 'Liga', text: 'Una tabla, todos contra todos.', base: 'Liga' },
    { value: 'group_stage', title: 'Zonas o grupos', text: 'Varias zonas, cada una con su tabla.', base: 'Fase de grupos' },
    { value: 'playoff', title: 'Playoff', text: 'Eliminación directa, con cuadro de llaves.', base: 'Playoff' },
];

export function NewPhaseWizard({ tournamentId, sportId, phases, onCreated, onCancel }: Props) {
    const [step, setStep] = useState(0);
    const [type, setType] = useState<PhaseType>('league');
    const [name, setName] = useState('Liga');
    const [nameTouched, setNameTouched] = useState(false);
    const [zones, setZones] = useState(2);
    const [legs, setLegs] = useState<1 | 2>(1);
    const [bracketTeams, setBracketTeams] = useState(8);
    const [connected, setConnected] = useState(false);
    const [previousId, setPreviousId] = useState(phases[phases.length - 1]?.id ?? '');
    const [carryOver, setCarryOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const chooseType = (next: PhaseType) => {
        setType(next);
        if (!nameTouched) setName(TYPES.find((t) => t.value === next)?.base ?? 'Fase');
    };

    const zoneNames = useMemo(() => Array.from({ length: zones }, (_, i) => `Zona ${letter(i)}`), [zones]);
    const previous = phases.find((p) => p.id === previousId) ?? null;
    const canGoNext = step === 1 ? name.trim().length > 0 : step === 2 ? !connected || Boolean(previousId) : true;
    const blocker = step === 1 && !name.trim() ? 'Ponele un nombre a la fase para continuar.' : step === 2 && connected && !previousId ? 'Elegí de qué fase viene.' : '';

    const create = async () => {
        setBusy(true);
        setError(null);
        try {
            const defaults = getPhaseDefaults({ sportId });
            const isPlayoff = type === 'playoff';
            const stageNames = isPlayoff ? getDefaultPlayoffStageNames(bracketTeams) : [];
            const snapshot: PhaseFormSnapshot = {
                phaseType: type,
                isCircuit: false,
                placementPoints: [],
                teamsCount: isPlayoff ? bracketTeams : '',
                advanceCount: '',
                legs,
                tableColumns: { ...defaults.columns, ...Object.fromEntries(defaults.statColumns.map((s) => [s.key, true])) },
                groupLabels: type === 'group_stage'
                    ? zoneNames.map((n, i) => ({ name: n, colorMode: 'auto' as const, color: ZONE_COLORS[i % ZONE_COLORS.length], autoColorIndex: i }))
                    : [],
                groupNames: type === 'group_stage' ? zoneNames : [],
                playoffStageNames: stageNames,
                playoffStageMatchCounts: isPlayoff ? getPlayoffMatchCounts(bracketTeams, stageNames.length) : [],
                playoffTeamsCount: bracketTeams,
                bracketMode: 'auto',
                statsAssignment: 'played',
                carryOverPreviousPhase: carryOver && connected,
                canCarryOverPreviousPhase: connected && Boolean(previous),
                pointsWin: defaults.points.win,
                pointsDraw: defaults.points.draw,
                pointsLoss: defaults.points.loss,
                allowBonusPoints: defaults.points.allowBonusPoints,
                bonusTryMode: 'count',
                useExtraTimePoints: false,
                pointsWinExtra: 0,
                pointsDrawExtra: 0,
                pointsLossExtra: 0,
                tiebreakers: defaults.tiebreakers,
            };
            const body = buildPhaseRequestBody(snapshot, { phaseName: name.trim(), editingPhaseId: null, editingPhase: null, phaseCount: phases.length });
            const response = await fetch(`/api/tournaments/${tournamentId}/phases`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const json = await response.json().catch(() => null);
            if (!response.ok) throw new Error(json?.message || json?.error || `Error ${response.status}`);
            const created = json?.data ?? json;
            await onCreated({ id: created?.id ?? null, type, name: name.trim() });
        } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo crear la fase.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="fgw basalt-card" aria-label="Crear fase">
            <header className="fgw-head">
                <div>
                    <span className="operation-fixture-kicker">Nueva fase</span>
                    <h4>Crear fase</h4>
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
                        <h5>¿Qué tipo de fase es?</h5>
                        <div className="fgw-cards" role="radiogroup" aria-label="Tipo de fase">
                            {TYPES.map((t) => (
                                <button key={t.value} type="button" role="radio" aria-checked={type === t.value} className={`fgw-card ${type === t.value ? 'is-on' : ''}`} onClick={() => chooseType(t.value)}>
                                    <strong>{t.title}</strong><span>{t.text}</span>
                                </button>
                            ))}
                        </div>
                    </>
                )}

                {step === 1 && (
                    <>
                        <label className="fgw-wide"><span>Nombre de la fase</span>
                            <input className="basalt-input" value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} /></label>
                        {type === 'group_stage' && (
                            <>
                                <h5>¿Cuántas zonas?</h5>
                                <div className="fgw-seg" role="radiogroup" aria-label="Cantidad de zonas">
                                    {[2, 3, 4, 5, 6, 8].map((n) => (
                                        <button key={n} type="button" role="radio" aria-checked={zones === n} className={zones === n ? 'is-on' : ''} onClick={() => setZones(n)}>{n}</button>
                                    ))}
                                </div>
                                <p className="fgw-hint">Se crean {zoneNames.join(', ')}. Los equipos se reparten después, en Participantes.</p>
                            </>
                        )}
                        {type !== 'playoff' && (
                            <>
                                <h5>¿Cuántas veces se enfrentan?</h5>
                                <div className="fgw-seg" role="radiogroup" aria-label="Enfrentamientos">
                                    <button type="button" role="radio" aria-checked={legs === 1} className={legs === 1 ? 'is-on' : ''} onClick={() => setLegs(1)}>Una vez</button>
                                    <button type="button" role="radio" aria-checked={legs === 2} className={legs === 2 ? 'is-on' : ''} onClick={() => setLegs(2)}>Ida y vuelta</button>
                                </div>
                                <p className="fgw-hint">Podés cambiarlo cuando generes el fixture (hasta 4 veces).</p>
                            </>
                        )}
                        {type === 'playoff' && (
                            <>
                                <h5>¿Cuántos equipos entran al cuadro?</h5>
                                <div className="fgw-seg" role="radiogroup" aria-label="Equipos en el cuadro">
                                    {[4, 8, 16].map((n) => (
                                        <button key={n} type="button" role="radio" aria-checked={bracketTeams === n} className={bracketTeams === n ? 'is-on' : ''} onClick={() => setBracketTeams(n)}>{n}</button>
                                    ))}
                                </div>
                            </>
                        )}
                    </>
                )}

                {step === 2 && (
                    <>
                        <h5>¿Esta fase viene de otra?</h5>
                        <div className="fgw-seg" role="radiogroup" aria-label="Conexión con otra fase">
                            <button type="button" role="radio" aria-checked={!connected} className={!connected ? 'is-on' : ''} onClick={() => setConnected(false)}>No, es independiente</button>
                            <button type="button" role="radio" aria-checked={connected} disabled={phases.length === 0} className={connected ? 'is-on' : ''} onClick={() => setConnected(true)}>Sí, viene de otra</button>
                        </div>
                        {phases.length === 0 && <p className="fgw-hint">Todavía no hay otras fases en el torneo.</p>}
                        {connected && (
                            <>
                                <label className="fgw-wide"><span>Fase de origen</span>
                                    <select className="basalt-input" value={previousId} onChange={(e) => setPreviousId(e.target.value)}>
                                        {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select></label>
                                {type === 'playoff' ? (
                                    <p className="fgw-hint">Al crearla vas a poder definir cuántos clasifican de cada zona y cómo se cruzan, en el constructor de llaves de la fase.</p>
                                ) : (
                                    <label className="operation-toggle"><input type="checkbox" checked={carryOver} onChange={(e) => setCarryOver(e.target.checked)} /><span>Arrastrar los puntos de la tabla de {previous?.name ?? 'la fase anterior'}</span></label>
                                )}
                            </>
                        )}
                    </>
                )}

                {step === 3 && (
                    <>
                        <h5>Listo para crear</h5>
                        <ul className="fgw-zones">
                            <li><b>Fase</b> {name} · {TYPES.find((t) => t.value === type)?.title}</li>
                            {type === 'group_stage' && <li><b>Zonas</b> {zoneNames.join(' · ')}</li>}
                            {type === 'playoff' ? <li><b>Cuadro</b> {bracketTeams} equipos</li> : <li><b>Cruces</b> {legs === 1 ? 'una vez' : 'ida y vuelta'}</li>}
                            <li><b>Viene de</b> {connected && previous ? previous.name : 'ninguna, es independiente'}</li>
                        </ul>
                        <p className="fgw-hint">Puntos y desempates salen del deporte del torneo y se pueden ajustar en la fase. Después cargás los equipos y generás el fixture.</p>
                    </>
                )}
            </div>

            {(blocker || error) && <p className="fgw-warn" role="alert">{error ?? blocker}</p>}

            <footer className="fgw-foot">
                <button type="button" className="basalt-btn" disabled={busy} onClick={step === 0 ? onCancel : () => setStep(step - 1)}><ArrowLeft size={15} />{step === 0 ? 'Cancelar' : 'Atrás'}</button>
                {step < 3 ? (
                    <button type="button" className="basalt-btn basalt-btn-primary" disabled={!canGoNext} onClick={() => setStep(step + 1)}>Siguiente<ArrowRight size={15} /></button>
                ) : (
                    <button type="button" className="basalt-btn basalt-btn-primary" disabled={busy} onClick={() => void create()}>
                        {busy ? <RefreshCw size={15} className="spin" /> : <Check size={15} />}Crear fase
                    </button>
                )}
            </footer>
        </section>
    );
}
