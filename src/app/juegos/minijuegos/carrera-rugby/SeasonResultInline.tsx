'use client';

import type { CareerSeasonEntry, CareerState, DivisionMove, Locale, UiStrings } from '@/features/career';
import {
    competitionLabelOf, contractLabel, contractLabelIn, divisionMoveFor, getClub, MILESTONE_LABELS,
    milestoneLabel, secondaryStatLabelIn, seasonDecisionTextIn,
} from '@/features/career';
import { useLocale } from './LocaleContext';
import ClubBadge from './ClubBadge';
import styles from './carrera.module.css';

interface Props {
    career: CareerState;
    /**
     * Índice de la primera temporada del tramo recién jugado. Con ritmo Intensa
     * es la última y esto rinde exactamente la tarjeta de siempre; con Normal o
     * Exprés abarca las dos o tres temporadas que pasaron de una sola vez.
     */
    from?: number | null;
}

/**
 * Actualización COMPACTA de lo recién jugado. Lee las entradas históricas
 * CONGELADAS: nunca recalcula desde el catálogo.
 *
 * Una temporada sola y un tramo de varias son dos lecturas distintas, no una
 * con un contador al costado: en una temporada importa el detalle (la ranura de
 * estadística del puesto, si el OVR se movió) y en un tramo importa el saldo y
 * que no se pierda ningún año por el camino. Por eso son dos tarjetas.
 */
export default function SeasonResultInline({ career, from }: Props) {
    const { locale } = useLocale();
    const history = career.history;
    if (history.length === 0) return null;

    const start = Math.max(0, Math.min(from ?? history.length - 1, history.length - 1));
    const block = history.slice(start);
    const previous = history[start - 1];

    // La decisión que abrió el tramo. El revelado la muestra grande y se va, así
    // que sin esto la única frase que el jugador ESCRIBIÓ con su elección
    // desaparecería para siempre — el motor la guarda desde la primera versión
    // (`seasons[].decisionText`) y no se mostraba en ninguna parte.
    //
    // El motor la guarda EN ESPAÑOL y acá se traduce cruzando `decisionLog` por
    // `seasonIndex`: es lo que permite que una partida jugada en español se lea
    // entera en inglés sin tocar una línea del guardado.
    const decision = seasonDecisionTextIn(career, start, locale);

    return block.length === 1
        ? <SingleSeason career={career} entry={block[0]} previous={previous} decision={decision} />
        : <SeasonBlock career={career} block={block} previous={previous} decision={decision} />;
}

/**
 * ¿La temporada terminó con el club cambiando de división?
 *
 * Se DERIVA de la posición final y de la competición congeladas en la temporada,
 * con la misma función del motor que decide el movimiento (`divisionMoveFor`), así
 * que no hace falta guardar el dato ni puede desincronizarse de la regla. Es el
 * criterio del CLAUDE.md §2: lo derivado no sube versión.
 */
function divisionMoveOf(career: CareerState, entry: CareerSeasonEntry): DivisionMove | null {
    const season = career.seasons[entry.season - 1];
    if (!season) return null;
    return divisionMoveFor(entry.competitionId, season.leaguePosition, season.leagueTeams);
}

/** Una temporada: el detalle completo, con la ranura de estadística del puesto. */
function SingleSeason({ career, entry, previous, decision }: { career: CareerState; entry: CareerSeasonEntry; previous?: CareerSeasonEntry; decision?: string | null }) {
    const { locale, t } = useLocale();
    const club = getClub(entry.clubId);
    const delta = entry.ovrDelta;
    const contractChanged = !previous
        || previous.employment !== entry.employment
        || previous.squadTrack !== entry.squadTrack;
    const clubChanged = previous && previous.clubId !== entry.clubId;

    // Títulos DEL JUGADOR (los disputó) vs títulos SOLO del club (no acreditados).
    const playerTitles = entry.participations.filter((c) => c.playerCredited);
    const clubOnlyTitles = entry.participations.filter((c) => c.clubWon && !c.playerCredited);

    // Una temporada quieta en el techo se cuenta distinto de una quieta a mitad
    // de camino: la primera es el pico de la carrera, la segunda es un año perdido.
    const atCeiling = delta === 0 && entry.ovr >= career.player.potential - 1;
    const flatNote = delta === 0 ? flatSeasonNote(career.history, entry, t) : null;

    return (
        <section className={styles.result} aria-live="polite" aria-label={t.seasonResultLabel}>
            <p className={styles.resultHeadline}>
                {entry.milestones.length > 0 ? headlineFromEntry(entry, locale) : seasonHeadline(entry, t)}
            </p>

            <p className={styles.resultMeta}>
                <span className={styles.resultTag}>{t.seasonTag(entry.season)}</span>
                <span className={styles.num}>{entry.age} {t.yearsLabel}</span>
                <span className={styles.resultClub}>
                    <ClubBadge clubId={club.id} clubName={entry.clubName} size={16} />
                    {entry.clubName}
                </span>
                <span className={styles.resultComp}>{entry.competitionName}</span>
            </p>

            <ul className={styles.resultStats}>
                <li><span className={styles.num}>{entry.appearances}</span> {t.matches.toLowerCase()}</li>
                {entry.points > 0 && <li><span className={styles.num}>{entry.points}</span> {t.points.toLowerCase()}</li>}
                {entry.tries > 0 && <li><span className={styles.num}>{entry.tries}</span> {t.tries.toLowerCase()}</li>}
                <li>
                    <span className={styles.num}>{entry.secondaryStat}</span>{' '}
                    {secondaryStatLabelIn(entry.secondaryStatLabel, locale).toLowerCase()}
                </li>
                {entry.caps > 0 && <li><span className={styles.num}>{entry.caps}</span> {t.caps}</li>}
                <li className={deltaClass(delta)}>
                    {t.ovr} <span className={styles.num}>{entry.ovr}</span>
                    <span className={styles.deltaSep} aria-hidden="true"> · </span>
                    {delta !== 0 ? signed(delta) : atCeiling ? t.atCeiling : t.noChanges}
                </li>
            </ul>

            {decision && <p className={styles.resultDecision}>{decision}</p>}

            {flatNote && <p className={styles.flatNote}>{flatNote}</p>}

            <ResultBadges
                playerTitles={playerTitles}
                clubOnlyTitles={clubOnlyTitles}
                clubChanged={Boolean(clubChanged)}
                contractChanged={contractChanged}
                contract={contractLabelIn(entry.employment, entry.squadTrack, contractLabel(entry.employment, entry.squadTrack), locale)}
                milestones={entry.milestones}
                divisionMove={divisionMoveOf(career, entry)}
            />
        </section>
    );
}

/**
 * Un tramo de dos o tres temporadas. El saldo va arriba y abajo va una línea por
 * año: el jugador apretó un botón y le pasaron tres temporadas, así que ninguna
 * puede quedar sin aparecer.
 *
 * La ranura de estadística del puesto NO se suma: la del apertura es un
 * porcentaje de palos, y promediar tres porcentajes de tres temporadas con
 * distinta cantidad de intentos daría un número que no es el de nadie. En el
 * tramo se muestran los tackles, que sí se suman.
 */
function SeasonBlock({ career, block, previous, decision }: { career: CareerState; block: CareerSeasonEntry[]; previous?: CareerSeasonEntry; decision?: string | null }) {
    const { locale, t } = useLocale();
    const first = block[0];
    const last = block[block.length - 1];
    const club = getClub(last.clubId);
    const total = (pick: (h: CareerSeasonEntry) => number) => block.reduce((sum, h) => sum + pick(h), 0);

    const delta = total((h) => h.ovrDelta);
    const caps = total((h) => h.caps);
    const points = total((h) => h.points);
    const tries = total((h) => h.tries);

    // Clubes por los que pasó, en orden y sin repetir consecutivos.
    const clubs = block.map((h) => h.clubName).filter((name, i, all) => i === 0 || all[i - 1] !== name);

    const playerTitles = block.flatMap((h) => h.participations.filter((c) => c.playerCredited));
    const clubOnlyTitles = block.flatMap((h) => h.participations.filter((c) => c.clubWon && !c.playerCredited));
    const milestones = block.flatMap((h) => h.milestones);

    const contractChanged = !previous
        || previous.employment !== last.employment
        || previous.squadTrack !== last.squadTrack;
    const clubChanged = clubs.length > 1 || (previous !== undefined && previous.clubId !== first.clubId);
    const atCeiling = delta === 0 && last.ovr >= career.player.potential - 1;

    return (
        <section className={styles.result} aria-live="polite" aria-label={t.blockResultLabel}>
            <p className={styles.resultHeadline}>{blockHeadline(block, clubs, locale, t)}</p>

            <p className={styles.resultMeta}>
                <span className={styles.resultTag}>{t.seasonRangeTag(first.season, last.season)}</span>
                <span>
                    <span className={styles.num}>{first.age}</span>
                    {locale === 'en' ? ' to ' : ' a '}
                    <span className={styles.num}>{last.age}</span> {t.yearsLabel}
                </span>
                <span className={styles.resultClub}>
                    <ClubBadge clubId={club.id} clubName={last.clubName} size={16} />
                    {last.clubName}
                </span>
                <span className={styles.resultComp}>{last.competitionName}</span>
            </p>

            <ul className={styles.resultStats}>
                <li><span className={styles.num}>{total((h) => h.appearances)}</span> {t.matches.toLowerCase()}</li>
                {points > 0 && <li><span className={styles.num}>{points}</span> {t.points.toLowerCase()}</li>}
                {tries > 0 && <li><span className={styles.num}>{tries}</span> {t.tries.toLowerCase()}</li>}
                <li><span className={styles.num}>{total((h) => h.tackles)}</span> {t.tackles.toLowerCase()}</li>
                {caps > 0 && <li><span className={styles.num}>{caps}</span> {t.caps}</li>}
                <li className={deltaClass(delta)}>
                    {t.ovr} <span className={styles.num}>{last.ovr}</span>
                    <span className={styles.deltaSep} aria-hidden="true"> · </span>
                    {delta !== 0 ? signed(delta) : atCeiling ? t.atCeiling : t.noChanges}
                </li>
            </ul>

            {decision && <p className={styles.resultDecision}>{decision}</p>}

            <ol className={styles.blockSeasons}>
                {block.map((h, i) => (
                    <li key={h.season} className={styles.blockSeason}>
                        <span><span className={styles.num}>{h.age}</span> {t.yearsLabel}</span>
                        {/* El club se repite solo cuando cambia: tres líneas con
                            el mismo nombre son ruido, y el cambio es la noticia. */}
                        {(i === 0 || block[i - 1].clubId !== h.clubId) && (
                            <span className={styles.blockSeasonClub}>{h.clubName}</span>
                        )}
                        <span><span className={styles.num}>{h.appearances}</span> {t.matches.toLowerCase()}</span>
                        <span className={deltaClass(h.ovrDelta)}>
                            {t.ovr} <span className={styles.num}>{h.ovr}</span>
                            {h.ovrDelta !== 0 && <> {signed(h.ovrDelta)}</>}
                        </span>
                        {h.severeInjury && <span className={styles.blockSeasonFlag}>{t.seriousInjury}</span>}
                    </li>
                ))}
            </ol>

            <ResultBadges
                playerTitles={playerTitles}
                clubOnlyTitles={clubOnlyTitles}
                clubChanged={clubChanged}
                contractChanged={contractChanged}
                contract={contractLabelIn(last.employment, last.squadTrack, contractLabel(last.employment, last.squadTrack), locale)}
                milestones={milestones}
                // En un tramo de varias temporadas manda el movimiento de la
                // ÚLTIMA: es la división en la que el club quedó.
                divisionMove={divisionMoveOf(career, last)}
            />
        </section>
    );
}

type Participation = CareerSeasonEntry['participations'][number];

/** Las medallas de lo jugado. Idénticas para una temporada y para un tramo. */
function ResultBadges({ playerTitles, clubOnlyTitles, clubChanged, contractChanged, contract, milestones, divisionMove }: {
    playerTitles: Participation[];
    clubOnlyTitles: Participation[];
    clubChanged: boolean;
    contractChanged: boolean;
    contract: string;
    milestones: CareerSeasonEntry['milestones'];
    divisionMove?: DivisionMove | null;
}) {
    const { locale, t } = useLocale();

    if (
        playerTitles.length === 0 && clubOnlyTitles.length === 0 && !contractChanged && !clubChanged
        && milestones.length === 0 && !divisionMove
    ) {
        return null;
    }
    return (
        <p className={styles.resultBadges}>
            {/* EL ASCENSO VA PRIMERO. Es la noticia más grande que puede traer una
                temporada sin título: el año que viene el club juega en otro lado. */}
            {divisionMove && (
                <span className={divisionMove.direction === 'promotion' ? styles.badgeUp : styles.badgeDown}>
                    {divisionMove.direction === 'promotion' ? t.promotionBadge : t.relegationBadge}
                    {competitionLabelOf(divisionMove.to)}
                </span>
            )}
            {playerTitles.map((c, i) => (
                <span key={`${c.competitionId}-${i}`} className={styles.badgeWin}>🏆 {c.competitionName}</span>
            ))}
            {clubOnlyTitles.map((c, i) => (
                <span key={`club-${c.competitionId}-${i}`} className={styles.badgeClubOnly}>
                    {t.clubChampionOf(c.competitionName)}
                </span>
            ))}
            {clubChanged && <span className={styles.badgeMove}>{t.newClub}</span>}
            {contractChanged && <span className={styles.badgeContract}>{contract}</span>}
            {milestones.map((m) => (
                <span key={m} className={styles.badgeMilestone}>
                    {milestoneLabel(m, MILESTONE_LABELS[m], locale)}
                </span>
            ))}
        </p>
    );
}

function deltaClass(delta: number): string {
    return delta === 0 ? styles.deltaFlat : delta > 0 ? styles.deltaUp : styles.deltaDown;
}

/** El menos es un signo menos (U+2212), no un guión: alinea con los dígitos. */
function signed(delta: number): string {
    return `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`;
}

/** El titular de un tramo: el hito manda, después el viaje, después el saldo. */
function blockHeadline(block: CareerSeasonEntry[], clubs: string[], locale: Locale, t: UiStrings): string {
    const withMilestone = block.find((h) => h.milestones.length > 0);
    if (withMilestone) {
        const m = withMilestone.milestones[0];
        return `${milestoneLabel(m, MILESTONE_LABELS[m], locale)} · ${withMilestone.clubName}`;
    }
    if (clubs.length > 1) return t.fromTo(clubs[0], clubs[clubs.length - 1]);
    return t.seasonsAt(block.length, clubs[0]);
}

function seasonHeadline(entry: { appearances: number; ovrDelta: number; clubName: string }, t: UiStrings): string {
    if (entry.ovrDelta >= 3) return t.growthSeason(entry.clubName);
    if (entry.ovrDelta <= -2) return t.hardSeason(entry.clubName);
    if (entry.appearances >= 18) return t.busySeason(entry.clubName);
    return t.anotherSeason(entry.clubName);
}

/**
 * Qué SÍ se movió cuando el OVR no se movió.
 *
 * Una temporada de pico no es una temporada vacía: se siguen jugando partidos,
 * sumando caps y anotando. Sin esta línea, las tres o cuatro temporadas que el
 * jugador pasa en su techo se leen como tiempo muerto — que es exactamente lo
 * que pasaba antes de 1.9.0, con "OVR 63 · sin cambios" repetido y nada más.
 *
 * Se muestra un solo récord personal, el más significativo que haya.
 */
function flatSeasonNote(history: CareerSeasonEntry[], entry: CareerSeasonEntry, t: UiStrings): string | null {
    // `entry` es siempre la última: esta tarjeta solo se usa con tramos de una.
    const past = history.slice(0, -1);
    if (past.length === 0) return null;
    const bestBefore = (pick: (h: CareerSeasonEntry) => number) => Math.max(...past.map(pick));

    if (entry.caps > 0 && entry.caps >= bestBefore((h) => h.caps)) return t.bestTestSeason;
    if (entry.points > 0 && entry.points >= bestBefore((h) => h.points)) return t.bestPointsHaul;
    if (entry.tries > 0 && entry.tries >= bestBefore((h) => h.tries)) return t.bestTrySeason;
    if (entry.tackles > 0 && entry.tackles >= bestBefore((h) => h.tackles)) return t.bestTackleSeason;
    if (entry.appearances > 0 && entry.appearances >= bestBefore((h) => h.appearances)) return t.mostGameTime;
    return null;
}

function headlineFromEntry(
    entry: { milestones: (keyof typeof MILESTONE_LABELS)[]; clubName: string },
    locale: Locale,
): string {
    const m = entry.milestones[0];
    return `${milestoneLabel(m, MILESTONE_LABELS[m], locale)} · ${entry.clubName}`;
}
