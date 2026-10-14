'use client';

import { useState } from 'react';
import {
    competitionName,
    getClub,
    initialFinances,
    tierAbove,
    tierBelow,
    type JobOffer,
    type MarketNews,
    type VacancyReason,
    type WorldState,
} from '../../../../features/coach/index.ts';
import ClubCrest from './ClubCrest.tsx';
import { placeOf } from './OfferCards.tsx';
import styles from './entrenador.module.css';

const REASON_TEXT: Record<VacancyReason, (who: string) => string> = {
    despido: (who) => `Despidieron a ${who}`,
    renuncia: (who) => `Renunció ${who}`,
    ciclo: (who) => `${who} cerró su ciclo`,
    salida: (who) => `${who} se fue a otro club`,
};

function interestWord(v: number): string {
    if (v >= 75) return 'te quieren a vos';
    if (v >= 60) return 'sos su primera opción';
    if (v >= 50) return 'estás en la lista corta';
    return 'te tienen en cuenta';
}

/** Cómo viene el club, nombrando de dónde: "Bajó de Primera B en 2033". */
function situationOf(offer: JobOffer, year: number): string {
    if (offer.moved === 'ascenso') {
        const from = tierBelow(offer.competitionId)?.short;
        return from ? `Subió de ${from} en ${year - 1}.` : `Ascendió en ${year - 1}.`;
    }
    if (offer.moved === 'descenso') {
        const from = tierAbove(offer.competitionId)?.short;
        return from ? `Bajó de ${from} en ${year - 1}.` : `Descendió en ${year - 1}.`;
    }
    return 'Sigue en la categoría.';
}

/**
 * Las propuestas de trabajo. Cada una sale de una vacante real —un club que se
 * quedó sin entrenador al cierre— y dice lo que hace falta para decidir: dónde
 * juega, cómo viene, qué te van a pedir y por qué te llaman. Aceptar pide
 * confirmación, porque dejás tu club.
 */
export default function JobOffersBoard({
    offers,
    news,
    world,
    year,
    myCompetitionId,
    leaving,
    arrivalPressure,
    onAccept,
    onDecline,
}: {
    offers: readonly JobOffer[];
    news: readonly MarketNews[];
    world: WorldState;
    year: number;
    /** La división del jugador, para mostrar primero los movimientos de su torneo. */
    myCompetitionId: string;
    /** El club que dejás si aceptás. null si estás sin club. */
    leaving: string | null;
    arrivalPressure: number;
    onAccept: (clubId: string) => void;
    onDecline?: (clubId: string) => void;
}) {
    const [confirming, setConfirming] = useState<string | null>(null);
    const leavingClub = leaving ? getClub(leaving) : null;
    const nearby = news.filter((n) => n.competitionId === myCompetitionId);
    const rest = news.filter((n) => n.competitionId !== myCompetitionId);

    return (
        <div className={styles.jobBoard}>
            {offers.length === 0 ? (
                <div className={styles.callout} role="status">
                    <span className={styles.calloutTitle}>No hay propuestas activas</span>
                    <span className={styles.calloutText}>
                        Ningún club que se quedó sin entrenador te llamó en este cierre. Las vacantes se abren
                        al terminar cada temporada: un ascenso, un título o cumplir lo que te piden te ponen en
                        la lista de los clubes que buscan técnico.
                    </span>
                </div>
            ) : (
                <p className={styles.objectiveNote}>
                    {leavingClub
                        ? `Si aceptás, dejás ${leavingClub.short} y arrancás la pretemporada en el club nuevo. Las propuestas que no contestes se caen al arrancar la temporada.`
                        : 'Elegí dónde volver a dirigir.'}
                </p>
            )}

            <div className={styles.offerGrid}>
                {offers.map((offer) => {
                    const club = getClub(offer.clubId);
                    if (!club) return null;
                    const fin = initialFinances(club);
                    const isConfirming = confirming === offer.clubId;
                    return (
                        <article key={offer.clubId} className={styles.jobCard} aria-label={`Propuesta de ${club.name}`}>
                            <span className={styles.offerHead}>
                                <ClubCrest club={club} small />
                                <span className={styles.clubOptionText}>
                                    <span className={styles.clubOptionName}>{club.name}</span>
                                    <span className={styles.clubOptionMeta}>{placeOf(club)}</span>
                                </span>
                            </span>
                            <span className={styles.offerLine}>
                                {competitionName(offer.competitionId)} · {offer.rank}° de {offer.teams} por fuerza.{' '}
                                {situationOf(offer, year)} {REASON_TEXT[offer.reason](offer.outgoing)}.
                            </span>
                            <span className={styles.offerAsk}>{offer.objective.text}</span>
                            <ul className={styles.jobReasons} aria-label="Por qué te llaman">
                                {offer.reasons.map((r) => (
                                    <li key={r}>{r}</li>
                                ))}
                            </ul>
                            <span className={styles.jobInterest}>
                                <span className={styles.attrBarTrack} aria-hidden="true">
                                    <span className={styles.attrBarFill} style={{ width: `${offer.interest}%` }} />
                                </span>
                                <span className={styles.jobInterestText}>
                                    Interés {offer.interest}/100 · {interestWord(offer.interest)}
                                </span>
                            </span>
                            <span className={styles.offerStats}>
                                <span>
                                    <span className={styles.statLabel}>Socios</span>
                                    <span className={styles.statValue}>{fin.socios}</span>
                                </span>
                                <span>
                                    <span className={styles.statLabel}>Estructura</span>
                                    <span className={styles.statValue}>{fin.estructura}</span>
                                </span>
                                <span>
                                    <span className={styles.statLabel}>Gente</span>
                                    <span className={styles.statValue}>{fin.hinchada}</span>
                                </span>
                                <span>
                                    <span className={styles.statLabel}>Fuerza</span>
                                    <span className={styles.statValue}>
                                        {(world.ratings[offer.clubId] ?? 0).toFixed(1)}
                                    </span>
                                </span>
                            </span>
                            <span className={styles.offerLine}>
                                Llegás con presión {arrivalPressure}. Plantel, caja y mejoras son las del club
                                nuevo{leavingClub ? `: las de ${leavingClub.short} se quedan allá` : ''}.
                            </span>

                            {isConfirming ? (
                                <span className={styles.jobActions}>
                                    <button type="button" className={styles.primary} onClick={() => onAccept(offer.clubId)}>
                                        Firmar con {club.short}
                                    </button>
                                    <button type="button" className={styles.ghost} onClick={() => setConfirming(null)}>
                                        Pensarlo
                                    </button>
                                </span>
                            ) : (
                                <span className={styles.jobActions}>
                                    <button
                                        type="button"
                                        className={styles.primary}
                                        onClick={() => setConfirming(offer.clubId)}
                                        aria-label={`Aceptar la propuesta de ${club.name}`}
                                    >
                                        Aceptar
                                    </button>
                                    {onDecline && (
                                        <button
                                            type="button"
                                            className={styles.ghost}
                                            onClick={() => onDecline(offer.clubId)}
                                            aria-label={`Rechazar la propuesta de ${club.name}`}
                                        >
                                            Rechazar
                                        </button>
                                    )}
                                </span>
                            )}
                        </article>
                    );
                })}
            </div>

            {news.length > 0 && (
                <details className={styles.details}>
                    <summary className={styles.summary}>
                        Movimientos en los bancos
                        <span className={styles.summaryHint}>
                            {nearby.length > 0 ? `${nearby.length} en tu torneo · ` : ''}
                            {news.length} en total
                        </span>
                    </summary>
                    <ul className={styles.newsList}>
                        {[...nearby, ...rest].slice(0, 24).map((n) => {
                            const club = getClub(n.clubId);
                            return (
                                <li key={`${n.clubId}-${n.incoming}`} className={styles.newsItem}>
                                    {club && <ClubCrest club={club} small />}
                                    <span>
                                        <strong>{club?.short ?? n.clubId}</strong> · {REASON_TEXT[n.reason](n.outgoing)}.
                                        Asumió {n.incoming}.
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </details>
            )}
        </div>
    );
}
