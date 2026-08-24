'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import useSWR from 'swr';
import {
    ArrowDownRight,
    ArrowUpRight,
    CalendarDays,
    ChevronDown,
    ChevronRight,
    History,
    Medal,
    Search,
    Shield,
    Trophy,
} from 'lucide-react';
import { APP_TIMEZONE } from '@/lib/timezone';
import { shareRivalHeadToHead, type RivalExportFormat } from './rivalHeadToHeadExport';
import GuestExportInvite, { useGuestExportInvite } from '@/components/GuestExportInvite';
import styles from './page.module.css';

type Outcome = 'win' | 'draw' | 'loss';

type HistoryMatch = {
    id: string;
    date: string;
    category: string | null;
    sportId: string | null;
    tournamentId: string | null;
    tournamentName: string | null;
    tournamentLogo: string | null;
    season: string;
    home: { id: string | null; name: string; logo: string };
    away: { id: string | null; name: string; logo: string };
    homeScore: number;
    awayScore: number;
    isHome: boolean;
    outcome: Outcome;
    pointsFor: number;
    pointsAgainst: number;
};

type Stats = {
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    difference: number;
    winRate: number;
};

type Opponent = Omit<Stats, 'matches'> & {
    id: string;
    name: string;
    logo: string;
    opponentWins: number;
    firstMeeting: string;
    lastMeeting: string;
    currentStreak: string | null;
    tournaments: string[];
    matches: HistoryMatch[];
};

type Participation = {
    tournamentId: string;
    tournamentName: string;
    tournamentLogo: string | null;
    season: string;
    sportId: string | null;
    finished: boolean;
    category: string | null;
    format: string | null;
    country: string | null;
    region: string | null;
    phase: string | null;
    position: number | null;
    teamsCount: number | null;
    matchesPlayed: number;
    wins: number;
    draws: number;
    losses: number;
    pointsFor: number;
    pointsAgainst: number;
    difference: number;
    tablePoints: number | null;
    result: string | null;
};

type HistoryPayload = {
    ok: boolean;
    error?: string;
    generatedAt: string;
    matches: HistoryMatch[];
    participations: Participation[];
    filters: { seasons: string[]; tournaments: string[]; categories: string[]; sports: string[] };
};

type HistorySection = 'general' | 'rivals' | 'positions';
type RivalSort = 'matches' | 'wins' | 'rate' | 'name' | 'recent';

const EMPTY_STATS: Stats = { matches: 0, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, difference: 0, winRate: 0 };

// El historial usa los slugs internos de deporte (`tournaments.sport_id`), no los
// ids numéricos de FlashScore de SPORTS_BY_ID.
const SPORT_NAMES: Record<string, string> = {
    rugby: 'Rugby',
    'field-hockey': 'Hockey',
    football: 'Fútbol',
    basketball: 'Básquet',
    volleyball: 'Vóley',
    handball: 'Handball',
    tennis: 'Tenis',
    'american-football': 'Fútbol americano',
};

function sportLabel(id: string) {
    return SPORT_NAMES[id] || id.replace(/-/g, ' ').replace(/^\w/, (letter) => letter.toUpperCase());
}

const POINTS_SPORTS = new Set(['rugby', 'basketball', 'american-football', 'volleyball']);

function calculateStats(matches: HistoryMatch[]): Stats {
    if (!matches.length) return EMPTY_STATS;
    const stats = matches.reduce((acc, match) => {
        acc.matches += 1;
        acc.pointsFor += match.pointsFor;
        acc.pointsAgainst += match.pointsAgainst;
        acc.wins += match.outcome === 'win' ? 1 : 0;
        acc.draws += match.outcome === 'draw' ? 1 : 0;
        acc.losses += match.outcome === 'loss' ? 1 : 0;
        return acc;
    }, { ...EMPTY_STATS });
    stats.difference = stats.pointsFor - stats.pointsAgainst;
    stats.winRate = Math.round((stats.wins / stats.matches) * 1000) / 10;
    return stats;
}

function formatDate(value: string | null | undefined, compact = false) {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Sin fecha';
    return date.toLocaleDateString('es-AR', compact
        ? { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: APP_TIMEZONE }
        : { day: 'numeric', month: 'short', year: 'numeric', timeZone: APP_TIMEZONE });
}

function signed(value: number) {
    return value > 0 ? `+${value}` : String(value);
}

function longestRun(matches: HistoryMatch[], outcome: Outcome) {
    let best = 0;
    let current = 0;
    for (const match of matches) {
        current = match.outcome === outcome ? current + 1 : 0;
        if (current > best) best = current;
    }
    return best;
}

function streakLabel(matchesNewestFirst: HistoryMatch[]) {
    const first = matchesNewestFirst[0]?.outcome;
    if (!first) return null;
    let count = 0;
    for (const match of matchesNewestFirst) {
        if (match.outcome !== first) break;
        count += 1;
    }
    const labels = { win: count === 1 ? 'victoria' : 'victorias', draw: count === 1 ? 'empate' : 'empates', loss: count === 1 ? 'derrota' : 'derrotas' };
    return `${count} ${labels[first]}`;
}

function MatchLine({ match }: { match: HistoryMatch }) {
    // Un partido del archivo ('ra-…') no tiene página propia: la fila navega al
    // torneo en cuestión cuando el torneo sí la tiene, y si no, no linkea.
    const isArchiveMatch = match.id.startsWith('ra-');
    const tournamentHref = match.tournamentId && !match.tournamentId.startsWith('ra-')
        ? `/torneos/${match.tournamentId}`
        : null;
    const href = isArchiveMatch ? tournamentHref : `/matches/${match.id}`;
    const body = (
        <>
            <time dateTime={match.date}>{formatDate(match.date, true)}</time>
            <span className={`${styles.resultPill} ${styles[`result_${match.outcome}`]}`}>
                {match.outcome === 'win' ? 'G' : match.outcome === 'draw' ? 'E' : 'P'}
            </span>
            <span className={styles.historyMatchTeams}>{match.home.name} <strong>{match.homeScore}–{match.awayScore}</strong> {match.away.name}</span>
            <span className={styles.historyMatchTournament}>{match.tournamentName || 'Sin torneo'}</span>
        </>
    );
    return href ? (
        <Link href={href} className={styles.historyMatchLine}>
            {body}
            <ChevronRight size={15} aria-hidden="true" />
        </Link>
    ) : (
        <div className={styles.historyMatchLine}>{body}</div>
    );
}

function TeamMark({ name, logo }: { name: string; logo?: string | null }) {
    return (
        <span className={styles.historyTeamMark}>
            {logo ? <Image src={logo} alt="" width={34} height={34} unoptimized /> : <span aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>}
        </span>
    );
}

export default function HistoryTab({ clubId, teamName, selectedSport }: { clubId: string; teamName: string; selectedSport: string }) {
    const { data: payload, error: historyError, isLoading: loading } = useSWR<HistoryPayload>(
        `/api/clubs/${encodeURIComponent(clubId)}/history`,
        async (url: string) => {
            const response = await fetch(url, { cache: 'no-store' });
            const json = await response.json() as HistoryPayload;
            if (!response.ok || !json.ok) throw new Error(json.error || 'No se pudo cargar el historial.');
            return json;
        },
        { revalidateOnFocus: false, keepPreviousData: true },
    );
    const [section, setSection] = useState<HistorySection>('general');
    const [sport, setSport] = useState(selectedSport);
    const [season, setSeason] = useState('all');
    const [tournament, setTournament] = useState('all');
    const [category, setCategory] = useState('all');
    const [venue, setVenue] = useState('all');
    const [rivalSearch, setRivalSearch] = useState('');
    const [rivalSort, setRivalSort] = useState<RivalSort>('matches');
    const [selectedRivalId, setSelectedRivalId] = useState<string | null>(null);
    const [openSeason, setOpenSeason] = useState<string | null>(null);
    const [exportingFormat, setExportingFormat] = useState<RivalExportFormat | null>(null);
    const [exportError, setExportError] = useState<string | null>(null);
    const guestInvite = useGuestExportInvite();

    useEffect(() => { setExportError(null); }, [selectedRivalId]);

    // El selector de deporte del header (cuando existe) manda; el filtro interno
    // cubre a los clubes cuya página no lo muestra.
    useEffect(() => { setSport(selectedSport); }, [selectedSport]);

    const allMatches = useMemo(() => payload?.matches ?? [], [payload]);
    const filteredMatches = useMemo(() => allMatches.filter((match) => {
        if (sport !== 'all' && match.sportId !== sport) return false;
        if (season !== 'all' && match.season !== season) return false;
        if (tournament !== 'all' && match.tournamentName !== tournament) return false;
        if (category !== 'all' && match.category !== category) return false;
        if (venue === 'home' && !match.isHome) return false;
        if (venue === 'away' && match.isHome) return false;
        return true;
    }), [allMatches, category, season, sport, tournament, venue]);
    const filteredStats = useMemo(() => calculateStats(filteredMatches), [filteredMatches]);

    const filteredSeasons = useMemo(() => {
        const groups = new Map<string, HistoryMatch[]>();
        filteredMatches.forEach((match) => groups.set(match.season, [...(groups.get(match.season) ?? []), match]));
        return Array.from(groups.entries()).map(([label, matches]) => ({ season: label, ...calculateStats(matches), matches })).sort((a, b) => b.season.localeCompare(a.season));
    }, [filteredMatches]);

    // Los rivales se arman acá desde los partidos ya filtrados: primer y último
    // cruce, racha y balance responden a los mismos filtros que el resto del tab.
    const filteredOpponents = useMemo(() => {
        const groups = new Map<string, HistoryMatch[]>();
        for (const match of filteredMatches) {
            const opponent = match.isHome ? match.away : match.home;
            const key = opponent.id || opponent.name;
            groups.set(key, [...(groups.get(key) ?? []), match]);
        }
        const search = rivalSearch.trim().toLocaleLowerCase('es');
        return Array.from(groups.entries()).map(([key, matches]): Opponent => {
            const lastMatch = matches[0];
            const firstMatch = matches[matches.length - 1];
            const opponent = lastMatch.isHome ? lastMatch.away : lastMatch.home;
            const stats = calculateStats(matches);
            return {
                id: key,
                name: opponent.name,
                logo: opponent.logo,
                wins: stats.wins,
                draws: stats.draws,
                losses: stats.losses,
                pointsFor: stats.pointsFor,
                pointsAgainst: stats.pointsAgainst,
                difference: stats.difference,
                winRate: stats.winRate,
                opponentWins: matches.filter((match) => match.outcome === 'loss').length,
                firstMeeting: firstMatch.date,
                lastMeeting: lastMatch.date,
                currentStreak: streakLabel(matches),
                tournaments: Array.from(new Set(matches.map((match) => match.tournamentName).filter((value): value is string => Boolean(value)))),
                matches,
            };
        }).filter((opponent) => !search || opponent.name.toLocaleLowerCase('es').includes(search))
            .sort((a, b) => {
                if (rivalSort === 'wins') return b.wins - a.wins || b.matches.length - a.matches.length;
                if (rivalSort === 'rate') return b.winRate - a.winRate || b.matches.length - a.matches.length;
                if (rivalSort === 'name') return a.name.localeCompare(b.name);
                if (rivalSort === 'recent') return new Date(b.lastMeeting).getTime() - new Date(a.lastMeeting).getTime();
                return b.matches.length - a.matches.length;
            });
    }, [filteredMatches, rivalSearch, rivalSort]);

    const filteredParticipations = useMemo(() => (payload?.participations ?? []).filter((item) => {
        if (sport !== 'all' && item.sportId !== sport) return false;
        if (season !== 'all' && item.season !== season) return false;
        if (tournament !== 'all' && item.tournamentName !== tournament) return false;
        if (category !== 'all' && item.category !== category) return false;
        return true;
    }), [category, payload, season, sport, tournament]);

    // Hitos calculados sobre lo filtrado: al mirar solo rugby, un título de hockey
    // no puede aparecer en la vitrina.
    const highlights = useMemo(() => {
        const oldestFirst = [...filteredMatches].reverse();
        let currentWins = 0;
        let bestWinningStreak = 0;
        let currentUnbeaten = 0;
        let longestUnbeatenRun = 0;
        for (const match of oldestFirst) {
            currentWins = match.outcome === 'win' ? currentWins + 1 : 0;
            currentUnbeaten = match.outcome !== 'loss' ? currentUnbeaten + 1 : 0;
            bestWinningStreak = Math.max(bestWinningStreak, currentWins);
            longestUnbeatenRun = Math.max(longestUnbeatenRun, currentUnbeaten);
        }
        const biggestWin = filteredMatches.filter((match) => match.outcome === 'win').sort((a, b) => (b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst))[0] ?? null;
        const biggestLoss = filteredMatches.filter((match) => match.outcome === 'loss').sort((a, b) => (b.pointsAgainst - b.pointsFor) - (a.pointsAgainst - a.pointsFor))[0] ?? null;
        const positioned = filteredParticipations.filter((item) => item.position !== null);
        return {
            bestWinningStreak,
            longestUnbeatenRun,
            biggestWin,
            biggestLoss,
            firstMatch: oldestFirst[0] ?? null,
            lastMatch: filteredMatches[0] ?? null,
            titles: filteredParticipations.filter((item) => item.finished && item.position === 1).length,
            runnerUps: filteredParticipations.filter((item) => item.finished && item.position === 2).length,
            bestPosition: positioned.length ? Math.min(...positioned.map((item) => item.position!)) : null,
            worstPosition: positioned.length ? Math.max(...positioned.map((item) => item.position!)) : null,
        };
    }, [filteredMatches, filteredParticipations]);

    const scoreTerm = useMemo(() => {
        const sports = new Set(filteredMatches.map((match) => String(match.sportId ?? '').toLowerCase()).filter(Boolean));
        if (!sports.size) return 'Goles';
        return Array.from(sports).some((value) => POINTS_SPORTS.has(value)) ? 'Puntos' : 'Goles';
    }, [filteredMatches]);

    const selectedRival = filteredOpponents.find((opponent) => opponent.id === selectedRivalId) ?? null;

    // Mano a mano comparativo: estadísticas NEUTRALES por club (nunca "a
    // favor/en contra"), el mismo criterio que el export de rivales.
    const rivalCompare = selectedRival ? (() => {
        const matches = selectedRival.matches;
        const teamMargins = matches.filter((match) => match.outcome === 'win').map((match) => match.pointsFor - match.pointsAgainst);
        const rivalMargins = matches.filter((match) => match.outcome === 'loss').map((match) => match.pointsAgainst - match.pointsFor);
        return {
            teamLogo: matches[0].isHome ? matches[0].home.logo : matches[0].away.logo,
            teamMargin: teamMargins.length ? Math.max(...teamMargins) : null,
            rivalMargin: rivalMargins.length ? Math.max(...rivalMargins) : null,
            teamHighest: Math.max(...matches.map((match) => match.pointsFor)),
            rivalHighest: Math.max(...matches.map((match) => match.pointsAgainst)),
            teamStreak: longestRun(matches, 'win'),
            rivalStreak: longestRun(matches, 'loss'),
        };
    })() : null;

    const hasFilters = sport !== 'all' || season !== 'all' || tournament !== 'all' || category !== 'all' || venue !== 'all';

    const handleRivalExport = async (format: RivalExportFormat) => {
        if (!selectedRival || exportingFormat) return;
        const reference = selectedRival.matches[0];
        if (!reference) return;
        setExportingFormat(format);
        setExportError(null);
        try {
            await shareRivalHeadToHead({
                teamName,
                teamLogo: reference.isHome ? reference.home.logo : reference.away.logo,
                rivalName: selectedRival.name,
                rivalLogo: selectedRival.logo,
                scoreTerm,
                matches: selectedRival.matches.map((match) => ({
                    date: match.date,
                    isHome: match.isHome,
                    outcome: match.outcome,
                    pointsFor: match.pointsFor,
                    pointsAgainst: match.pointsAgainst,
                    tournamentName: match.tournamentName,
                })),
            }, format);
            // El mano a mano tambien lo baja un invitado: mismo cartel que el
            // resto de los exports, y recien cuando la imagen ya salio.
            guestInvite.notifyExportFinished();
        } catch (error) {
            setExportError(error instanceof Error ? error.message : 'No se pudo generar la imagen.');
        } finally {
            setExportingFormat(null);
        }
    };

    if (loading) {
        return (
            <div className={styles.historySkeleton} aria-label="Cargando historial" aria-busy="true">
                <div className={styles.historySkeletonTabs} />
                <div className={styles.historySkeletonFilters} />
                <div className={styles.historySkeletonScoreboard} />
                <div className={styles.historySkeletonRows} />
            </div>
        );
    }

    if (historyError) {
        return (
            <div className={styles.historyEmpty} role="alert">
                <History size={30} aria-hidden="true" />
                <h2>No pudimos cargar el historial</h2>
                <p>{historyError instanceof Error ? historyError.message : 'No se pudo cargar el historial.'}</p>
            </div>
        );
    }

    if (!payload || (payload.matches.length === 0 && payload.participations.length === 0)) {
        return (
            <div className={styles.historyEmpty}>
                <History size={30} aria-hidden="true" />
                <h2>Todavía no hay información histórica disponible para este equipo.</h2>
                <p>El archivo se completará automáticamente cuando existan partidos finalizados con marcador oficial.</p>
            </div>
        );
    }

    return (
        <section className={styles.historyRoot} aria-labelledby="history-title">
            <div className={styles.historyIntro}>
                <div>
                    <h2 id="history-title">Historial de {teamName}</h2>
                    <p>Partidos finalizados y posiciones registradas en G22 Scores.</p>
                </div>
                <span className={styles.historyUpdated}>Actualizado {formatDate(payload.generatedAt, true)}</span>
            </div>

            <div className={styles.historySectionTabs} role="tablist" aria-label="Secciones del historial">
                {([
                    ['general', 'Historial general', History],
                    ['rivals', 'Contra rivales', Shield],
                    ['positions', 'Posiciones en torneos', Trophy],
                ] as const).map(([id, label, Icon]) => (
                    <button key={id} type="button" role="tab" aria-selected={section === id} className={section === id ? styles.historySectionTabActive : ''} onClick={() => setSection(id)}>
                        <Icon size={17} aria-hidden="true" /> {label}
                    </button>
                ))}
            </div>

            <div className={styles.historyFilters} aria-label="Filtros del historial">
                {payload.filters.sports.length > 1 && (
                    <label><span>Deporte</span><select value={sport} onChange={(event) => setSport(event.target.value)}><option value="all">Todos</option>{payload.filters.sports.map((item) => <option key={item} value={item}>{sportLabel(item)}</option>)}</select></label>
                )}
                <label><span>Temporada</span><select value={season} onChange={(event) => setSeason(event.target.value)}><option value="all">Todas</option>{payload.filters.seasons.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label><span>Torneo</span><select value={tournament} onChange={(event) => setTournament(event.target.value)}><option value="all">Todos</option>{payload.filters.tournaments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label><span>Categoría</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Todas</option>{payload.filters.categories.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
                <label><span>Localía</span><select value={venue} onChange={(event) => setVenue(event.target.value)}><option value="all">Todas</option><option value="home">Local</option><option value="away">Visitante</option></select></label>
                {hasFilters && <button type="button" className={styles.clearHistoryFilters} onClick={() => { setSport('all'); setSeason('all'); setTournament('all'); setCategory('all'); setVenue('all'); }}>Limpiar filtros</button>}
            </div>

            {section === 'general' && (
                <div className={styles.historyPanel} role="tabpanel">
                    <div className={styles.historyOverview}>
                        <div className={styles.historyScoreboard}>
                            <div className={styles.historyTotalBlock}><strong>{filteredStats.matches}</strong><span>Partidos</span></div>
                            <div className={styles.historyRecord}>
                                <span><strong className={styles.historyWin}>{filteredStats.wins}</strong> ganados</span>
                                <span><strong>{filteredStats.draws}</strong> empatados</span>
                                <span><strong className={styles.historyLoss}>{filteredStats.losses}</strong> perdidos</span>
                            </div>
                            <div className={styles.historyGoals}><strong>{filteredStats.pointsFor}<small>–</small>{filteredStats.pointsAgainst}</strong><span>{scoreTerm} a favor y en contra</span></div>
                            <div className={styles.historyRate}><strong>{filteredStats.winRate}%</strong><span>Victorias</span></div>
                        </div>

                        <div className={styles.historyFacts}>
                            <div><span>Diferencia</span><strong className={filteredStats.difference >= 0 ? styles.positive : styles.negative}>{signed(filteredStats.difference)}</strong></div>
                            <div><span>Torneos disputados</span><strong>{filteredParticipations.length}</strong></div>
                            <div><span>Títulos</span><strong>{highlights.titles}</strong></div>
                            <div><span>Subcampeonatos</span><strong>{highlights.runnerUps}</strong></div>
                            <div><span>Mejor posición</span><strong>{highlights.bestPosition ? `${highlights.bestPosition}.º` : 'Sin registro'}</strong></div>
                            <div><span>Peor posición</span><strong>{highlights.worstPosition ? `${highlights.worstPosition}.º` : 'Sin registro'}</strong></div>
                        </div>
                    </div>

                    <div className={styles.historyMilestones}>
                        <article><Trophy size={18} aria-hidden="true" /><div><span>Mejor racha</span><strong>{highlights.bestWinningStreak} victorias</strong><small>{highlights.longestUnbeatenRun} partidos sin perder</small></div></article>
                        <article><ArrowUpRight size={18} aria-hidden="true" /><div><span>Mayor victoria</span>{highlights.biggestWin ? <><strong>{highlights.biggestWin.pointsFor}–{highlights.biggestWin.pointsAgainst}</strong><small>{formatDate(highlights.biggestWin.date)} · {highlights.biggestWin.tournamentName || 'Sin torneo'}</small></> : <strong>Sin registro</strong>}</div></article>
                        <article><ArrowDownRight size={18} aria-hidden="true" /><div><span>Peor derrota</span>{highlights.biggestLoss ? <><strong>{highlights.biggestLoss.pointsFor}–{highlights.biggestLoss.pointsAgainst}</strong><small>{formatDate(highlights.biggestLoss.date)} · {highlights.biggestLoss.tournamentName || 'Sin torneo'}</small></> : <strong>Sin registro</strong>}</div></article>
                    </div>

                    <div className={styles.historyEndpoints}>
                        <div><CalendarDays size={18} aria-hidden="true" /><span>Primer partido registrado</span><strong>{formatDate(highlights.firstMatch?.date)}</strong></div>
                        <div><History size={18} aria-hidden="true" /><span>Último partido disputado</span><strong>{formatDate(highlights.lastMatch?.date)}</strong></div>
                    </div>

                    <div className={styles.historySubheading}><div><h3>Temporadas</h3><p>Resultados organizados cronológicamente.</p></div><span>{filteredSeasons.length} registradas</span></div>
                    <div className={styles.historySeasons}>
                        {filteredSeasons.map((item) => (
                            <article key={item.season} className={styles.historySeason}>
                                <button type="button" aria-expanded={openSeason === item.season} onClick={() => setOpenSeason(openSeason === item.season ? null : item.season)}>
                                    <span><strong>Temporada {item.season}</strong><small>{Array.from(new Set(item.matches.map((match) => match.tournamentName).filter(Boolean))).join(' · ') || 'Sin torneo'}</small></span>
                                    <span className={styles.seasonRecord}>{item.matches.length} PJ <b>{item.wins}G</b> {item.draws}E <i>{item.losses}P</i></span>
                                    <ChevronDown size={18} aria-hidden="true" />
                                </button>
                                {openSeason === item.season && <div className={styles.historySeasonBody}>{item.matches.map((match) => <MatchLine key={match.id} match={match} />)}</div>}
                            </article>
                        ))}
                    </div>
                </div>
            )}

            {section === 'rivals' && (
                <div className={styles.historyPanel} role="tabpanel">
                    <div className={styles.rivalToolbar}>
                        <label className={styles.rivalSearch}><Search size={16} aria-hidden="true" /><input value={rivalSearch} onChange={(event) => setRivalSearch(event.target.value)} placeholder="Buscar rival" aria-label="Buscar rival" /></label>
                        <label><span className={styles.srOnly}>Ordenar rivales</span><select value={rivalSort} onChange={(event) => setRivalSort(event.target.value as RivalSort)}><option value="matches">Más enfrentamientos</option><option value="wins">Más victorias</option><option value="rate">Mejor porcentaje</option><option value="name">Nombre</option><option value="recent">Más reciente</option></select></label>
                    </div>

                    {selectedRival ? (
                        <div className={styles.rivalDetail}>
                            <button type="button" className={styles.rivalBack} onClick={() => setSelectedRivalId(null)}>← Todos los rivales</button>
                            <div className={styles.rivalDetailHeader}>
                                <TeamMark name={selectedRival.name} logo={selectedRival.logo} />
                                <div><span>Historial frente a</span><h3>{selectedRival.name}</h3><p>{selectedRival.tournaments.join(' · ') || 'Sin torneo registrado'}</p></div>
                            </div>
                            <div className={styles.rivalBalance}>
                                <div><strong>{selectedRival.matches.length}</strong><span>Partidos</span></div>
                                <div><strong className={styles.historyWin}>{selectedRival.wins}</strong><span>Ganó {teamName}</span></div>
                                <div><strong>{selectedRival.draws}</strong><span>Empates</span></div>
                                <div><strong className={styles.historyLoss}>{selectedRival.opponentWins}</strong><span>Ganó {selectedRival.name}</span></div>
                                <div><strong>{selectedRival.pointsFor}–{selectedRival.pointsAgainst}</strong><span>{scoreTerm}</span></div>
                            </div>
                            {rivalCompare && (
                                <div className={styles.rivalCompare}>
                                    <div className={styles.rivalCompareHead}>
                                        <span><TeamMark name={teamName} logo={rivalCompare.teamLogo} /><strong>{teamName}</strong></span>
                                        <span>Mano a mano</span>
                                        <span><strong>{selectedRival.name}</strong><TeamMark name={selectedRival.name} logo={selectedRival.logo} /></span>
                                    </div>
                                    <div className={styles.rivalCompareRow}>
                                        <strong>{rivalCompare.teamMargin ?? '—'}</strong>
                                        <span>Mayor diferencia</span>
                                        <strong>{rivalCompare.rivalMargin ?? '—'}</strong>
                                    </div>
                                    <div className={styles.rivalCompareRow}>
                                        <strong>{rivalCompare.teamHighest}</strong>
                                        <span>Máximo marcador</span>
                                        <strong>{rivalCompare.rivalHighest}</strong>
                                    </div>
                                    <div className={styles.rivalCompareRow}>
                                        <strong>{rivalCompare.teamStreak}</strong>
                                        <span>Mejor racha ganadora</span>
                                        <strong>{rivalCompare.rivalStreak}</strong>
                                    </div>
                                </div>
                            )}
                            <div className={styles.rivalDetailFacts}>
                                <span>Primer cruce <strong>{formatDate(selectedRival.firstMeeting)}</strong></span>
                                <span>Último cruce <strong>{formatDate(selectedRival.lastMeeting)}</strong></span>
                                <span>Racha actual <strong>{selectedRival.currentStreak || 'Sin racha'}</strong></span>
                            </div>
                            <div className={styles.rivalExportRow}>
                                <span>Exportar mano a mano</span>
                                <button type="button" className={styles.rivalExportButton} disabled={exportingFormat !== null} onClick={() => handleRivalExport('4:5')}>
                                    {exportingFormat === '4:5' ? 'Generando…' : '4:5 · Post'}
                                </button>
                                <button type="button" className={styles.rivalExportButton} disabled={exportingFormat !== null} onClick={() => handleRivalExport('9:16')}>
                                    {exportingFormat === '9:16' ? 'Generando…' : '9:16 · Historia'}
                                </button>
                                {exportError && <small role="alert">{exportError}</small>}
                            </div>
                            <GuestExportInvite isOpen={guestInvite.isOpen} onClose={guestInvite.close} />
                            <div className={styles.historySeasonBody}>{selectedRival.matches.map((match) => <MatchLine key={match.id} match={match} />)}</div>
                        </div>
                    ) : (
                        <>
                            <div className={styles.rivalTableWrap}>
                                <table className={styles.rivalTable}>
                                    <thead><tr><th>Rival</th><th>PJ</th><th>G</th><th>E</th><th>P</th><th>{scoreTerm}</th><th>Dif.</th><th>Victorias</th><th>Último cruce</th><th><span className={styles.srOnly}>Abrir</span></th></tr></thead>
                                    <tbody>{filteredOpponents.map((opponent) => <tr key={opponent.id} onClick={() => setSelectedRivalId(opponent.id)}><td><TeamMark name={opponent.name} logo={opponent.logo} /><strong>{opponent.name}</strong></td><td>{opponent.matches.length}</td><td className={styles.historyWin}>{opponent.wins}</td><td>{opponent.draws}</td><td className={styles.historyLoss}>{opponent.losses}</td><td>{opponent.pointsFor}–{opponent.pointsAgainst}</td><td className={opponent.difference >= 0 ? styles.positive : styles.negative}>{signed(opponent.difference)}</td><td>{opponent.winRate}%</td><td>{formatDate(opponent.lastMeeting, true)}</td><td><button type="button" aria-label={`Ver historial contra ${opponent.name}`} onClick={() => setSelectedRivalId(opponent.id)}><ChevronRight size={16} /></button></td></tr>)}</tbody>
                                </table>
                            </div>
                            <div className={styles.rivalCards}>{filteredOpponents.map((opponent) => <button type="button" key={opponent.id} onClick={() => setSelectedRivalId(opponent.id)}><span className={styles.rivalCardName}><TeamMark name={opponent.name} logo={opponent.logo} /><strong>{opponent.name}</strong><ChevronRight size={16} /></span><span className={styles.rivalCardRecord}><b>{opponent.matches.length} PJ</b><em>{opponent.wins}G</em><span>{opponent.draws}E</span><i>{opponent.losses}P</i></span><small>{opponent.pointsFor}–{opponent.pointsAgainst} · {opponent.winRate}% victorias</small></button>)}</div>
                            {!filteredOpponents.length && <div className={styles.historyEmptyCompact}>No se encontraron rivales con los filtros seleccionados.</div>}
                        </>
                    )}
                </div>
            )}

            {section === 'positions' && (
                <div className={styles.historyPanel} role="tabpanel">
                    <div className={styles.historySubheading}><div><h3>Evolución por temporada</h3><p>Posición final registrada en cada participación.</p></div><span>{filteredParticipations.length} participaciones</span></div>
                    {filteredParticipations.some((item) => item.position !== null) && (
                        <div className={styles.positionTimeline} aria-label="Evolución histórica de posiciones">
                            {(() => {
                                const maxPosition = Math.max(...filteredParticipations.map((entry) => entry.position || 1));
                                return filteredParticipations.filter((item) => item.position !== null).slice().reverse().map((item) => {
                                const position = item.position || 1;
                                // La barra mide el puesto contra el tamaño de ESA tabla: un 4.º de 16
                                // no vale lo mismo que un 4.º de 8.
                                const fieldSize = item.teamsCount && item.teamsCount >= position ? item.teamsCount : maxPosition;
                                const height = Math.max(14, 100 - ((position - 1) / Math.max(1, fieldSize - 1)) * 76);
                                return <div key={`${item.tournamentId}-${item.season}`} title={item.teamsCount ? `${position}.º de ${item.teamsCount} equipos` : `${position}.º`}><span className={styles.positionValue}>{item.finished && item.position === 1 ? <Trophy size={14} aria-label="Campeón" /> : `${item.position}.º`}</span><span className={styles.positionBarTrack}><span className={styles.positionBar} style={{ height: `${height}%` }} /></span><strong>{item.season}</strong><small title={item.tournamentName}>{item.tournamentName}</small></div>;
                                });
                            })()}
                        </div>
                    )}
                    <div className={styles.participationList}>
                        {filteredParticipations.map((item) => {
                            // Una participación del archivo ('ra-comp-…'/'ra-tour-…') no
                            // tiene página de torneo: se muestra sin link en vez de romper.
                            const linkable = Boolean(item.tournamentId) && !item.tournamentId.startsWith('ra-');
                            const body = (
                                <>
                                    <TeamMark name={item.tournamentName} logo={item.tournamentLogo} />
                                    <div className={styles.participationIdentity}><strong>{item.tournamentName}</strong><span>{item.season}{item.category ? ` · ${item.category}` : ''}{item.phase ? ` · ${item.phase}` : ''}</span></div>
                                    <div className={styles.participationResult}>{item.finished && item.position === 1 && <Medal size={16} aria-hidden="true" />}<strong>{item.result || item.phase || 'Sin posición final'}</strong><span>{item.teamsCount ? `${item.teamsCount} equipos` : 'Participación registrada'}</span></div>
                                    <div className={styles.participationRecord}><strong>{item.matchesPlayed} PJ</strong><span>{item.wins}G · {item.draws}E · {item.losses}P</span></div>
                                    <div className={styles.participationPoints}><strong>{item.tablePoints ?? '—'}</strong><span>Pts. tabla</span></div>
                                </>
                            );
                            return linkable ? (
                                <Link key={`${item.tournamentId}-${item.season}`} href={`/torneos/${item.tournamentId}`} className={styles.participationRow}>
                                    {body}
                                    <ChevronRight size={17} aria-hidden="true" />
                                </Link>
                            ) : (
                                <div key={`${item.tournamentId}-${item.season}`} className={styles.participationRow}>
                                    {body}
                                </div>
                            );
                        })}
                    </div>
                    {!filteredParticipations.length && <div className={styles.historyEmptyCompact}>No hay participaciones registradas con estos filtros.</div>}
                </div>
            )}
        </section>
    );
}
