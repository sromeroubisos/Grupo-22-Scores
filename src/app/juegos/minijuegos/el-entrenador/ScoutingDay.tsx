'use client';

import {
    estimateOf,
    finishScouting,
    observeBlock,
    observeCandidate,
    scoutSignBlock,
    signScout,
    type CoachState,
    type PositionGroup,
    type ScoutCandidate,
    type ScoutingDay as Day,
} from '../../../../features/coach/index.ts';
import styles from './entrenador.module.css';

export const GROUP_LABEL: Record<PositionGroup, string> = {
    'primera-linea': 'Primera línea',
    'segunda-linea': 'Segunda línea',
    'tercera-linea': 'Tercera línea',
    medios: 'Medio',
    centros: 'Centro',
    fondo: 'Fondo',
};

/**
 * El rango estimado del techo sobre una escala de 0 a 100, y la marca del nivel
 * de hoy si se conoce. Es lo único que el club sabe del techo: el real no se
 * muestra nunca.
 */
export function RangeBar({ min, max, level, label }: { min: number; max: number; level: number | null; label: string }) {
    const lo = Math.max(0, Math.min(100, min));
    const hi = Math.max(lo, Math.min(100, max));
    return (
        <span className={styles.rangeBar} role="img" aria-label={label}>
            <span className={styles.rangeFill} style={{ left: `${lo}%`, width: `${Math.max(1, hi - lo)}%` }} />
            {level !== null && <span className={styles.rangeLevel} style={{ left: `${Math.max(0, Math.min(99, level))}%` }} />}
        </span>
    );
}

function Action({ label, block, onClick, ghost = false }: { label: string; block: string | null; onClick: () => void; ghost?: boolean }) {
    return (
        <span className={styles.marketAction}>
            <button type="button" className={ghost ? styles.ghost : styles.upgradeBuy} disabled={!!block} onClick={onClick}>
                {label}
            </button>
            {block && <span className={styles.disabledNote}>{block}</span>}
        </span>
    );
}

function CandidateCard({
    state,
    day,
    c,
    onChange,
}: {
    state: CoachState;
    day: Day;
    c: ScoutCandidate;
    onChange: (s: CoachState) => void;
}) {
    const signed = day.signed.includes(c.id);
    const { min, max } = estimateOf(c);
    const seen = c.observed > 0;
    return (
        <li className={styles.marketCard}>
            <div className={styles.upgradeHead}>
                <span className={styles.upgradeName}>{c.name}</span>
                {signed ? (
                    <span className={styles.chanceBadge}>Se sumó</span>
                ) : (
                    <span className={styles.academyTag}>
                        {c.observed === 0 ? 'Sin observar' : `Observado ${c.observed} ${c.observed === 1 ? 'vez' : 'veces'}`}
                    </span>
                )}
            </div>
            <p className={styles.upgradeText}>
                {GROUP_LABEL[c.group]}, {c.age} años{seen ? `, nivel ${Math.round(c.level)} hoy` : ''}.
            </p>
            <p className={styles.upgradeEffect}>{c.hint}</p>
            <RangeBar
                min={min}
                max={max}
                level={seen ? c.level : null}
                label={`Techo estimado entre ${min} y ${max}${seen ? `, nivel de hoy ${Math.round(c.level)}` : ''}`}
            />
            <p className={styles.upgradeText}>
                Techo estimado entre {min} y {max}.{!seen ? ' Observarlo angosta el rango y deja ver su nivel.' : ''}
            </p>
            {!signed && (
                <div className={styles.marketActions}>
                    <Action label="Observarlo (1 punto)" block={observeBlock(state, c.id)} onClick={() => onChange(observeCandidate(state, c.id))} />
                    <Action label="Sumarlo al M19" block={scoutSignBlock(state, c.id)} onClick={() => onChange(signScout(state, c.id))} />
                </div>
            )}
        </li>
    );
}

/**
 * Minijuego 4, la jornada de captación. Una tanda de chicos con lo que se ve de
 * ellos en una tarde: puesto, edad, una pista y un rango ancho de hasta dónde
 * pueden llegar. Los puntos de observación son pocos: mirar a uno de cerca
 * angosta su rango a la mitad. Se suman hasta tres, si hay lugar en el M19.
 */
export default function ScoutingDay({
    state,
    day,
    onChange,
}: {
    state: CoachState;
    day: Day;
    onChange: (s: CoachState) => void;
}) {
    const left = day.picksMax - day.signed.length;
    return (
        <div className={styles.market}>
            <div className={styles.ledger}>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Puntos de observación</span>
                    <span className={styles.ledgerValue}>
                        {day.points} de {day.pointsMax}
                    </span>
                    <span className={styles.ledgerHint}>salen de tu formación, la estructura y el entrenador del M19</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Para sumar</span>
                    <span className={styles.ledgerValue}>{left}</span>
                    <span className={styles.ledgerHint}>
                        de {day.picksMax} · M19 con {state.academy.players.length}
                    </span>
                </span>
            </div>
            <p className={styles.objectiveNote}>
                Lo que se ve en una tarde no es lo que va a ser. El rango dice hasta dónde puede llegar cada uno; llegar
                depende del plan, de los años y de él. Una joya aparece muy de vez en cuando, y tampoco tiene nada
                asegurado.
            </p>
            <ul className={styles.marketList}>
                {day.candidates.map((c) => (
                    <CandidateCard key={c.id} state={state} day={day} c={c} onChange={onChange} />
                ))}
            </ul>
            <div className={styles.marketActions}>
                <button type="button" className={styles.upgradeBuy} onClick={() => onChange(finishScouting(state))}>
                    {day.points > 0
                        ? `Terminar la jornada (${day.points === 1 ? 'queda 1 punto' : `quedan ${day.points} puntos`} sin usar)`
                        : 'Terminar la jornada'}
                </button>
                <span className={styles.disabledNote}>
                    {day.points > 0 ? 'Los puntos que no uses se pierden.' : 'No quedan puntos de observación.'}
                    {left > 0 ? ` Podés sumar ${left === 1 ? 'uno más' : `${left} más`}.` : ''}
                </span>
            </div>
        </div>
    );
}
