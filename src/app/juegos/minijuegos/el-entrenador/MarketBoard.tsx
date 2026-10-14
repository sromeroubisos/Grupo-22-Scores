'use client';

import {
    OFFERED_DEAL_LABEL,
    SQUAD_MAX,
    SQUAD_MIN,
    acceptPlayerOffer,
    clubInfo,
    dealWords,
    denyRequest,
    dismissCandidate,
    expiringPlayers,
    feeIsReal,
    feeNegotiationBlock,
    feeWords,
    formatMoney,
    getClub,
    grantRequest,
    inclinationWord,
    letExpire,
    loanBlock,
    loanEligible,
    loanPlayer,
    negotiationAcceptCounter,
    negotiationOffer,
    negotiationWalkAway,
    openFeeNegotiation,
    openRenewalNegotiation,
    openSigningNegotiation,
    rejectPlayerOffer,
    releaseBlock,
    releaseCost,
    releasePlayer,
    renewAllAtAsk,
    renewAtAsk,
    renewBlock,
    renewalAsk,
    renewalNegotiationBlock,
    retainBlock,
    retainPlayer,
    retainTerms,
    rosterSize,
    routeWords,
    signBlock,
    signCandidate,
    signingNegotiationBlock,
    statusOf,
    type ArrivalCandidate,
    type CoachState,
    type Negotiation,
    type PlayerOffer,
    type PositionGroup,
    type SquadPlayer,
} from '../../../../features/coach/index.ts';
import NegotiationPanel from './NegotiationPanel.tsx';
import styles from './entrenador.module.css';

const GROUP_LABEL: Record<PositionGroup, string> = {
    'primera-linea': 'primera línea',
    'segunda-linea': 'segunda línea',
    'tercera-linea': 'tercera línea',
    medios: 'medio',
    centros: 'centro',
    fondo: 'fondo',
};

const ORIGIN_LABEL: Record<ArrivalCandidate['origin'], string> = {
    libre: 'Libre',
    vuelve: 'Vuelve del exterior',
    sube: 'Quiere subir de categoría',
    region: 'De la región',
};

function playerLine(p: SquadPlayer): string {
    return `${GROUP_LABEL[p.group]}, ${p.age} años, nivel ${Math.round(p.level)}`;
}

/** Una cifra de la negociación, en su unidad. En los viáticos no se habla en pesos. */
function negFormat(neg: Negotiation): (v: number) => string {
    if (neg.unit === 'porcentaje') return (v) => `${Math.round(v)} % del viático de la división`;
    // Vendiendo se habla de la compensación (una vez); comprando, del vínculo (por mes).
    // Con dos decimales: el paso es de 50.000 y "2,5 M" escondería la diferencia.
    if (neg.side === 'venta') return (v) => `$ ${(v / 1_000_000).toFixed(2).replace('.', ',')} M`;
    return (v) => `$ ${Math.round(v).toLocaleString('es-AR')} por mes`;
}

/** Un botón de decisión con su motivo a la vista cuando no se puede. */
function Action({
    label,
    block,
    onClick,
    ghost = false,
}: {
    label: string;
    block?: string | null;
    onClick: () => void;
    ghost?: boolean;
}) {
    return (
        <span className={styles.marketAction}>
            <button type="button" className={ghost ? styles.ghost : styles.upgradeBuy} disabled={!!block} onClick={onClick}>
                {label}
            </button>
            {block && <span className={styles.disabledNote}>{block}</span>}
        </span>
    );
}

function OfferCard({ state, offer, onChange }: { state: CoachState; offer: PlayerOffer; onChange: (s: CoachState) => void }) {
    const p = state.squad.find((x) => x.id === offer.playerId);
    if (!p) return null;
    const club = clubInfo(state, offer.clubId, offer.abroad);
    const terms = retainTerms(state, offer);
    const retainNo = retainBlock(state, offer.id);
    const negotiable = feeIsReal(state, offer);
    return (
        <li className={styles.marketCard}>
            <div className={styles.upgradeHead}>
                <span className={styles.upgradeName}>
                    {p.number} · {p.name}
                </span>
                <span className={styles.chanceBadge} aria-label={`${offer.inclination} por ciento de que se vaya`}>
                    {offer.inclination} %
                </span>
            </div>
            <p className={styles.upgradeText}>{playerLine(p)}</p>
            <p className={styles.upgradeEffect}>
                Lo quiere {club.name} ({[club.country, club.league, club.status].filter(Boolean).join(' · ')}). Le ofrece{' '}
                {OFFERED_DEAL_LABEL[offer.deal]}.
            </p>
            <p className={styles.upgradeText}>{routeWords(offer)}</p>
            <p className={styles.upgradeText}>{feeWords(state, offer)}</p>
            <p className={styles.upgradeEffect}>
                {inclinationWord(offer.inclination)}: si el club acepta, hay un {offer.inclination} % de que se vaya.
            </p>
            {offer.reasons.length > 0 && (
                <ul className={styles.marketReasons}>
                    {offer.reasons.map((r) => (
                        <li key={r}>{r}</li>
                    ))}
                </ul>
            )}
            <div className={styles.marketActions}>
                <Action label="Aceptar la oferta" onClick={() => onChange(acceptPlayerOffer(state, offer.id))} />
                <Action
                    label={terms ? `${terms.label} (${terms.chance} % de que alcance)` : 'Retenerlo'}
                    block={retainNo}
                    onClick={() => onChange(retainPlayer(state, offer.id))}
                />
                {negotiable && (
                    <Action
                        label="Negociar la compensación"
                        block={feeNegotiationBlock(state, offer.id)}
                        onClick={() => onChange(openFeeNegotiation(state, offer.id))}
                    />
                )}
                <Action
                    ghost
                    label="Rechazar"
                    onClick={() => onChange(rejectPlayerOffer(state, offer.id))}
                />
            </div>
            {offer.inclination >= 50 && (
                <p className={styles.objectiveNote}>Si se rechaza, lo va a sentir: baja el ánimo y puede volver a pedir salir.</p>
            )}
        </li>
    );
}

function ArrivalCard({ state, c, onChange }: { state: CoachState; c: ArrivalCandidate; onChange: (s: CoachState) => void }) {
    const from = c.fromClubId ? clubInfo(state, c.fromClubId, c.fromAbroad) : null;
    const rival = c.rivalClubId ? getClub(c.rivalClubId) : null;
    const headroom = c.player.potential - c.player.level;
    return (
        <li className={styles.marketCard}>
            <div className={styles.upgradeHead}>
                <span className={styles.upgradeName}>{c.player.name}</span>
                <span className={styles.chanceBadge} aria-label={`${c.chance} por ciento de que firme`}>
                    {c.chance} %
                </span>
            </div>
            <p className={styles.upgradeText}>
                {playerLine(c.player)}
                {headroom >= 8 ? ', con margen para crecer' : headroom <= 2 ? ', ya es lo que es' : ''}.
            </p>
            <p className={styles.upgradeEffect}>
                {ORIGIN_LABEL[c.origin]}
                {from ? ` · ${from.name}${from.abroad ? ` (${from.country})` : ''}` : ''}. Pide: {dealWords(state, c.player.deal).toLowerCase()}.
            </p>
            <ul className={styles.marketReasons}>
                {c.reasons.map((r) => (
                    <li key={r}>{r}</li>
                ))}
            </ul>
            <p className={styles.upgradeEffect}>
                {rival ? `Lo quiere también ${rival.short}: con la competencia, ` : ''}hay un {c.chance} % de que firme si lo llamás.
            </p>
            <div className={styles.marketActions}>
                <Action label="Llamarlo" block={signBlock(state, c.id)} onClick={() => onChange(signCandidate(state, c.id))} />
                {c.player.deal.monthly > 0 && c.player.deal.kind !== 'beca' && (
                    <Action
                        label="Negociar el vínculo"
                        block={signingNegotiationBlock(state, c.id)}
                        onClick={() => onChange(openSigningNegotiation(state, c.id))}
                    />
                )}
                <Action ghost label="Descartar" onClick={() => onChange(dismissCandidate(state, c.id))} />
            </div>
        </li>
    );
}

function ExpiringRow({ state, p, onChange }: { state: CoachState; p: SquadPlayer; onChange: (s: CoachState) => void }) {
    const ask = renewalAsk(state, p);
    return (
        <li className={styles.marketCard}>
            <div className={styles.upgradeHead}>
                <span className={styles.upgradeName}>
                    {p.number} · {p.name}
                </span>
            </div>
            <p className={styles.upgradeText}>
                {playerLine(p)}. Vence: {dealWords(state, { ...p.deal, years: 0 }).toLowerCase()}.
            </p>
            <p className={styles.upgradeEffect}>
                {ask.kind === 'amateur' ? 'En esta división ya no se paga ese vínculo.' : `Para renovar pide: ${dealWords(state, ask).toLowerCase()}.`}
            </p>
            <div className={styles.marketActions}>
                <Action label="Renovar por lo que pide" block={renewBlock(state, p.id)} onClick={() => onChange(renewAtAsk(state, p.id))} />
                {p.deal.kind !== 'beca' && ask.kind !== 'amateur' && (
                    <Action
                        label="Negociar la renovación"
                        block={renewalNegotiationBlock(state, p.id)}
                        onClick={() => onChange(openRenewalNegotiation(state, p.id))}
                    />
                )}
                <Action
                    ghost
                    label={p.deal.kind === 'contrato' ? 'Dejarlo ir libre' : p.deal.kind === 'beca' ? 'No renovarle la beca' : 'No renovarle el viático'}
                    onClick={() => onChange(letExpire(state, p.id))}
                />
            </div>
        </li>
    );
}

/**
 * La pantalla del Mercado: la ventana de la pretemporada o la corta entre el
 * tramo 1 y el 2. Arriba, si hay, la negociación abierta; después las ofertas
 * por los jugadores del plantel, los vencimientos, los pedidos de salida, los
 * candidatos para incorporar, y ceder o liberar. Cada botón llama al motor y
 * el estado nuevo sube por `onChange`: la pantalla no calcula nada propio.
 *
 * En una división amateur o con viáticos no aparece un número en pesos sobre un
 * jugador: el viático se lee en porcentaje del de la división y la ayuda de un
 * club del exterior se nombra, no se cifra.
 */
export default function MarketBoard({ state, onChange }: { state: CoachState; onChange: (s: CoachState) => void }) {
    const t = state.transfers;
    const win = t.window;
    const status = statusOf(state.competitionId);
    const expiring = expiringPlayers(state);
    const roster = rosterSize(state);
    const active = t.negotiation;
    const windowLog = t.log.filter((e) => e.season === state.season && e.window === (win?.kind ?? e.window));
    const loanable = [...state.squad]
        .filter((p) => loanEligible(state, p))
        .sort((a, b) => a.age - b.age || a.level - b.level || a.id.localeCompare(b.id))
        .slice(0, 6);
    const releasable = [...state.squad].sort((a, b) => a.level - b.level || a.id.localeCompare(b.id)).slice(0, 6);

    if (!win) {
        return (
            <p className={styles.objectiveNote}>
                La ventana de pases está cerrada. Se abre al cerrar el año, con la pretemporada, y una semana entre el tramo 1 y
                el 2.
            </p>
        );
    }

    return (
        <div className={styles.market}>
            <div className={styles.ledger}>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Ventana</span>
                    <span className={styles.ledgerValue}>{win.kind === 'pretemporada' ? 'Pretemporada' : 'Corta'}</span>
                    <span className={styles.ledgerHint}>
                        {win.kind === 'pretemporada' ? 'se cierra al arrancar la temporada' : 'se cierra al seguir al tramo 2'}
                    </span>
                </span>
                <span className={styles.ledgerItem}>
                    <span className={styles.ledgerLabel}>Plantel</span>
                    <span className={styles.ledgerValue}>
                        {roster} de {SQUAD_MAX}
                    </span>
                    <span className={styles.ledgerHint}>
                        {t.loaned.length > 0 ? `${t.loaned.length} cedido${t.loaned.length === 1 ? '' : 's'} · ` : ''}mínimo {SQUAD_MIN} en el club
                    </span>
                </span>
                {status === 'semipro' && t.ledger.season === state.season && (
                    <span className={styles.ledgerItem}>
                        <span className={styles.ledgerLabel}>Compensaciones del año</span>
                        <span className={styles.ledgerValue}>{formatMoney(t.ledger.compensaciones)}</span>
                        <span className={styles.ledgerHint}>entran al cierre · ver la caja</span>
                    </span>
                )}
            </div>

            {windowLog.length > 0 && (
                <div className={styles.callout} role="status">
                    <span className={styles.calloutTitle}>Movimientos de la ventana</span>
                    <ul className={styles.marketReasons}>
                        {windowLog.slice(-6).map((e, i) => (
                            <li key={`${i}-${e.text}`}>{e.text}</li>
                        ))}
                    </ul>
                </div>
            )}

            {active && (
                <NegotiationPanel
                    key={`${active.target.kind}-${'offerId' in active.target ? active.target.offerId : 'playerId' in active.target ? active.target.playerId : active.target.candidateId}`}
                    neg={active.neg}
                    format={negFormat(active.neg)}
                    onOffer={(v) => onChange(negotiationOffer(state, v))}
                    onAcceptCounter={() => onChange(negotiationAcceptCounter(state))}
                    onWalkAway={() => onChange(negotiationWalkAway(state))}
                />
            )}

            <h3 className={styles.marketTitle}>Ofertas por tus jugadores</h3>
            {t.offers.length === 0 ? (
                <p className={styles.objectiveNote}>Nadie llamó por tus jugadores en esta ventana.</p>
            ) : (
                <>
                    <p className={styles.objectiveNote}>
                        Si cerrás la ventana sin contestar, la oferta se rechaza. El que se quería ir lo siente.
                    </p>
                    <ul className={styles.marketList}>
                        {t.offers.map((o) => (
                            <OfferCard key={o.id} state={state} offer={o} onChange={onChange} />
                        ))}
                    </ul>
                </>
            )}

            {win.kind === 'pretemporada' && (
                <>
                    <h3 className={styles.marketTitle}>Vencimientos</h3>
                    {expiring.length === 0 ? (
                        <p className={styles.objectiveNote}>No vence ningún vínculo este año.</p>
                    ) : (
                        <>
                            <p className={styles.objectiveNote}>
                                Si arrancás la temporada sin contestar, cada uno se renueva por lo que pide, si la caja lo deja.
                            </p>
                            <div className={styles.marketActions}>
                                <Action
                                    label={`Renovar a los ${expiring.length} por lo que piden`}
                                    block={expiring.every((p) => renewBlock(state, p.id)) ? 'Ninguno se puede renovar por lo que pide.' : null}
                                    onClick={() => onChange(renewAllAtAsk(state))}
                                />
                            </div>
                            <ul className={styles.marketList}>
                                {expiring.map((p) => (
                                    <ExpiringRow key={p.id} state={state} p={p} onChange={onChange} />
                                ))}
                            </ul>
                        </>
                    )}
                </>
            )}

            {t.requests.length > 0 && (
                <>
                    <h3 className={styles.marketTitle}>Piden salir</h3>
                    <ul className={styles.marketList}>
                        {t.requests.map((r) => {
                            const p = state.squad.find((x) => x.id === r.playerId);
                            if (!p) return null;
                            return (
                                <li key={r.playerId} className={styles.marketCard}>
                                    <span className={styles.upgradeName}>
                                        {p.number} · {p.name}
                                    </span>
                                    <p className={styles.upgradeText}>
                                        {playerLine(p)}. {r.reason}
                                    </p>
                                    <div className={styles.marketActions}>
                                        <Action label="Dejarlo ir" onClick={() => onChange(grantRequest(state, p.id))} />
                                        <Action label="Hablar para que se quede" onClick={() => onChange(denyRequest(state, p.id))} />
                                        <Action
                                            label="Cederlo a un club de abajo"
                                            block={loanBlock(state, p.id)}
                                            onClick={() => onChange(loanPlayer(state, p.id))}
                                        />
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}

            <h3 className={styles.marketTitle}>Para incorporar</h3>
            {t.arrivals.length === 0 ? (
                <p className={styles.objectiveNote}>No quedan candidatos en esta ventana.</p>
            ) : (
                <ul className={styles.marketList}>
                    {t.arrivals.map((c) => (
                        <ArrivalCard key={c.id} state={state} c={c} onChange={onChange} />
                    ))}
                </ul>
            )}

            <details className={styles.fold}>
                <summary className={styles.foldSummary}>
                    <span className={styles.panelTitle}>Ceder o liberar</span>
                    <span className={styles.summaryHint}>
                        {t.loaned.length > 0 ? `${t.loaned.length} cedido${t.loaned.length === 1 ? '' : 's'}` : 'liberar hace lugar; ceder da minutos'}
                    </span>
                </summary>
                {t.loaned.length > 0 && (
                    <ul className={styles.marketReasons}>
                        {t.loaned.map((l) => (
                            <li key={l.player.id}>
                                {l.player.name}, cedido a {getClub(l.clubId)?.short ?? l.clubId}. Vuelve al cierre del año.
                            </li>
                        ))}
                    </ul>
                )}
                <p className={styles.objectiveNote}>
                    El cedido juega en un club de abajo toda la temporada: no entra en tu XV y vuelve al cierre con más nivel y sin
                    cansancio. Sigue contando para el tope de {SQUAD_MAX}.
                </p>
                <ul className={styles.marketList}>
                    {loanable.map((p) => (
                        <li key={p.id} className={styles.marketRow}>
                            <span>
                                {p.number} · {p.name} — {playerLine(p)}
                            </span>
                            <Action label="Ceder" block={loanBlock(state, p.id)} onClick={() => onChange(loanPlayer(state, p.id))} />
                        </li>
                    ))}
                </ul>
                <p className={styles.objectiveNote}>
                    Liberar a alguien hace lugar para incorporar. Se va libre
                    {status === 'semipro' ? '; si tiene contrato vigente, se le pagan seis meses.' : '.'}
                </p>
                <ul className={styles.marketList}>
                    {releasable.map((p) => {
                        const cost = releaseCost(p);
                        return (
                            <li key={p.id} className={styles.marketRow}>
                                <span>
                                    {p.number} · {p.name} — {playerLine(p)}
                                    {status === 'semipro' && cost > 0 ? ` · cuesta ${formatMoney(cost)}` : ''}
                                </span>
                                <Action ghost label="Liberar" block={releaseBlock(state, p.id)} onClick={() => onChange(releasePlayer(state, p.id))} />
                            </li>
                        );
                    })}
                </ul>
            </details>
        </div>
    );
}
