import {
    COST_CUTS,
    STATUS_LABEL,
    activeCuts,
    advanceOffer,
    benefitOffer,
    budgetOf,
    debtState,
    fechasOf,
    financeActionBlock,
    formatMoney,
    loanOffer,
    statusOf,
    type CoachState,
    type DebtStatus,
    type FinanceAction,
} from '../../../../features/coach/index.ts';
import styles from './entrenador.module.css';

interface Segment {
    label: string;
    value: number;
    color: string;
    hint: string;
}

const DEBT_TITLE: Record<DebtStatus, string> = {
    sana: 'La caja está sana',
    ajustada: 'La caja está ajustada',
    complicada: 'La deuda está complicada',
    grave: 'La deuda es grave',
    cronica: 'Deuda crónica: el club está intervenido',
};

function StackedBar({ title, total, segments }: { title: string; total: number; segments: Segment[] }) {
    return (
        <div className={styles.stack}>
            <div className={styles.stackHead}>
                <span className={styles.stackTitle}>{title}</span>
                <span className={styles.stackTotal}>{formatMoney(total)}</span>
            </div>
            <div className={styles.stackBar} aria-hidden="true">
                {segments.map((s) => (
                    <span
                        key={s.label}
                        className={styles.stackSeg}
                        style={{ width: `${(s.value / Math.max(1, total)) * 100}%`, background: s.color }}
                        title={`${s.label}: ${formatMoney(s.value)}`}
                    />
                ))}
            </div>
            <ul className={styles.stackLegend}>
                {segments.map((s) => (
                    <li key={s.label} className={styles.stackItem}>
                        <span className={styles.legendDot} style={{ background: s.color }} />
                        <span className={styles.stackItemLabel}>
                            {s.label}
                            <span className={styles.stackItemHint}>{s.hint}</span>
                        </span>
                        <span className={styles.stackItemValue}>{formatMoney(s.value)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Un botón de la caja: qué hace, cuánto cuesta, y por qué no se puede si no se puede. */
function ActionCard({
    title,
    text,
    cost,
    button,
    block,
    done,
    onClick,
}: {
    title: string;
    text: string;
    cost: string;
    button: string;
    block: string | null;
    done: string | null;
    onClick: () => void;
}) {
    return (
        <li className={styles.upgradeCard}>
            <div className={styles.upgradeHead}>
                <span className={styles.upgradeName}>{title}</span>
            </div>
            <p className={styles.upgradeText}>{text}</p>
            <p className={styles.upgradeEffect}>{cost}</p>
            {done ? (
                <p className={styles.upgradeDone}>{done}</p>
            ) : (
                <>
                    <button type="button" className={styles.upgradeBuy} disabled={block !== null} onClick={onClick}>
                        {button}
                    </button>
                    {block && <p className={styles.disabledNote}>{block}</p>}
                </>
            )}
        </li>
    );
}

/**
 * La caja explicada: de dónde entra la plata y a dónde se va, como lo cuenta un
 * tesorero de club; el estado de la deuda con lo que implica; y las cuatro
 * herramientas para salir del rojo, cada una con su costo a la vista. Todos los
 * números salen del motor (`budgetOf`, `debtState`): la pantalla no copia una
 * sola constante.
 */
export default function BudgetBoard({
    state,
    onFinance,
}: {
    state: CoachState;
    onFinance: (action: FinanceAction) => void;
}) {
    const fin = state.club.finances;
    const caja = fin.caja;
    const budget = budgetOf(state);
    const debt = debtState(state);
    const closing = caja + budget.resultado;
    const status = statusOf(state.competitionId);
    const fechas = fechasOf(state.competitionId, state.year);
    const cuts = activeCuts(state);
    const f = state.finance;

    // Cuánto cuesta UN viaje al Interior: se mide con el motor, no se copia una constante.
    const withTrip = budgetOf(state, { partidosCopa: 1, bancoCorto: false });
    const shortTrip = budgetOf(state, { partidosCopa: 1, bancoCorto: true });
    const noTrip = budgetOf(state, { partidosCopa: 0, bancoCorto: false });
    const tripCost = withTrip.egresos - noTrip.egresos;
    const shortSaving = withTrip.egresos - shortTrip.egresos;

    const income: Segment[] = [
        { label: 'Cuotas', value: budget.cuotas, color: '#2563eb', hint: `${fin.socios} socios` },
        { label: 'Buffet', value: budget.buffet, color: '#0891b2', hint: 'tercer tiempo, choripán, rifa' },
        {
            label: 'Sponsors',
            value: budget.sponsors,
            color: '#7c3aed',
            hint: debt.restrictions.sponsorPenalty ? 'un 10 % menos por la deuda' : 'sube con la gente y con tu gestión',
        },
        { label: 'Entradas', value: budget.entradas, color: '#0d9488', hint: `${Math.floor(fechas / 2)} partidos de local` },
        { label: 'Subsidio', value: budget.subsidio, color: '#64748b', hint: 'la unión da más cuanto más abajo estás' },
        ...(budget.aporteSubcomision > 0
            ? [{ label: 'Aporte de la subcomisión', value: budget.aporteSubcomision, color: '#15803d', hint: 'por los objetivos del año pasado' }]
            : []),
        // El renglón del mercado (etapa 3): lo que dejaron los que se fueron. Es
        // la suma del año, no la de un jugador: en el amateur y los viáticos la
        // ayuda simbólica del exterior aparece acá y en ningún otro lado.
        ...(budget.compensaciones > 0
            ? [{
                  label: 'Compensaciones',
                  value: budget.compensaciones,
                  color: '#0369a1',
                  hint: status === 'semipro' ? 'por los jugadores que se fueron' : 'ayudas de clubes del exterior',
              }]
            : []),
    ];
    const expenses: Segment[] = [
        { label: 'Categorías', value: budget.categorias, color: '#dc2626', hint: 'M19, intermedia, femenino' },
        {
            label: 'Sueldos',
            value: budget.sueldos,
            color: '#be123c',
            hint: status === 'amateur' ? 'las becas' : status === 'viaticos' ? 'viáticos y becas' : 'contratos y becas',
        },
        { label: 'Cuerpo técnico', value: budget.cuerpoTecnico, color: '#9f1239', hint: `staff de primera, ${STATUS_LABEL[status].toLowerCase()}` },
        {
            label: 'Estructura',
            value: budget.estructuraCosto,
            color: '#ea580c',
            hint: cuts.includes('mantenimiento') ? 'con el mantenimiento diferido' : 'canchas, gimnasio, sede',
        },
        ...(budget.mantenimientoMejoras > 0
            ? [{ label: 'Mantenimiento de mejoras', value: budget.mantenimientoMejoras, color: '#c2410c', hint: 'lo que se compró no es gratis' }]
            : []),
        { label: 'Indumentaria', value: budget.indumentaria, color: '#f59e0b', hint: 'dos juegos de camisetas' },
        { label: 'Sanidad', value: budget.sanidad, color: '#ca8a04', hint: 'botiquín, kinesiología, seguro' },
        { label: 'Arbitrajes', value: budget.arbitrajes, color: '#84cc16', hint: `${fechas} fechas` },
        {
            label: 'Viajes de liga',
            value: budget.viajesLiga,
            color: '#16a34a',
            hint: cuts.includes('viajes') ? 'viajando con 22' : 'la mitad de las fechas afuera',
        },
        ...(budget.intereses > 0
            ? [{ label: 'Intereses', value: budget.intereses, color: '#475569', hint: 'del descubierto y del préstamo' }]
            : []),
        ...(budget.amortizacion > 0
            ? [{ label: 'Cuota del préstamo', value: budget.amortizacion, color: '#334155', hint: 'el capital que se devuelve' }]
            : []),
        ...(budget.recorteSubcomision > 0
            ? [{ label: 'Recorte de la subcomisión', value: budget.recorteSubcomision, color: '#7f1d1d', hint: 'por los objetivos del año pasado' }]
            : []),
        ...(budget.indemnizaciones > 0
            ? [{ label: 'Contratos liberados', value: budget.indemnizaciones, color: '#57534e', hint: 'seis meses a cada uno' }]
            : []),
    ];

    const loan = loanOffer(state);
    const advance = advanceOffer(state);
    const benefit = benefitOffer(state);

    return (
        <div className={styles.budgetBoard}>
            <div className={styles.squadStats}>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Caja hoy</span>
                    <span className={`${styles.ledgerValue} ${caja < 0 ? styles.negative : ''}`}>{formatMoney(caja)}</span>
                    <span className={styles.ledgerHint}>{debt.months > 0 ? `${debt.months} meses de deuda` : 'sin deuda'}</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Balance del año</span>
                    <span className={`${styles.ledgerValue} ${budget.resultado < 0 ? styles.negative : ''}`}>
                        {budget.resultado >= 0 ? '+' : ''}
                        {formatMoney(budget.resultado)}
                    </span>
                    <span className={styles.ledgerHint}>sin contar el Interior</span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Caja al cierre</span>
                    <span className={`${styles.ledgerValue} ${closing < 0 ? styles.negative : ''}`}>{formatMoney(closing)}</span>
                    <span className={styles.ledgerHint}>si no pasa nada raro</span>
                </span>
            </div>

            <div className={styles.callout} role="status">
                <span className={styles.calloutTitle}>
                    {DEBT_TITLE[debt.status]}
                    {debt.graveStreak > 0 ? ` · ${debt.graveStreak} ${debt.graveStreak === 1 ? 'cierre' : 'cierres'} seguidos en grave` : ''}
                </span>
                <ul className={styles.noteList}>
                    {debt.lines.map((line) => (
                        <li key={line} className={debt.status === 'sana' ? styles.noteOk : styles.noteWarn}>
                            {line}
                        </li>
                    ))}
                </ul>
            </div>

            <div className={styles.stacks}>
                <StackedBar title="Entra" total={budget.ingresos} segments={income} />
                <StackedBar title="Sale" total={budget.egresos} segments={expenses} />
            </div>
            <p className={styles.objectiveNote}>
                {status === 'amateur'
                    ? 'Los que se van del club no dejan plata: en el amateur no hay pase. Si un club profesional del exterior se lleva a alguien, deja una ayuda que entra al cierre.'
                    : status === 'viaticos'
                      ? 'Con viáticos no hay pase: el que se va no deja compensación, salvo la ayuda de un club profesional del exterior, que entra al cierre.'
                      : 'Las compensaciones por los jugadores que se van entran al cierre del año, con el resto de lo que entra.'}
            </p>
            {budget.cuotasAdelantadas > 0 && (
                <p className={styles.objectiveNote}>
                    Este año entran {formatMoney(budget.cuotasAdelantadas)} menos de cuotas: se cobraron por adelantado la
                    temporada pasada.
                </p>
            )}
            {f.loan && (
                <p className={styles.objectiveNote}>
                    Préstamo de la unión: quedan {formatMoney(f.loan.balance)} de capital y {f.loan.seasonsLeft}{' '}
                    {f.loan.seasonsLeft === 1 ? 'cuota' : 'cuotas'} de {formatMoney(f.loan.payment)}.
                </p>
            )}

            <h3 className={styles.panelTitle}>Para salir del rojo</h3>
            <p className={styles.objectiveNote}>
                Se usan en la pretemporada y todo lo que se elige queda en la caja del club: nada es gratis.
            </p>
            <ul className={styles.upgradeGrid}>
                <ActionCard
                    title="Préstamo de la unión"
                    text={`La unión presta ${formatMoney(loan.amount)} ahora. Se devuelve en ${loan.seasons} cuotas anuales de ${formatMoney(loan.payment)}.`}
                    cost={`Interés del ${Math.round(loan.rate * 100)} % anual: en total se devuelven ${formatMoney(loan.total)}. La primera cuota sale de esta temporada.`}
                    button={`Pedir ${formatMoney(loan.amount)}`}
                    block={financeActionBlock(state, 'prestamo')}
                    done={null}
                    onClick={() => onFinance('prestamo')}
                />
                <ActionCard
                    title="Adelantar cuotas"
                    text={`Se cobran ya ${formatMoney(advance.amount)} de las cuotas del año que viene.`}
                    cost={`El año que viene entran ${formatMoney(advance.amount)} menos de cuotas, se van ${advance.sociosLost} socios que no quieren pagar por adelantado y la gente se enfría (−${advance.hinchadaLost}).`}
                    button={`Adelantar ${formatMoney(advance.amount)}`}
                    block={financeActionBlock(state, 'adelanto')}
                    done={f.duesAdvances.some((a) => a.season === state.season) ? 'Adelantadas este año' : null}
                    onClick={() => onFinance('adelanto')}
                />
                <ActionCard
                    title="Evento a beneficio"
                    text={`Una cena y una rifa grande. Con ${fin.socios} socios y la gente en ${fin.hinchada}, rinde ${formatMoney(benefit.amount)}.`}
                    cost={`Una vez por temporada. Pedirle plata a la gente cansa: −${benefit.hinchadaLost} de acompañamiento.`}
                    button={`Organizarlo · ${formatMoney(benefit.amount)}`}
                    block={financeActionBlock(state, 'beneficio')}
                    done={f.benefit?.season === state.season ? `Hecho: rindió ${formatMoney(f.benefit.amount)}` : null}
                    onClick={() => onFinance('beneficio')}
                />
                {COST_CUTS.map((c) => (
                    <ActionCard
                        key={c.id}
                        title={c.label}
                        text={c.text}
                        cost={c.cost}
                        button="Aplicar el recorte"
                        block={financeActionBlock(state, c.id)}
                        done={cuts.includes(c.id) ? 'Aplicado esta temporada' : null}
                        onClick={() => onFinance(c.id)}
                    />
                ))}
            </ul>

            <div className={styles.callout}>
                <span className={styles.calloutTitle}>El micro al Interior</span>
                <span className={styles.calloutText}>
                    Cada fin de semana de Torneo del Interior cuesta {formatMoney(tripCost)} con los 26. Viajar
                    con 22 ahorra {formatMoney(shortSaving)} y deja el banco sin primera línea de recambio. Una
                    campaña hasta semifinales son tres viajes.
                </span>
            </div>
        </div>
    );
}
