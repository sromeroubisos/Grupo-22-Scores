'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ExportImage from '@/components/ExportImage';
import DateStrip from '@/components/DateStrip';
import { useSport } from '@/context/SportContext';
import { useMatchesStore } from '@/hooks/useMatchesStore';
import { getMatchPenaltyScore, hasMatchPenaltyShootout } from '@/lib/matchUtils';
import { generateLocalDateKeys, toLocalMatch } from '@/lib/timezone';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import styles from './page.module.css';

type PublicMatch = {
    id: string | number;
    dateTime: string;
    status?: string | null;
    venue?: string | null;
    roundId?: string | null;
    score?: {
        home?: number | null;
        away?: number | null;
        penalties?: {
            home?: number | null;
            away?: number | null;
        } | null;
    } | null;
    clock?: { period?: string | null } | null;
    homeTeam?: { name?: string | null; logo?: string | null } | null;
    awayTeam?: { name?: string | null; logo?: string | null } | null;
    tournament?: {
        id?: string | null;
        name?: string | null;
        country?: string | null;
    } | null;
};

type DisplayStatus = 'scheduled' | 'live' | 'finished';

type FixtureRow = {
    id: string;
    dateTime: string;
    time: string;
    minute?: string;
    tournamentName: string;
    country: string;
    home: string;
    homeLogo: string;
    homeScore: number | null;
    homePenaltyScore: number | null;
    away: string;
    awayLogo: string;
    awayScore: number | null;
    awayPenaltyScore: number | null;
    status: DisplayStatus;
    venue: string;
    roundLabel: string;
};

type FixtureGroup = {
    id: string;
    tournamentName: string;
    country: string;
    matches: FixtureRow[];
};

function normalizeStatus(status: unknown): DisplayStatus {
    const normalized = String(status ?? '').trim().toLowerCase();
    if (normalized === 'live' || normalized === 'in_play') return 'live';
    if (normalized === 'final' || normalized === 'finished' || normalized === 'ft') return 'finished';
    return 'scheduled';
}

function formatRoundLabel(roundId: unknown): string {
    const normalized = String(roundId ?? '').trim();
    if (!normalized) return 'General';
    if (/^f\d+$/i.test(normalized)) {
        return normalized.replace(/^f/i, 'Fecha ');
    }
    return normalized;
}

function createFixtureRow(match: PublicMatch, timeZone: string): FixtureRow {
    const { localTime } = toLocalMatch(match.dateTime, timeZone);
    const status = normalizeStatus(match.status);
    const penalties = hasMatchPenaltyShootout(match) ? getMatchPenaltyScore(match) : null;

    return {
        id: String(match.id),
        dateTime: match.dateTime,
        time: localTime || '--:--',
        minute: typeof match.clock?.period === 'string' && match.clock.period.trim() ? match.clock.period.trim() : undefined,
        tournamentName: String(match.tournament?.name || 'Competencia'),
        country: String(match.tournament?.country || 'Internacional'),
        home: String(match.homeTeam?.name || 'Local'),
        homeLogo: resolveTeamLogo(match.homeTeam),
        homeScore: typeof match.score?.home === 'number' ? match.score.home : (status === 'scheduled' ? null : 0),
        homePenaltyScore: penalties?.home ?? null,
        away: String(match.awayTeam?.name || 'Visitante'),
        awayLogo: resolveTeamLogo(match.awayTeam),
        awayScore: typeof match.score?.away === 'number' ? match.score.away : (status === 'scheduled' ? null : 0),
        awayPenaltyScore: penalties?.away ?? null,
        status,
        venue: String(match.venue || 'Sede a confirmar'),
        roundLabel: formatRoundLabel(match.roundId),
    };
}

export default function FixturesPage() {
    const { activeSports, selectedSport, setSelectedSport } = useSport();
    const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedTournament, setSelectedTournament] = useState('all');
    const { matches, loading, error: sourceError } = useMatchesStore(selectedDate, selectedSport.id);

    useEffect(() => {
        const today = generateLocalDateKeys(timeZone, 0, 0)[0]?.dateKey || '';
        if (today) {
            setSelectedDate((current) => current || today);
        }
    }, [timeZone]);

    const fixtureGroups = useMemo<FixtureGroup[]>(() => {
        const groups = new Map<string, FixtureGroup>();

        (matches as PublicMatch[]).forEach((match) => {
            if (!match?.dateTime) return;

            const row = createFixtureRow(match, timeZone);
            const tournamentName = row.tournamentName;
            const country = row.country;
            const key = String(match.tournament?.id || `${country}::${tournamentName}`);

            const existing = groups.get(key);
            if (existing) {
                existing.matches.push(row);
                return;
            }

            groups.set(key, {
                id: key,
                tournamentName,
                country,
                matches: [row],
            });
        });

        return [...groups.values()]
            .map((group) => ({
                ...group,
                matches: [...group.matches].sort((left, right) => (
                    new Date(left.dateTime).getTime() - new Date(right.dateTime).getTime()
                )),
            }))
            .sort((left, right) => (
                `${left.country}: ${left.tournamentName}`.localeCompare(`${right.country}: ${right.tournamentName}`)
            ));
    }, [matches, timeZone]);

    const tournamentOptions = useMemo(() => (
        fixtureGroups.map((group) => ({
            id: group.id,
            label: `${group.country}: ${group.tournamentName}`,
        }))
    ), [fixtureGroups]);

    useEffect(() => {
        if (selectedTournament === 'all') return;
        if (!tournamentOptions.some((option) => option.id === selectedTournament)) {
            setSelectedTournament('all');
        }
    }, [selectedTournament, tournamentOptions]);

    const filteredGroups = useMemo(() => (
        selectedTournament === 'all'
            ? fixtureGroups
            : fixtureGroups.filter((group) => group.id === selectedTournament)
    ), [fixtureGroups, selectedTournament]);

    const liveMatches = useMemo(() => (
        filteredGroups.flatMap((group) => group.matches.filter((match) => match.status === 'live'))
    ), [filteredGroups]);

    const exportMatches = useMemo(() => (
        filteredGroups.flatMap((group) => (
            group.matches.map((match) => ({
                homeTeam: match.home,
                awayTeam: match.away,
                homeLogo: match.homeLogo,
                awayLogo: match.awayLogo,
                homeScore: match.homeScore ?? undefined,
                awayScore: match.awayScore ?? undefined,
                time: match.time,
                status: match.status,
                dateLabel: `${group.country}: ${group.tournamentName}`,
                kickoffAt: match.dateTime,
            }))
        ))
    ), [filteredGroups]);

    const selectedTournamentLabel = tournamentOptions.find((option) => option.id === selectedTournament)?.label;

    return (
        <div className={styles.page}>
            <section className={styles.header}>
                <div className="container">
                    <div className={styles.headerContent}>
                        <div>
                            <h1 className={styles.title}>Fixtures</h1>
                            <p className={styles.subtitle}>
                                Partidos p&uacute;blicos de {selectedSport.nameEs} conectados a la API en tiempo real.
                            </p>
                        </div>

                        <div className={styles.headerActions}>
                            <select
                                className={styles.select}
                                value={selectedSport.id}
                                onChange={(event) => {
                                    const nextSport = activeSports.find((sport) => sport.id === event.target.value);
                                    if (nextSport) setSelectedSport(nextSport);
                                }}
                                aria-label="Seleccionar deporte"
                            >
                                {activeSports.map((sport) => (
                                    <option key={sport.id} value={sport.id}>
                                        {sport.nameEs}
                                    </option>
                                ))}
                            </select>

                            <div className={styles.dateSelector}>
                                <DateStrip
                                    selectedDate={selectedDate}
                                    onSelectDate={setSelectedDate}
                                />
                            </div>

                            <select
                                className={styles.select}
                                value={selectedTournament}
                                onChange={(event) => setSelectedTournament(event.target.value)}
                                aria-label="Filtrar torneo"
                            >
                                <option value="all">Todas las competencias</option>
                                {tournamentOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                        {option.label}
                                    </option>
                                ))}
                            </select>

                            {exportMatches.length > 0 ? (
                                <ExportImage
                                    template="dailyMatches"
                                    data={{
                                        date: selectedDate,
                                        tournament: selectedTournamentLabel || selectedSport.nameEs,
                                        matches: exportMatches,
                                    }}
                                    filename={`fixtures-${selectedSport.id}-${selectedDate}`}
                                />
                            ) : null}
                        </div>
                    </div>
                </div>
            </section>

            {sourceError?.message ? (
                <section className={styles.liveBanner}>
                    <div className="container">
                        <div className={styles.statusMessage}>
                            {sourceError.message}
                        </div>
                    </div>
                </section>
            ) : null}

            {liveMatches.length > 0 ? (
                <section className={styles.liveBanner}>
                    <div className="container">
                        <div className={styles.liveHeader}>
                            <span className={styles.liveBadge}>
                                <span className={styles.liveDot}></span>
                                {liveMatches.length} partido{liveMatches.length === 1 ? '' : 's'} en vivo
                            </span>
                        </div>
                        <div className={styles.liveMatches}>
                            {liveMatches.map((match) => (
                                <Link key={match.id} href={`/matches/${encodeURIComponent(match.id)}`} className={styles.liveCard}>
                                    <div className={styles.liveCardHeader}>
                                        <span className={styles.liveTournament}>{match.tournamentName}</span>
                                        <span className={styles.liveMinute}>{match.minute || 'EN VIVO'}</span>
                                    </div>
                                    <div className={styles.liveTeams}>
                                        <span className={styles.liveTeam}>
                                            <span>{match.home}</span>
                                            <span className={styles.liveScore}>{match.homeScore ?? '-'}</span>
                                        </span>
                                        <span className={styles.liveTeam}>
                                            <span>{match.away}</span>
                                            <span className={styles.liveScore}>{match.awayScore ?? '-'}</span>
                                        </span>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>
            ) : null}

            <section className={styles.content}>
                <div className="container">
                    {loading ? (
                        <div className={styles.emptyState}>
                            <p>Cargando partidos...</p>
                        </div>
                    ) : null}

                    {!loading && filteredGroups.length === 0 ? (
                        <div className={styles.emptyState}>
                            <p>No hay partidos programados para {selectedSport.nameEs} en esta fecha.</p>
                        </div>
                    ) : null}

                    {!loading && filteredGroups.length > 0 ? (
                        filteredGroups.map((group) => (
                            <div key={group.id} className={styles.dateGroup}>
                                <div className={styles.dateHeader}>
                                    <div>
                                        <h2 className={styles.dateTitle}>{group.tournamentName}</h2>
                                        <span className={styles.dateCount}>{group.country}</span>
                                    </div>
                                    <span className={styles.dateCount}>
                                        {group.matches.length} partido{group.matches.length === 1 ? '' : 's'}
                                    </span>
                                </div>

                                <div className={styles.matchesList}>
                                    {group.matches.map((match) => (
                                        <Link key={match.id} href={`/matches/${encodeURIComponent(match.id)}`} className={styles.matchCard}>
                                            <div className={styles.matchTime}>
                                                {match.status === 'live' ? (
                                                    <span className={styles.matchLive}>
                                                        <span className={styles.matchLiveDot}></span>
                                                        {match.minute || 'EN VIVO'}
                                                    </span>
                                                ) : match.status === 'finished' ? (
                                                    <span>FT</span>
                                                ) : (
                                                    <span>{match.time}</span>
                                                )}
                                            </div>

                                            <div className={styles.matchInfo}>
                                                <span className={styles.matchTournament}>{group.country}: {group.tournamentName}</span>
                                                <div className={styles.matchTeams}>
                                                    <div className={styles.matchTeam}>
                                                        <span className={styles.teamLogo}>
                                                            {match.homeLogo ? (
                                                                <Image
                                                                    src={match.homeLogo}
                                                                    alt={match.home}
                                                                    className={styles.teamLogoImg}
                                                                    width={28}
                                                                    height={28}
                                                                />
                                                            ) : (
                                                                <span className={styles.teamLogoFallback}>?</span>
                                                            )}
                                                        </span>
                                                        <span className={styles.teamName}>{match.home}</span>
                                                        <span className={styles.matchScoreWrap}>
                                                            <span className={styles.matchScore}>
                                                                {match.homeScore ?? (match.status === 'scheduled' ? '-' : match.homeScore)}
                                                            </span>
                                                            {match.homePenaltyScore !== null ? (
                                                                <span className={styles.matchPenaltyScore}>({match.homePenaltyScore})</span>
                                                            ) : null}
                                                        </span>
                                                    </div>
                                                    <div className={styles.matchTeam}>
                                                        <span className={styles.teamLogo}>
                                                            {match.awayLogo ? (
                                                                <Image
                                                                    src={match.awayLogo}
                                                                    alt={match.away}
                                                                    className={styles.teamLogoImg}
                                                                    width={28}
                                                                    height={28}
                                                                />
                                                            ) : (
                                                                <span className={styles.teamLogoFallback}>?</span>
                                                            )}
                                                        </span>
                                                        <span className={styles.teamName}>{match.away}</span>
                                                        <span className={styles.matchScoreWrap}>
                                                            <span className={styles.matchScore}>
                                                                {match.awayScore ?? (match.status === 'scheduled' ? '-' : match.awayScore)}
                                                            </span>
                                                            {match.awayPenaltyScore !== null ? (
                                                                <span className={styles.matchPenaltyScore}>({match.awayPenaltyScore})</span>
                                                            ) : null}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={styles.matchMeta}>
                                                <span className={styles.matchVenue}>
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                                        <circle cx="12" cy="10" r="3"></circle>
                                                    </svg>
                                                    {match.venue}
                                                </span>
                                                <span className={styles.matchCategory}>{match.roundLabel}</span>
                                            </div>

                                            <svg className={styles.matchArrow} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M9 18l6-6-6-6" />
                                            </svg>
                                        </Link>
                                    ))}
                                </div>
                            </div>
                        ))
                    ) : null}
                </div>
            </section>
        </div>
    );
}
