'use client';

import {
    ACADEMY_MAX,
    ACADEMY_MIN,
    DEV_PLANS,
    SQUAD_MAX,
    academyNews,
    currentScouting,
    estimateOf,
    getClub,
    loanKid,
    loanKidBlock,
    promoteBlock,
    promoteKid,
    releaseKid,
    releaseKidBlock,
    rosterSize,
    setDevPlan,
    toggleReserve,
    type AcademyPlayer,
    type CoachState,
    type DevPlan,
} from '../../../../features/coach/index.ts';
import ScoutingDay, { GROUP_LABEL, RangeBar } from './ScoutingDay.tsx';
import styles from './entrenador.module.css';

const PERSONALITY_LABEL: Record<AcademyPlayer['personality'], string> = {
    lider: 'líder',
    profesional: 'profesional',
    ambicioso: 'ambicioso',
    leal: 'leal',
    conflictivo: 'conflictivo',
    tranquilo: 'tranquilo',
};

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

/** El plan de desarrollo, como radiogroup con aria-checked. */
function PlanChoice({ kid, onPick, disabled }: { kid: AcademyPlayer; onPick: (p: DevPlan) => void; disabled: boolean }) {
    return (
        <div className={styles.segRowWide} role="radiogroup" aria-label={`Plan de desarrollo de ${kid.name}`}>
            {DEV_PLANS.map((p) => (
                <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={kid.plan === p.id}
                    disabled={disabled}
                    className={`${styles.seg} ${kid.plan === p.id ? styles.segOn : ''}`}
                    onClick={() => onPick(p.id)}
                    title={p.hint}
                >
                    <span className={styles.segLabel}>{p.label}</span>
                    <span className={styles.segHint}>{p.hint}</span>
                </button>
            ))}
        </div>
    );
}

function KidCard({ state, kid, onChange }: { state: CoachState; kid: AcademyPlayer; onChange: (s: CoachState) => void }) {
    const { min, max } = estimateOf(kid);
    const loanClub = kid.loanClubId ? (getClub(kid.loanClubId)?.short ?? 'un club de abajo') : null;
    const lastYear = kid.age >= 19;
    return (
        <li className={styles.marketCard}>
            <div className={styles.upgradeHead}>
                <span className={styles.upgradeName}>{kid.name}</span>
                {loanClub ? (
                    <span className={styles.academyTag}>Cedido</span>
                ) : kid.reserve ? (
                    <span className={styles.chanceBadge}>Reservado para primera</span>
                ) : lastYear ? (
                    <span className={styles.academyTag}>Último año</span>
                ) : null}
            </div>
            <p className={styles.upgradeText}>
                {GROUP_LABEL[kid.group]}, {kid.age} años, nivel {Math.round(kid.level)} · {PERSONALITY_LABEL[kid.personality]}
                {loanClub ? ` · cedido a ${loanClub}` : ''}.
            </p>
            <RangeBar
                min={min}
                max={max}
                level={kid.level}
                label={`Techo estimado entre ${min} y ${max}, nivel de hoy ${Math.round(kid.level)}`}
            />
            <p className={styles.upgradeText}>
                Techo estimado entre {min} y {max}. El rango se afina con cada año en el club.
            </p>
            <PlanChoice kid={kid} disabled={false} onPick={(p) => onChange(setDevPlan(state, kid.id, p))} />
            <div className={styles.marketActions}>
                <Action label="Subirlo a primera" block={promoteBlock(state, kid.id)} onClick={() => onChange(promoteKid(state, kid.id))} />
                {!loanClub && (
                    <Action
                        label={kid.reserve ? 'Sacarle la reserva' : 'Reservarlo para el cierre'}
                        block={null}
                        onClick={() => onChange(toggleReserve(state, kid.id))}
                    />
                )}
                <Action label="Cederlo por el año" block={loanKidBlock(state, kid.id)} onClick={() => onChange(loanKid(state, kid.id))} />
                <Action ghost label="Liberarlo" block={releaseKidBlock(state, kid.id)} onClick={() => onChange(releaseKid(state, kid.id))} />
            </div>
        </li>
    );
}

/**
 * La pestaña M19 de la pretemporada: la jornada de captación si está abierta,
 * lo que pasó al cierre, y los pibes con su rango estimado, su plan y las
 * decisiones. El techo real de cada uno no aparece en ningún lado.
 */
export default function AcademyBoard({ state, onChange }: { state: CoachState; onChange: (s: CoachState) => void }) {
    const day = currentScouting(state);
    const news = academyNews(state);
    const players = state.academy.players;
    const roster = rosterSize(state);
    return (
        <div className={styles.market}>
            <div className={styles.ledger}>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>M19</span>
                    <span className={styles.ledgerValue}>{players.length}</span>
                    <span className={styles.ledgerHint}>
                        entre {ACADEMY_MIN} y {ACADEMY_MAX} · no cuentan para el plantel
                    </span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Plantel</span>
                    <span className={styles.ledgerValue}>
                        {roster} de {SQUAD_MAX}
                    </span>
                    <span className={styles.ledgerHint}>
                        {roster >= SQUAD_MAX ? 'para subir a uno hay que liberar a otro' : 'hay lugar para subir'}
                    </span>
                </span>
            </div>

            {news.length > 0 && (
                <div className={styles.callout} role="status">
                    <span className={styles.calloutTitle}>El M19 este año</span>
                    <ul className={styles.marketReasons}>
                        {news.slice(-8).map((e, i) => (
                            <li key={`${i}-${e.text}`}>{e.text}</li>
                        ))}
                    </ul>
                </div>
            )}

            {day && (
                <>
                    <h3 className={styles.marketTitle}>La jornada de captación</h3>
                    <ScoutingDay state={state} day={day} onChange={onChange} />
                </>
            )}

            <h3 className={styles.marketTitle}>Los pibes</h3>
            <p className={styles.objectiveNote}>
                A los 20 dejan el M19: al cierre del año, si hay lugar en el plantel suben, y si no, se van. Los
                reservados cubren primero los lugares que dejen los que se retiran. Si todavía falta gente, suben solos
                los mejores de 18 o más.
            </p>
            <ul className={styles.marketList}>
                {players.map((k) => (
                    <KidCard key={k.id} state={state} kid={k} onChange={onChange} />
                ))}
            </ul>
        </div>
    );
}
