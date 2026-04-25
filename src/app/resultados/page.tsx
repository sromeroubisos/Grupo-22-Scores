'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ExportImage from '@/components/ExportImage';
import DateStrip from '@/components/DateStrip';
import { useSport } from '@/context/SportContext';
import { useMatchesStore } from '@/hooks/useMatchesStore';
import { getMatchPenaltyScore, getMatchWinnerByScore, hasMatchPenaltyShootout } from '@/lib/matchUtils';
import { generateLocalDateKeys } from '@/lib/timezone';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import styles from './page.module.css';

type PublicMatch = {
    id: string | number;
    dateTime: string;
    status?: string | null;
    roundId?: string | null;
    score?: {
        home?: number | null;
        away?: number | null;
        penalties?: {
            home?: number | null;
            away?: number | null;
        } | null;
    } | null;
    homeTeam?: { name?: string | null; logo?: string | null } | null;
    awayTeam?: { name?: string | null; logo?: string | null } | null;
    tournament?: {
        id?: string | null;
        name?: string | null;
        country?: string | null;
    } | null;
};

type ResultRow = {
    id: string;
    tournamentName: string;
    country: string;
    roundLabel: string;
    home: string;
    homeLogo: string;
    homeScore: number | null;
    homePenaltyScore: number | null;
    away: string;
    awayLogo: string;
    awayScore: number | null;
    awayPenaltyScore: number | null;
    dateTime: string;
    winner: 'home' | 'away' | null;
};

type ResultGroup = {
    id: string;
    tournamentName: string;
    country: string;
    matches: ResultRow[];
};

function isFinishedStatus(status: unknown) {
    const normalized = String(status ?? '').trim().toLowerCase();
    return normalized === 'final' || normalized === 'finished' || normalized === 'ft';
}

function formatRoundLabel(roundId: unknown): string {
    const normalized = String(roundId ?? '').trim();
    if (!normalized) return 'Final';
    if (/^f\d+$/i.test(normalized)) {
        return normalized.replace(/^f/i, 'Fecha ');
    }
    return normalized;
}

export default function ResultadosPage() {
    const { activeSports, selectedSport, setSelectedSport } = useSport();
    const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
    const [selectedDate, setSelectedDate] = useState('');
    const [selectedTournament, setSelectedTournament] = useState('all');
    const { matches, loading, error: sourceError } = useMatchesStore(selectedDate, selectedSport.id, {
        prefetchWindowDays: 2,
    });

    useEffect(() => {
        const today = generateLocalDateKeys(timeZone, 0, 0)[0]?.dateKey || '';
        if (today) {
            setSelectedDate((current) => current || today);
        }
    }, [timeZone]);

    const resultGroups = useMemo<ResultGroup[]>(() => {
        const groups = new Map<string, ResultGroup>();

        (matches as PublicMatch[])
            .filter((match) => isFinishedStatus(match.status))
            .forEach((match) => {
                const country = String(match.tournament?.country || 'Internacional');
                const tournamentName = String(match.tournament?.name || 'Competencia');
                const key = String(match.tournament?.id || `${country}::${tournamentName}`);
                const penalties = hasMatchPenaltyShootout(match) ? getMatchPenaltyScore(match) : null;
                const row: ResultRow = {
                    id: String(match.id),
                    tournamentName,
                    country,
                    roundLabel: formatRoundLabel(match.roundId),
                    home: String(match.homeTeam?.name || 'Local'),
                    homeLogo: resolveTeamLogo(match.homeTeam),
                    homeScore: typeof match.score?.home === 'number' ? match.score.home : 0,
                    homePenaltyScore: penalties?.home ?? null,
                    away: String(match.awayTeam?.name || 'Visitante'),
                    awayLogo: resolveTeamLogo(match.awayTeam),
                    awayScore: typeof match.score?.away === 'number' ? match.score.away : 0,
                    awayPenaltyScore: penalties?.away ?? null,
                    dateTime: match.dateTime,
                    winner: getMatchWinnerByScore(match),
                };

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
                    new Date(right.dateTime).getTime() - new Date(left.dateTime).getTime()
                )),
            }))
            .sort((left, right) => (
                `${left.country}: ${left.tournamentName}`.localeCompare(`${right.country}: ${right.tournamentName}`)
            ));
    }, [matches]);

    const tournamentOptions = useMemo(() => (
        resultGroups.map((group) => ({
            id: group.id,
            label: `${group.country}: ${group.tournamentName}`,
        }))
    ), [resultGroups]);

    useEffect(() => {
        if (selectedTournament === 'all') return;
        if (!tournamentOptions.some((option) => option.id === selectedTournament)) {
            setSelectedTournament('all');
        }
    }, [selectedTournament, tournamentOptions]);

    const filteredGroups = useMemo(() => (
        selectedTournament === 'all'
            ? resultGroups
            : resultGroups.filter((group) => group.id === selectedTournament)
    ), [resultGroups, selectedTournament]);

    const exportMatches = useMemo(() => (
        filteredGroups.flatMap((group) => (
            group.matches.map((match) => ({
                homeTeam: match.home,
                awayTeam: match.away,
                homeLogo: match.homeLogo,
                awayLogo: match.awayLogo,
                homeScore: match.homeScore ?? undefined,
                awayScore: match.awayScore ?? undefined,
                time: 'FT',
                status: 'finished' as const,
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
                            <h1 className={styles.title}>Resultados</h1>
                            <p className={styles.subtitle}>
                                Resultados p&uacute;blicos de {selectedSport.nameEs} conectados a la API para la fecha elegida.
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
                                    filename={`resultados-${selectedSport.id}-${selectedDate}`}
                                />
                            ) : null}
                        </div>
                    </div>
                </div>
            </section>

            {sourceError?.message ? (
                <section className={styles.content}>
                    <div className="container">
                        <div className={styles.statusMessage}>
                            {sourceError.message}
                        </div>
                    </div>
                </section>
            ) : null}

            <section className={styles.content}>
                <div className="container">
                    {loading ? (
                        <div className={styles.emptyState}>
                            <p>Cargando resultados...</p>
                        </div>
                    ) : null}

                    {!loading && filteredGroups.length === 0 ? (
                        <div className={styles.emptyState}>
                            <p>No hay resultados finales para {selectedSport.nameEs} en esta fecha.</p>
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
                                        {group.matches.length} resultado{group.matches.length === 1 ? '' : 's'}
                                    </span>
                                </div>

                                <div className={styles.matchesList}>
                                    {group.matches.map((match) => (
                                        <Link key={match.id} href={`/matches/${encodeURIComponent(match.id)}`} className={styles.resultCard}>
                                            <div className={styles.resultMeta}>
                                                <span className={styles.resultTournament}>{group.country}: {group.tournamentName}</span>
                                                <span className={styles.resultCategory}>{match.roundLabel}</span>
                                            </div>

                                            <div className={styles.resultContent}>
                                                <div className={styles.resultTeam}>
                                                    <span className={styles.teamLogo}>
                                                        {match.homeLogo ? (
                                                            <Image
                                                                src={match.homeLogo}
                                                                alt={match.home}
                                                                className={styles.teamLogoImg}
                                                                width={40}
                                                                height={40}
                                                            />
                                                        ) : (
                                                            <span className={styles.teamLogoFallback}>?</span>
                                                        )}
                                                    </span>
                                                    <span className={styles.teamName}>{match.home}</span>
                                                    <span className={styles.teamScoreWrap}>
                                                        <span className={`${styles.teamScore} ${match.winner === 'home' ? styles.winner : ''}`}>
                                                            {match.homeScore ?? '-'}
                                                        </span>
                                                        {match.homePenaltyScore !== null ? (
                                                            <span className={styles.teamPenaltyScore}>({match.homePenaltyScore})</span>
                                                        ) : null}
                                                    </span>
                                                </div>

                                                <div className={styles.resultDivider}>
                                                    <span className={styles.resultFinal}>Final</span>
                                                </div>

                                                <div className={styles.resultTeam}>
                                                    <span className={styles.teamLogo}>
                                                        {match.awayLogo ? (
                                                            <Image
                                                                src={match.awayLogo}
                                                                alt={match.away}
                                                                className={styles.teamLogoImg}
                                                                width={40}
                                                                height={40}
                                                            />
                                                        ) : (
                                                            <span className={styles.teamLogoFallback}>?</span>
                                                        )}
                                                    </span>
                                                    <span className={styles.teamName}>{match.away}</span>
                                                    <span className={styles.teamScoreWrap}>
                                                        <span className={`${styles.teamScore} ${match.winner === 'away' ? styles.winner : ''}`}>
                                                            {match.awayScore ?? '-'}
                                                        </span>
                                                        {match.awayPenaltyScore !== null ? (
                                                            <span className={styles.teamPenaltyScore}>({match.awayPenaltyScore})</span>
                                                        ) : null}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className={styles.resultAction}>
                                                <span>Ver detalles</span>
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M9 18l6-6-6-6" />
                                                </svg>
                                            </div>
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
