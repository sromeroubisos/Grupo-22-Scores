'use client';

import { useMemo, useState } from 'react';
import {
    LINEUP_POLICIES,
    TRAINING_FOCUSES,
    TRAINING_LOADS,
    TRAMOS,
    competitionName,
    getClub,
    planOf,
    seasonFixture,
    totalRounds,
    tramoRange,
    upcomingKeyRival,
    weekEffect,
    xvFatigueOf,
    type CoachState,
    type LineupPolicy,
    type TrainingFocus,
    type TrainingLoad,
    type TrainingPlan,
} from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import styles from './entrenador.module.css';

const DAY_NAMES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

const FOCUS_LABEL: Record<TrainingFocus, string> = {
    'scrum-line': 'Scrum y line',
    defensa: 'Defensa',
    ataque: 'Ataque',
    fisico: 'Físico',
    recuperacion: 'Recuperación',
};

function signed(v: number, digits = 1): string {
    const txt = Math.abs(v).toFixed(digits).replace('.', ',');
    return v > 0 ? `+${txt}` : v < 0 ? `−${txt}` : txt;
}

/** Un grupo de opciones excluyentes, accesible: radiogroup con aria-checked. */
function Choice<T extends string>({
    label,
    options,
    value,
    onChange,
    compact,
}: {
    label: string;
    options: readonly { id: T; label: string; hint?: string }[];
    value: T;
    onChange: (v: T) => void;
    compact?: boolean;
}) {
    return (
        <div className={compact ? styles.segRow : styles.segRowWide} role="radiogroup" aria-label={label}>
            {options.map((o) => (
                <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={value === o.id}
                    className={`${styles.seg} ${value === o.id ? styles.segOn : ''}`}
                    onClick={() => onChange(o.id)}
                    title={o.hint}
                >
                    <span className={styles.segLabel}>{o.label}</span>
                    {!compact && o.hint && <span className={styles.segHint}>{o.hint}</span>}
                </button>
            ))}
        </div>
    );
}

/**
 * Minijuego 1: la semana de entrenamiento antes de las fechas del tramo.
 *
 * Cinco días con carga y foco, y la política del XV para el tramo. La vista
 * previa sale de la MISMA cuenta que aplica el motor (`weekEffect`): lo que se
 * lee acá es lo que pasa. "Simular el tramo" usa la semana fija (o la de siempre)
 * y juega el tramo sin más preguntas, partido clave incluido.
 */
export default function TrainingWeek({
    state,
    onSubmit,
    onSimulate,
}: {
    state: CoachState;
    onSubmit: (plan: TrainingPlan, fix: boolean) => void;
    onSimulate: () => void;
}) {
    const ins = state.inSeason;
    const [plan, setPlan] = useState<TrainingPlan>(() => planOf(state.trainingDefault));
    const [fix, setFix] = useState(false);
    const key = useMemo(() => upcomingKeyRival(state), [state]);
    const fatigue = useMemo(() => xvFatigueOf(state), [state]);
    const range = useMemo(() => tramoRange(totalRounds(seasonFixture(state)), ins?.tramo ?? 0), [state, ins?.tramo]);
    const effect = weekEffect(plan, key?.weakness ?? null);
    if (!ins) return null;

    const rival = key ? getClub(key.rivalId) : null;
    const injured = state.squad.filter((p) => p.injury > 0).sort((a, b) => b.injury - a.injury || a.number - b.number);
    const setDay = (i: number, patch: Partial<{ load: TrainingLoad; focus: TrainingFocus }>) =>
        setPlan((p) => ({ ...p, days: p.days.map((d, j) => (j === i ? { ...d, ...patch } : d)) }));
    const fixedLabel = state.trainingDefault ? 'con tu semana fija' : 'con la semana de siempre';

    return (
        <article className={styles.eventCard}>
            <div className={styles.eventHead}>
                <span className={styles.eventFamily}>Semana de entrenamiento</span>
                <span className={styles.eventStep}>
                    Tramo {ins.tramo + 1} de {TRAMOS}
                </span>
            </div>
            <h2 className={styles.eventTitle}>
                Fechas {range.from} a {range.to} de {competitionName(state.competitionId)}
            </h2>

            <div className={styles.ledger}>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Partido clave</span>
                    <span className={styles.trainRival}>
                        {rival && <ClubCrest club={rival} small />}
                        <span className={styles.ledgerValue}>{rival?.short ?? 'Sin partido clave'}</span>
                    </span>
                    <span className={styles.ledgerHint}>
                        {key ? `Fecha ${key.round}, ${key.home ? 'de local' : 'de visitante'}` : 'El club no juega en el tramo'}
                    </span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Dónde flojea</span>
                    <span className={styles.ledgerValue}>{key ? FOCUS_LABEL[key.weakness] : '—'}</span>
                    <span className={styles.ledgerHint}>Entrenar eso rinde el doble ese día</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Cansancio del XV</span>
                    <span className={`${styles.ledgerValue} ${fatigue > 55 ? styles.negative : ''}`}>{fatigue}</span>
                    <span className={styles.ledgerHint}>Desde 45 se juega peor</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Lesionados</span>
                    <span className={styles.ledgerValue}>{injured.length}</span>
                    <span className={styles.ledgerHint}>
                        {injured.length === 0
                            ? 'Plantel completo'
                            : injured
                                  .slice(0, 3)
                                  .map((p) => `${p.name.split(' ').slice(-1)[0]} (${p.injury})`)
                                  .join(', ')}
                    </span>
                </span>
            </div>

            <p className={styles.optionsLead}>Los cinco días</p>
            <ol className={styles.trainDays}>
                {plan.days.map((day, i) => (
                    <li key={DAY_NAMES[i]} className={styles.trainDay}>
                        <span className={styles.trainDayName}>{DAY_NAMES[i]}</span>
                        <Choice
                            label={`Carga del ${DAY_NAMES[i].toLowerCase()}`}
                            options={TRAINING_LOADS}
                            value={day.load}
                            onChange={(load) => setDay(i, { load })}
                            compact
                        />
                        <Choice
                            label={`Foco del ${DAY_NAMES[i].toLowerCase()}`}
                            options={TRAINING_FOCUSES.map((f) => ({
                                ...f,
                                label: key && f.id === key.weakness ? `${f.label} (flojea)` : f.label,
                            }))}
                            value={day.focus}
                            onChange={(focus) => setDay(i, { focus })}
                            compact
                        />
                    </li>
                ))}
            </ol>

            <p className={styles.optionsLead}>El XV de las fechas del tramo</p>
            <Choice<LineupPolicy>
                label="Cómo se arma el XV"
                options={LINEUP_POLICIES}
                value={plan.lineup}
                onChange={(lineup) => setPlan((p) => ({ ...p, lineup }))}
            />

            <div className={styles.ledger} aria-live="polite">
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Rendimiento del tramo</span>
                    <span className={styles.ledgerValue}>{signed(effect.bonus, 2)}</span>
                    <span className={styles.ledgerHint}>puntos de fuerza en cada fecha</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Extra en el partido clave</span>
                    <span className={styles.ledgerValue}>{signed(effect.keyBonus, 2)}</span>
                    <span className={styles.ledgerHint}>por atacar dónde flojea</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Cansancio de la semana</span>
                    <span className={`${styles.ledgerValue} ${effect.fatigue > 10 ? styles.negative : ''}`}>
                        {signed(effect.fatigue, 0)}
                    </span>
                    <span className={styles.ledgerHint}>a todo el plantel, de entrada</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Riesgo de lesión</span>
                    <span className={`${styles.ledgerValue} ${effect.injuryRisk > 0 ? styles.negative : ''}`}>
                        {signed(effect.injuryRisk * 100, 1)} %
                    </span>
                    <span className={styles.ledgerHint}>por partido, en el tramo</span>
                </span>
            </div>

            <label className={styles.trainFix}>
                <input type="checkbox" checked={fix} onChange={(e) => setFix(e.target.checked)} />
                <span>Dejar esta semana fija: se repite en los próximos tramos y al simular.</span>
            </label>

            <div className={styles.actionBar}>
                <div className={styles.actionRow}>
                    <button type="button" className={styles.ghost} onClick={onSimulate}>
                        Simular el tramo {fixedLabel}
                    </button>
                    <button type="button" className={styles.primary} onClick={() => onSubmit(plan, fix)}>
                        Entrenar así y jugar
                        <span className={styles.primaryHint}>
                            {key ? 'Las fechas hasta el partido clave' : 'Las fechas del tramo'}
                        </span>
                    </button>
                </div>
            </div>
        </article>
    );
}
