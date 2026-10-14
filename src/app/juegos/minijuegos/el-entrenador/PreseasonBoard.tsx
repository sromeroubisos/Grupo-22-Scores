'use client';

import { useState } from 'react';
import {
    DECISIONS_PER_SEASON,
    INITIAL_PRESSURE,
    budgetOf,
    currentScouting,
    fechasOf,
    formatMoney,
    getClub,
    expiringPlayers,
    getCompetition,
    statusOf,
    teamRating,
    type CoachState,
    type FinanceAction,
    type ObjectiveAxis,
    type SquadPlayer,
    type UpgradeId,
} from '../../../../features/coach/index.ts';
import AcademyBoard from './AcademyBoard.tsx';
import BudgetBoard from './BudgetBoard.tsx';
import CompetitionBoard from './CompetitionBoard.tsx';
import JobOffersBoard from './JobOffersBoard.tsx';
import MarketBoard from './MarketBoard.tsx';
import SeasonTimeline from './SeasonTimeline.tsx';
import SquadBoard from './SquadBoard.tsx';
import UpgradesBoard from './UpgradesBoard.tsx';
import styles from './entrenador.module.css';

type Tab = 'resumen' | 'plantel' | 'm19' | 'mercado' | 'caja' | 'club' | 'torneo' | 'ofertas' | 'trayectoria';

const TABS: { id: Tab; label: string }[] = [
    { id: 'resumen', label: 'Resumen' },
    { id: 'plantel', label: 'Plantel' },
    { id: 'm19', label: 'M19' },
    { id: 'mercado', label: 'Mercado' },
    { id: 'caja', label: 'Caja' },
    { id: 'club', label: 'Club' },
    { id: 'torneo', label: 'Torneo' },
    { id: 'ofertas', label: 'Ofertas' },
    { id: 'trayectoria', label: 'Trayectoria' },
];

const AXIS_LABEL: Record<ObjectiveAxis, string> = {
    deportivo: 'Deportivo',
    secundario: 'Secundario',
    formativo: 'Formativo',
    economico: 'Económico',
};

function levelWord(v: number, words: [string, string, string]): string {
    return v >= 65 ? words[2] : v >= 40 ? words[1] : words[0];
}

/**
 * La pretemporada como tablero. Lo primero es lo que te piden; después, cada
 * pestaña es una pregunta que un entrenador se hace antes de arrancar: con qué
 * plantel, con qué plata, contra quién, y de dónde vengo.
 */
/** Lo que le pasó al plantel al cerrar el año. Lo calcula `CoachFlow`, no se guarda. */
export interface SquadChanges {
    retired: SquadPlayer[];
    promoted: SquadPlayer[];
    grown: { player: SquadPlayer; delta: number }[];
    declined: { player: SquadPlayer; delta: number }[];
}

function surname(name: string): string {
    const parts = name.trim().split(' ');
    return parts[parts.length - 1];
}

function SquadChangesNote({ changes }: { changes: SquadChanges }) {
    const lines: string[] = [];
    if (changes.retired.length > 0) {
        lines.push(`Colgaron los botines ${changes.retired.map((p) => `${surname(p.name)} (${p.age + 1})`).join(', ')}.`);
    }
    if (changes.promoted.length > 0) {
        lines.push(`Subieron del M19 ${changes.promoted.map((p) => `${surname(p.name)} (${p.age}, nivel ${Math.round(p.level)})`).join(', ')}.`);
    }
    if (changes.grown.length > 0) {
        lines.push(
            `Crecieron ${changes.grown.slice(0, 4).map((g) => `${surname(g.player.name)} +${g.delta}`).join(', ')}${changes.grown.length > 4 ? ` y ${changes.grown.length - 4} más` : ''}.`,
        );
    }
    if (changes.declined.length > 0) {
        lines.push(`Aflojaron ${changes.declined.slice(0, 3).map((d) => `${surname(d.player.name)} ${d.delta}`).join(', ')}.`);
    }
    if (lines.length === 0) lines.push('El plantel pasó el verano sin novedades.');
    return (
        <div className={styles.callout}>
            <span className={styles.calloutTitle}>El plantel en la pretemporada</span>
            <span className={styles.calloutText}>{lines.join(' ')}</span>
        </div>
    );
}

export default function PreseasonBoard({
    state,
    squadChanges = null,
    onStart,
    onBuy,
    onAcceptOffer,
    onDeclineOffer,
    onFinance,
    onMarket,
    onAcademy,
}: {
    state: CoachState;
    squadChanges?: SquadChanges | null;
    onStart: () => void;
    /** Comprar una mejora del club. Solo se puede en la pretemporada. */
    onBuy: (id: UpgradeId) => void;
    /** Firmar con el club de una propuesta. */
    onAcceptOffer: (clubId: string) => void;
    onDeclineOffer: (clubId: string) => void;
    /** Préstamo, adelanto, evento a beneficio o un recorte. Solo en la pretemporada. */
    onFinance: (action: FinanceAction) => void;
    /** Una decisión del mercado de jugadores: el motor ya devolvió el estado nuevo. */
    onMarket: (next: CoachState) => void;
    /** Una decisión sobre el M19 o la jornada de captación: el motor ya devolvió el estado nuevo. */
    onAcademy: (next: CoachState) => void;
}) {
    const [tab, setTab] = useState<Tab>('resumen');
    const comp = getCompetition(state.competitionId);
    const fechas = fechasOf(state.competitionId, state.year);
    const offers = state.market.offers;
    const budget = budgetOf(state);
    const project = state.project;
    const last = state.seasons[state.seasons.length - 1];
    const fin = state.club.finances;
    // Lo que espera respuesta en el mercado: ofertas, pedidos y vencimientos.
    const expiring = expiringPlayers(state).length;
    const marketPending = state.transfers.offers.length + state.transfers.requests.length + expiring;
    const scouting = currentScouting(state);

    return (
        <>
            <div className={styles.tabs} role="tablist" aria-label="Pretemporada">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        role="tab"
                        id={`tab-${t.id}`}
                        aria-selected={tab === t.id}
                        aria-controls={`panel-${t.id}`}
                        className={`${styles.tab} ${tab === t.id ? styles.tabActive : ''}`}
                        onClick={() => setTab(t.id)}
                    >
                        {t.label}
                        {t.id === 'mercado' && marketPending > 0 && (
                            <span className={styles.tabCount} aria-label={`${marketPending} temas esperando respuesta`}>
                                {marketPending}
                            </span>
                        )}
                        {t.id === 'm19' && scouting && (
                            <span className={styles.tabCount} aria-label="La jornada de captación está abierta">
                                {scouting.candidates.length}
                            </span>
                        )}
                        {t.id === 'ofertas' && offers.length > 0 && (
                            <span className={styles.tabCount} aria-label={`${offers.length} propuestas`}>
                                {offers.length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            <section className={styles.panel} role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
                {tab === 'resumen' && (
                    <>
                        <h2 className={styles.panelTitle}>
                            Lo que te pide la subcomisión · {fechas} fechas de {comp?.short ?? 'torneo'}
                        </h2>

                        <ul className={styles.boardList} aria-label="Lo que te pide la subcomisión, con su peso">
                            {(state.objectives.length > 0
                                ? state.objectives
                                : [{ id: 'deportivo', axis: 'deportivo' as const, text: state.objective.text, weight: 100 }]
                            ).map((o) => (
                                <li key={o.id} className={`${styles.boardItem} ${o.axis === 'deportivo' ? styles.boardItemMain : ''}`}>
                                    <span className={styles.boardItemHead}>
                                        <span className={styles.boardAxis}>{AXIS_LABEL[o.axis]}</span>
                                        <span className={styles.boardWeight}>{o.weight}%</span>
                                    </span>
                                    <span className={styles.boardText}>{o.text}</span>
                                </li>
                            ))}
                        </ul>
                        <p className={styles.objectiveNote}>
                            Lo deportivo mueve la presión; el resto la corre unos puntos y decide el presupuesto del
                            año que viene: todo cumplido suma un 6 %, nada cumplido lo recorta un 6 %. A 100 de
                            presión te agradecen los servicios.
                        </p>

                        {project && (
                            <div className={styles.callout}>
                                <span className={styles.calloutTitle}>
                                    El proyecto · temporada {state.season - project.fromSeason + 1} de{' '}
                                    {project.deadlineSeason - project.fromSeason + 1}
                                </span>
                                <span className={styles.calloutText}>{project.text}</span>
                                <span
                                    className={styles.projectBar}
                                    role="progressbar"
                                    aria-label="Avance del proyecto"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={Math.round(project.progress * 100)}
                                >
                                    <span className={styles.projectFill} style={{ width: `${Math.round(project.progress * 100)}%` }} />
                                </span>
                                <span className={styles.calloutText}>
                                    Va {Math.round(project.progress * 100)} %. Cumplido: −8 de presión, más presupuesto y
                                    nombre. Vencido sin cumplir: +8 de presión.
                                </span>
                            </div>
                        )}

                        {last && last.clubId === state.clubId && (
                            <div className={styles.callout}>
                                <span className={styles.calloutTitle}>El año pasado</span>
                                <span className={styles.calloutText}>
                                    {last.position}° de {last.teams} en {last.competitionName}. {last.verdict}
                                </span>
                            </div>
                        )}

                        {offers.length > 0 && (
                            <div className={styles.callout} role="status">
                                <span className={styles.calloutTitle}>
                                    {offers.length === 1 ? 'Te llamó un club' : `Te llamaron ${offers.length} clubes`}
                                </span>
                                <span className={styles.calloutText}>
                                    {offers
                                        .map((o) => getClub(o.clubId)?.short ?? o.clubId)
                                        .join(', ')}{' '}
                                    {offers.length === 1 ? 'busca' : 'buscan'} entrenador. Si arrancás la temporada,
                                    las propuestas se caen.{' '}
                                    <button type="button" className={styles.linkButton} onClick={() => setTab('ofertas')}>
                                        Ver las propuestas
                                    </button>
                                </span>
                            </div>
                        )}

                        {squadChanges && <SquadChangesNote changes={squadChanges} />}

                        {marketPending > 0 && (
                            <div className={styles.callout} role="status">
                                <span className={styles.calloutTitle}>La ventana de pases está abierta</span>
                                <span className={styles.calloutText}>
                                    {state.transfers.offers.length > 0
                                        ? `${state.transfers.offers.length} oferta${state.transfers.offers.length === 1 ? '' : 's'} por tus jugadores. `
                                        : ''}
                                    {expiring > 0 ? `${expiring} vínculo${expiring === 1 ? ' vence' : 's vencen'}. ` : ''}
                                    {state.transfers.requests.length > 0 ? `${state.transfers.requests.length} pide${state.transfers.requests.length === 1 ? '' : 'n'} salir. ` : ''}
                                    Lo que no contestes se resuelve solo al arrancar.{' '}
                                    <button type="button" className={styles.linkButton} onClick={() => setTab('mercado')}>
                                        Ir al mercado
                                    </button>
                                </span>
                            </div>
                        )}

                        {scouting && (
                            <div className={styles.callout} role="status">
                                <span className={styles.calloutTitle}>La jornada de captación</span>
                                <span className={styles.calloutText}>
                                    {scouting.candidates.length} chicos para mirar, {scouting.points} puntos de observación
                                    y lugar para sumar hasta {scouting.picksMax - scouting.signed.length} al M19. Si arrancás
                                    la temporada sin mirarla, la jornada termina sin nadie nuevo.{' '}
                                    <button type="button" className={styles.linkButton} onClick={() => setTab('m19')}>
                                        Ir al M19
                                    </button>
                                </span>
                            </div>
                        )}

                        {state.seasons.length === 0 && (
                            <details className={styles.howtoBox}>
                                <summary className={styles.howtoSummary}>Cómo se juega, en tres pasos</summary>
                                <ol className={styles.howto}>
                                    <li>
                                        <span className={styles.howtoNum}>1</span>
                                        <span>
                                            <strong>Mirá con qué contás.</strong> Las pestañas de arriba: el plantel, la caja
                                            y contra quién jugás.
                                        </span>
                                    </li>
                                    <li>
                                        <span className={styles.howtoNum}>2</span>
                                        <span>
                                            <strong>La temporada va en tres tramos.</strong> Cada uno arranca con
                                            una o dos decisiones ({DECISIONS_PER_SEASON} en el año, con las
                                            probabilidades a la vista), sigue con la semana de entrenamiento y
                                            tiene un partido clave que dirigís en los dos tiempos. Si no querés
                                            tocar nada, simulás el tramo con tu semana fija.
                                        </span>
                                    </li>
                                    <li>
                                        <span className={styles.howtoNum}>3</span>
                                        <span>
                                            <strong>Se juega partido a partido.</strong> Con los que están sanos, con su
                                            cansancio y su ánimo. Después, tabla, playoff, y si clasificás, el
                                            Torneo del Interior. Después la subcomisión te dice cómo te fue.
                                        </span>
                                    </li>
                                </ol>
</details>
                        )}

                        <div className={styles.ledger}>
                            <button type="button" className={`${styles.ledgerItem} ${styles.ledgerLink}`} onClick={() => setTab('plantel')}>
                                <span className={styles.ledgerLabel}>Plantel</span>
                                <span className={styles.ledgerValue}>{teamRating(state.squad).toFixed(1)}</span>
                                <span className={styles.ledgerHint}>fuerza del XV · ver plantel</span>
                            </button>
                            <span className={styles.ledgerItem}>
                                <span className={styles.ledgerLabel}>Grupo</span>
                                <span className={styles.ledgerValue}>{Math.round(state.club.cohesion)}</span>
                                <span className={styles.ledgerHint}>
                                    {levelWord(state.club.cohesion, ['vestuario roto', 'vestuario normal', 'vestuario firme'])}
                                </span>
                            </span>
                            <span className={styles.ledgerItem}>
                                <span className={styles.ledgerLabel}>Estructura</span>
                                <span className={styles.ledgerValue}>{fin.estructura}</span>
                                <span className={styles.ledgerHint}>
                                    {levelWord(fin.estructura, ['una cancha y poco más', 'lo que hace falta', 'de las mejores'])}
                                </span>
                            </span>
                            <span className={styles.ledgerItem}>
                                <span className={styles.ledgerLabel}>Gente</span>
                                <span className={styles.ledgerValue}>{fin.hinchada}</span>
                                <span className={styles.ledgerHint}>
                                    {fin.socios} socios · {levelWord(fin.hinchada, ['acompañan poco', 'acompañan', 'a pleno'])}
                                </span>
                            </span>
                            <button type="button" className={`${styles.ledgerItem} ${styles.ledgerLink}`} onClick={() => setTab('caja')}>
                                <span className={styles.ledgerLabel}>Balance previsto</span>
                                <span className={`${styles.ledgerValue} ${budget.resultado < 0 ? styles.negative : ''}`}>
                                    {budget.resultado >= 0 ? '+' : ''}
                                    {formatMoney(budget.resultado)}
                                </span>
                                <span className={styles.ledgerHint}>sin el Interior · ver la caja</span>
                            </button>
                        </div>
                    </>
                )}

                {tab === 'plantel' && (
                    <>
                        <h2 className={styles.panelTitle}>El plantel</h2>
                        <SquadBoard
                            squad={state.squad}
                            bancoCorto={state.seasonMods.bancoCorto}
                            status={statusOf(state.competitionId)}
                        />
                    </>
                )}

                {tab === 'm19' && (
                    <>
                        <h2 className={styles.panelTitle}>El M19</h2>
                        <AcademyBoard state={state} onChange={onAcademy} />
                    </>
                )}

                {tab === 'mercado' && (
                    <>
                        <h2 className={styles.panelTitle}>El mercado de jugadores</h2>
                        <MarketBoard state={state} onChange={onMarket} />
                    </>
                )}

                {tab === 'caja' && (
                    <>
                        <h2 className={styles.panelTitle}>La caja</h2>
                        <BudgetBoard state={state} onFinance={onFinance} />
                    </>
                )}

                {tab === 'club' && (
                    <>
                        <h2 className={styles.panelTitle}>Mejoras del club</h2>
                        <UpgradesBoard state={state} onBuy={onBuy} />
                    </>
                )}

                {tab === 'torneo' && (
                    <>
                        <h2 className={styles.panelTitle}>{comp?.name ?? 'El torneo'}</h2>
                        <CompetitionBoard state={state} />
                    </>
                )}

                {tab === 'ofertas' && (
                    <>
                        <h2 className={styles.panelTitle}>Propuestas de otros clubes</h2>
                        <JobOffersBoard
                            offers={offers}
                            news={state.market.news}
                            world={state.world}
                            year={state.year}
                            myCompetitionId={state.competitionId}
                            leaving={state.clubId}
                            arrivalPressure={INITIAL_PRESSURE}
                            onAccept={onAcceptOffer}
                            onDecline={onDeclineOffer}
                        />
                    </>
                )}

                {tab === 'trayectoria' && (
                    <>
                        <h2 className={styles.panelTitle}>Trayectoria</h2>
                        <SeasonTimeline seasons={state.seasons} />
                    </>
                )}
            </section>

            <div className={styles.actionBar}>
                <button
                    type="button"
                    className={styles.primary}
                    onClick={onStart}
                    disabled={state.transfers.negotiation !== null}
                >
                    Arrancar la temporada {state.year}
                    <span className={styles.primaryHint}>
                        {state.transfers.negotiation
                            ? 'Primero cerrá o abandoná la negociación abierta en el Mercado'
                            : 'Tres tramos: decisiones, semana, partido clave y fechas'}
                    </span>
                </button>
            </div>
        </>
    );
}
