'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    AlertCircle,
    ArrowRight,
    BarChart3,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Filter,
    RefreshCw,
    Shield,
    Target,
    Trophy,
} from 'lucide-react';
import type {
    ClubDashboardCompetition,
    ClubDashboardMatch,
    ClubDashboardStanding,
} from '@/lib/club-admin/dashboard-types';
import { resolveActiveSeason, persistActiveSeason } from '@/lib/club-admin/activeSeasonSelection';

interface ClubCompetitionsPanelProps {
    competitions: ClubDashboardCompetition[];
    standings: ClubDashboardStanding[];
    matches: ClubDashboardMatch[];
    clubName: string;
    clubId?: string;
    loading?: boolean;
}

type CompetitionSegment = 'active' | 'upcoming' | 'finished';
type CompetitionDetailTab = 'table' | 'fixture' | 'performance' | 'analysis' | 'comparison';
type MatchResult = 'W' | 'L' | 'D';

interface MatchOutcomeEntry {
    result: MatchResult;
    match: ClubDashboardMatch;
    timestamp: number;
}

interface EnrichedCompetition extends ClubDashboardCompetition {
    seasonLabel: string;
    segment: CompetitionSegment;
    standing: ClubDashboardStanding | null;
    tournamentMatches: ClubDashboardMatch[];
    completedMatches: ClubDashboardMatch[];
    nextMatch: ClubDashboardMatch | null;
    lastMatch: ClubDashboardMatch | null;
    form: MatchOutcomeEntry[];
    winRate: number | null;
}

interface StandingsLiteRow {
    teamId: string;
    team: {
        name: string;
        logo: string | null;
    };
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points_for: number;
    points_against: number;
    difference: number;
    bonus_offensive: number;
    bonus_defensive: number;
    total_points: number;
    form: string[];
    adjustments: unknown[];
    status: string | null;
}

interface StandingsLiteState {
    status: 'loading' | 'loaded' | 'error';
    table: StandingsLiteRow[];
    lastCalculatedAt: string | null;
    error: string | null;
}

const DETAIL_TABS: Array<{ id: CompetitionDetailTab; label: string }> = [
    { id: 'table', label: 'Tabla de posiciones' },
    { id: 'fixture', label: 'Fixture del torneo' },
    { id: 'performance', label: 'Rendimiento del equipo' },
    { id: 'analysis', label: 'Analisis interno' },
    { id: 'comparison', label: 'Comparativa' },
];

const SEGMENT_TABS: Array<{ id: CompetitionSegment; label: string }> = [
    { id: 'active', label: 'Activas' },
    { id: 'upcoming', label: 'Proximas' },
    { id: 'finished', label: 'Finalizadas' },
];

function normalizeCompareValue(value: string | null | undefined) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
}

function getTimestamp(value: string | null | undefined) {
    if (!value) return null;

    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
}

function formatMatchSlot(value: string | null | undefined) {
    if (!value) return 'Fecha a confirmar';

    return new Intl.DateTimeFormat('es-AR', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(value));
}

function formatUpdatedAt(value: string | null | undefined) {
    if (!value) return 'Sin sincronizar';

    return new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(new Date(value));
}

function formatPosition(position: number | null | undefined) {
    return position != null ? `${position}\u00B0` : '--';
}

function formatSignedValue(value: number | null | undefined) {
    if (value == null) return '--';
    if (value > 0) return `+${value}`;
    return String(value);
}

function getCompetitionSeason(competition: ClubDashboardCompetition, competitionMatches: ClubDashboardMatch[]) {
    const timestamps = [
        getTimestamp(competition.nextMatchAt),
        getTimestamp(competition.recentMatchAt),
        getTimestamp(competition.updatedAt),
        ...competitionMatches.map((match) => getTimestamp(match.dateTime)),
    ].filter((value): value is number => value != null);

    if (timestamps.length === 0) return 'Sin temporada';

    return String(new Date(Math.max(...timestamps)).getFullYear());
}

function getCompetitionSegment(
    competition: ClubDashboardCompetition,
    standing: ClubDashboardStanding | null,
    competitionMatches: ClubDashboardMatch[],
    now: number
): CompetitionSegment {
    const hasFuture = competitionMatches.some((match) => {
        const timestamp = getTimestamp(match.dateTime);
        return timestamp != null && timestamp >= now;
    }) || getTimestamp(competition.nextMatchAt) != null;

    const hasPastMatch = competitionMatches.some((match) => {
        const timestamp = getTimestamp(match.dateTime);
        return timestamp != null && timestamp < now;
    });

    const hasHistory = Boolean(
        standing ||
        competition.played > 0 ||
        competition.recentMatchAt ||
        competition.updatedAt ||
        hasPastMatch
    );

    if (hasFuture && !hasHistory) return 'upcoming';
    if (hasFuture) return 'active';
    if (hasHistory) return 'finished';
    return 'active';
}

function getMatchOutcome(match: ClubDashboardMatch): MatchResult | null {
    if (match.score?.home == null || match.score?.away == null) return null;

    const clubScore = match.isHome ? match.score.home : match.score.away;
    const opponentScore = match.isHome ? match.score.away : match.score.home;

    if (clubScore == null || opponentScore == null) return null;
    if (clubScore === opponentScore) return 'D';
    return clubScore > opponentScore ? 'W' : 'L';
}

function normalizeFormResult(value: string): MatchResult {
    const normalized = value.toUpperCase();
    if (normalized === 'W' || normalized === 'L') return normalized;
    return 'D';
}

function getResultTone(result: MatchResult) {
    if (result === 'W') return 'is-win';
    if (result === 'L') return 'is-loss';
    return 'is-draw';
}

function getSegmentBadge(segment: CompetitionSegment) {
    if (segment === 'active') return { label: 'En curso', className: 'is-active' };
    if (segment === 'upcoming') return { label: 'Proximo', className: 'is-upcoming' };
    return { label: 'Finalizado', className: 'is-finished' };
}

function getCompetitionContextText(competition: EnrichedCompetition) {
    const divisionLabel = competition.divisionNames.length > 0
        ? competition.divisionNames.join(' / ')
        : null;
    const phaseLabel = competition.phaseName?.trim()
        ? `Fase ${competition.phaseName.trim()}.`
        : null;

    const competitiveLabel = competition.position == null
        ? 'Sin posicion oficial cargada todavia.'
        : competition.position === 1
            ? 'Liderando la tabla de referencia.'
            : competition.position <= 4
                ? `En zona alta con ${formatPosition(competition.position)}.`
                : `Compitiendo desde el ${formatPosition(competition.position)}.`;

    const groupLabel = competition.phaseType === 'group_stage'
        ? competition.groupNames.length > 0
            ? competition.groupCount > 1
                ? `${competition.groupNames.join(' / ')} dentro de ${competition.groupCount} grupo(s).`
                : `${competition.groupNames.join(' / ')} detectado.`
            : competition.groupCount > 1
                ? `${competition.groupCount} grupo(s) detectados en esta fase.`
                : null
        : null;

    return [competitiveLabel, divisionLabel, phaseLabel, groupLabel].filter(Boolean).join(' ');
}

function getCompetitionImpactText(competition: EnrichedCompetition) {
    if (competition.segment === 'upcoming') {
        return 'Debut competitivo: ideal para fijar objetivos y anticipar el primer cruce.';
    }

    if (competition.segment === 'finished') {
        return 'Competencia cerrada: revisa balance, aprendizajes y proyeccion para la siguiente ventana.';
    }

    if (competition.position != null && competition.position <= 4) {
        return 'Cruce sensible para sostener presencia en la zona alta.';
    }

    if (competition.position != null) {
        return 'Partido con impacto directo sobre la lectura competitiva del equipo.';
    }

    return 'La siguiente fecha define contexto y prioridad operativa dentro del torneo.';
}

function getObjectiveCopy(competitions: EnrichedCompetition[], segment: CompetitionSegment) {
    const positioned = competitions
        .map((competition) => competition.position)
        .filter((value): value is number => value != null);
    const bestPosition = positioned.length > 0 ? Math.min(...positioned) : null;

    if (segment === 'upcoming') {
        return {
            value: 'Preparar debut',
            meta: 'Objetivo sugerido antes del primer partido oficial',
        };
    }

    if (segment === 'finished') {
        return {
            value: 'Cerrar balance',
            meta: 'Capitalizar aprendizajes y conclusiones de staff',
        };
    }

    if (bestPosition != null && bestPosition <= 2) {
        return {
            value: 'Pelear la punta',
            meta: 'El equipo ya compite en la zona mas alta',
        };
    }

    if (bestPosition != null && bestPosition <= 4) {
        return {
            value: 'Sostener Top 4',
            meta: 'Consolidar clasificacion y margen competitivo',
        };
    }

    return {
        value: 'Clasificar',
        meta: 'Necesita sumar para entrar en el corte alto',
    };
}

function buildStandingsKey(standing: ClubDashboardStanding | null) {
    if (!standing?.phaseId) return null;
    return [standing.tournamentId, standing.phaseId, standing.groupId || 'all'].join('::');
}

function sortStandingCandidates(rows: ClubDashboardStanding[]) {
    return [...rows].sort((left, right) => {
        const rightUpdated = right.updatedAt ? new Date(right.updatedAt).getTime() : 0;
        const leftUpdated = left.updatedAt ? new Date(left.updatedAt).getTime() : 0;
        if (rightUpdated !== leftUpdated) {
            return rightUpdated - leftUpdated;
        }

        const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
        const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;
        return leftPosition - rightPosition;
    });
}

function selectStandingForCompetition(
    standings: ClubDashboardStanding[],
    competition: ClubDashboardCompetition | null
) {
    if (!competition || standings.length === 0) return null;

    const phaseScoped = competition.phaseId
        ? standings.filter((standing) => standing.phaseId === competition.phaseId)
        : standings;
    const candidates = phaseScoped.length > 0 ? phaseScoped : standings;

    if (competition.groupId) {
        const byGroup = candidates.filter((standing) => standing.groupId === competition.groupId);
        if (byGroup.length > 0) {
            return sortStandingCandidates(byGroup)[0] ?? null;
        }
    }

    if (competition.phaseType === 'group_stage') {
        const grouped = candidates.filter((standing) => standing.groupId);
        if (grouped.length > 0) {
            return sortStandingCandidates(grouped)[0] ?? null;
        }
    }

    const general = candidates.filter((standing) => !standing.groupId);
    if (general.length > 0) {
        return sortStandingCandidates(general)[0] ?? null;
    }

    return sortStandingCandidates(candidates)[0] ?? null;
}

function getHeaderContext(competitions: EnrichedCompetition[], clubName: string) {
    const uniqueDivisions = Array.from(
        new Set(competitions.flatMap((competition) => competition.divisionNames))
    );

    if (uniqueDivisions.length === 1) {
        return uniqueDivisions[0];
    }

    return clubName;
}

function getCommonFilters(competitions: EnrichedCompetition[]) {
    const seasons = Array.from(new Set(competitions.map((competition) => competition.seasonLabel)))
        .filter(Boolean)
        .sort((left, right) => right.localeCompare(left));

    const divisions = Array.from(new Set(competitions.flatMap((competition) => competition.divisionNames)))
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right));

    return { seasons, divisions };
}

function findSelectedStandingsRow(
    table: StandingsLiteRow[],
    competition: EnrichedCompetition,
    clubName: string
) {
    const candidateNames = new Set(
        [clubName, ...competition.clubNames]
            .map((value) => normalizeCompareValue(value))
            .filter(Boolean)
    );

    const byName = table.find((row) => candidateNames.has(normalizeCompareValue(row.team.name)));
    if (byName) return byName;

    if (competition.position != null) {
        return table.find((row) => row.position === competition.position) || null;
    }

    return null;
}

function renderFormDots(form: MatchOutcomeEntry[]) {
    if (form.length === 0) {
        return <span className="club-competition-form-empty">Sin cierres recientes</span>;
    }

    return form.map((entry) => (
        <span
            key={`${entry.match.id}-${entry.timestamp}`}
            className={`club-competition-form-dot ${getResultTone(entry.result)}`}
            title={`${entry.result} Ãƒâ€šÃ‚Â· ${entry.match.opponentShortName || entry.match.opponentName}`}
        >
            {entry.result}
        </span>
    ));
}

function renderFixtureList(
    title: string,
    matches: ClubDashboardMatch[],
    emptyLabel: string,
    emptyCopy: string,
    variant: 'upcoming' | 'results' = 'upcoming'
) {
    return (
        <section className="club-competition-panel">
            <div className="club-competition-panel-head">
                <div>
                    <span className="club-competition-panel-kicker">{title}</span>
                    <h4>{title}</h4>
                </div>
            </div>

            {matches.length === 0 ? (
                <div className="club-competition-empty-block">
                    <strong>{emptyLabel}</strong>
                    <p>{emptyCopy}</p>
                </div>
            ) : (
                <div className="club-competition-match-list">
                    {matches.map((match) => {
                        const homeLabel = match.home.shortName || match.home.name;
                        const awayLabel = match.away.shortName || match.away.name;
                        const hasScore = match.score?.home != null && match.score?.away != null;

                        if (variant === 'results') {
                            return (
                                <article key={match.id} className="club-competition-match-row is-result">
                                    <div className="club-competition-result-head">
                                        <span className="club-competition-result-status">Final</span>
                                        <span className="club-competition-result-date">{formatMatchSlot(match.dateTime)}</span>
                                    </div>

                                    <div className="club-competition-result-board">
                                        <div className="club-competition-result-team is-home">
                                            <strong>{homeLabel}</strong>
                                            <span>{match.isHome ? 'Nuestro club' : 'Rival local'}</span>
                                        </div>

                                        <div className="club-competition-result-score">
                                            <span className="club-competition-result-score-value">
                                                {hasScore ? `${match.score.home} - ${match.score.away}` : '--'}
                                            </span>
                                            <small>Resultado final</small>
                                        </div>

                                        <div className="club-competition-result-team is-away">
                                            <strong>{awayLabel}</strong>
                                            <span>{match.isHome ? 'Rival visitante' : 'Nuestro club'}</span>
                                        </div>
                                    </div>

                                    <div className="club-competition-result-meta">
                                        <span>
                                            {match.isHome ? 'Local' : 'Visitante'}
                                            {' Ã‚Â· '}
                                            {match.tournament?.name || 'Competencia del club'}
                                        </span>
                                        <small>{match.opponentShortName || match.opponentName}</small>
                                    </div>
                                </article>
                            );
                        }

                        return (
                            <article key={match.id} className="club-competition-match-row">
                                <div>
                                    <strong>{homeLabel} vs {awayLabel}</strong>
                                    <span>
                                        {match.isHome ? 'Local' : 'Visitante'}
                                        {' Ã‚Â· '}
                                        {match.tournament?.name || 'Competencia del club'}
                                    </span>
                                </div>
                                <div className="club-competition-match-meta">
                                    <span>{formatMatchSlot(match.dateTime)}</span>
                                    <small>{match.opponentShortName || match.opponentName}</small>
                                </div>
                            </article>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
export function ClubCompetitionsPanel({
    competitions,
    standings,
    matches,
    clubName,
    clubId,
    loading,
}: ClubCompetitionsPanelProps) {
    const [activeSegment, setActiveSegment] = useState<CompetitionSegment>('active');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedSeason, setSelectedSeason] = useState(() => clubId ? resolveActiveSeason(clubId) : 'all');
    const [selectedDivision, setSelectedDivision] = useState('all');
    const [selectedCompetitionId, setSelectedCompetitionId] = useState<string | null>(null);
    const [detailTab, setDetailTab] = useState<CompetitionDetailTab>('table');
    const [referenceNow] = useState(() => Date.now());
    const [standingsLiteCache, setStandingsLiteCache] = useState<Record<string, StandingsLiteState>>({});
    const requestedStandingsKeys = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (clubId) {
            persistActiveSeason(clubId, selectedSeason);
        }
    }, [clubId, selectedSeason]);

    const standingsByTournament = useMemo(() => {
        const map = new Map<string, ClubDashboardStanding[]>();

        for (const standing of standings) {
            const bucket = map.get(standing.tournamentId) ?? [];
            bucket.push(standing);
            map.set(standing.tournamentId, bucket);
        }

        for (const bucket of map.values()) {
            bucket.sort((left, right) => {
                const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
                const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;
                return leftPosition - rightPosition;
            });
        }

        return map;
    }, [standings]);

    const matchesByTournament = useMemo(() => {
        const map = new Map<string, ClubDashboardMatch[]>();

        for (const match of matches) {
            const tournamentId = match.tournament?.id;
            if (!tournamentId) continue;

            const bucket = map.get(tournamentId) ?? [];
            bucket.push(match);
            map.set(tournamentId, bucket);
        }

        for (const bucket of map.values()) {
            bucket.sort((left, right) => {
                const leftTimestamp = getTimestamp(left.dateTime) ?? 0;
                const rightTimestamp = getTimestamp(right.dateTime) ?? 0;
                return leftTimestamp - rightTimestamp;
            });
        }

        return map;
    }, [matches]);

    const enrichedCompetitions = useMemo<EnrichedCompetition[]>(() => {
        return competitions.map((competition) => {
            const competitionMatches = matchesByTournament.get(competition.tournamentId) ?? [];
            const standing = selectStandingForCompetition(
                standingsByTournament.get(competition.tournamentId) ?? [],
                competition,
            );

            const completedEntries = competitionMatches
                .map((match) => {
                    const timestamp = getTimestamp(match.dateTime);
                    const result = getMatchOutcome(match);
                    if (timestamp == null || result == null || timestamp > referenceNow) return null;
                    return { result, match, timestamp };
                })
                .filter((entry): entry is MatchOutcomeEntry => entry != null)
                .sort((left, right) => right.timestamp - left.timestamp);

            const completedMatches = completedEntries.map((entry) => entry.match);
            const nextMatch = competitionMatches.find((match) => {
                const timestamp = getTimestamp(match.dateTime);
                return timestamp != null && timestamp >= referenceNow;
            }) || null;

            const recentFinishedMatch = completedEntries[0]?.match ?? null;
            const segment = getCompetitionSegment(competition, standing, competitionMatches, referenceNow);
            const wins = completedEntries.filter((entry) => entry.result === 'W').length;
            const winRate = completedEntries.length > 0
                ? Math.round((wins / completedEntries.length) * 100)
                : null;

            return {
                ...competition,
                seasonLabel: getCompetitionSeason(competition, competitionMatches),
                segment,
                standing,
                tournamentMatches: competitionMatches,
                completedMatches,
                nextMatch,
                lastMatch: recentFinishedMatch,
                form: completedEntries.slice(0, 5).reverse(),
                winRate,
            };
        });
    }, [competitions, matchesByTournament, referenceNow, standingsByTournament]);

    const { seasons, divisions } = useMemo(
        () => getCommonFilters(enrichedCompetitions),
        [enrichedCompetitions]
    );

    const filteredCompetitions = useMemo(() => {
        return enrichedCompetitions.filter((competition) => {
            const matchesSegment = competition.segment === activeSegment;
            const matchesSeason = selectedSeason === 'all' || competition.seasonLabel === selectedSeason;
            const matchesDivision = selectedDivision === 'all' || competition.divisionNames.includes(selectedDivision);
            return matchesSegment && matchesSeason && matchesDivision;
        });
    }, [activeSegment, enrichedCompetitions, selectedDivision, selectedSeason]);

    const effectiveSelectedCompetitionId = filteredCompetitions.some(
        (competition) => competition.tournamentId === selectedCompetitionId
    )
        ? selectedCompetitionId
        : filteredCompetitions[0]?.tournamentId ?? null;

    const selectedCompetition = useMemo(
        () => filteredCompetitions.find((competition) => competition.tournamentId === effectiveSelectedCompetitionId)
            ?? enrichedCompetitions.find((competition) => competition.tournamentId === effectiveSelectedCompetitionId)
            ?? filteredCompetitions[0]
            ?? null,
        [effectiveSelectedCompetitionId, enrichedCompetitions, filteredCompetitions]
    );

    const selectedStanding = selectedCompetition?.standing ?? null;
    const selectedStandingsKey = buildStandingsKey(selectedStanding);
    const selectedStandingsState = selectedStandingsKey ? standingsLiteCache[selectedStandingsKey] : null;

    useEffect(() => {
        if (!selectedStanding?.phaseId || !selectedStandingsKey) return;
        if (selectedStandingsState?.status === 'loaded' || requestedStandingsKeys.current.has(selectedStandingsKey)) return;

        let cancelled = false;
        requestedStandingsKeys.current.add(selectedStandingsKey);

        const params = new URLSearchParams({ phaseId: selectedStanding.phaseId });
        if (selectedStanding.groupId) {
            params.set('groupId', selectedStanding.groupId);
        }

        fetch(`/api/admin/tournaments/${encodeURIComponent(selectedStanding.tournamentId)}/standings/lite?${params.toString()}`, {
            cache: 'no-store',
        })
            .then(async (response) => {
                const payload = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo cargar la tabla del torneo.');
                }

                if (cancelled) return;

                setStandingsLiteCache((current) => ({
                    ...current,
                    [selectedStandingsKey]: {
                        status: 'loaded',
                        table: Array.isArray(payload?.table) ? payload.table : [],
                        lastCalculatedAt: typeof payload?.last_calculated_at === 'string' ? payload.last_calculated_at : null,
                        error: null,
                    },
                }));
            })
            .catch((error) => {
                if (cancelled) return;

                setStandingsLiteCache((current) => ({
                    ...current,
                    [selectedStandingsKey]: {
                        status: 'error',
                        table: current[selectedStandingsKey]?.table ?? [],
                        lastCalculatedAt: current[selectedStandingsKey]?.lastCalculatedAt ?? null,
                        error: error instanceof Error ? error.message : 'No se pudo cargar la tabla del torneo.',
                    },
                }));
            });

        return () => {
            cancelled = true;
        };
    }, [selectedStanding, selectedStandingsKey, selectedStandingsState?.status]);

    const selectedTable = useMemo(
        () => selectedStandingsState?.table ?? [],
        [selectedStandingsState?.table]
    );
    const selectedTableRow = useMemo(
        () => (selectedCompetition ? findSelectedStandingsRow(selectedTable, selectedCompetition, clubName) : null),
        [clubName, selectedCompetition, selectedTable]
    );
    const selectedRowIndex = selectedTableRow
        ? selectedTable.findIndex((row) => row.teamId === selectedTableRow.teamId || row.position === selectedTableRow.position)
        : -1;
    const leaderRow = selectedTable[0] ?? null;
    const rowAbove = selectedRowIndex > 0 ? selectedTable[selectedRowIndex - 1] : null;
    const rowBelow = selectedRowIndex >= 0 && selectedRowIndex < selectedTable.length - 1 ? selectedTable[selectedRowIndex + 1] : null;
    const playoffCutRow = selectedTable.length >= 4 ? selectedTable[3] : null;

    const competitionCounts = useMemo(() => ({
        active: enrichedCompetitions.filter((competition) => competition.segment === 'active').length,
        upcoming: enrichedCompetitions.filter((competition) => competition.segment === 'upcoming').length,
        finished: enrichedCompetitions.filter((competition) => competition.segment === 'finished').length,
    }), [enrichedCompetitions]);

    const headerContext = getHeaderContext(
        filteredCompetitions.length > 0 ? filteredCompetitions : enrichedCompetitions,
        clubName
    );

    const visibleResults = filteredCompetitions
        .flatMap((competition) => competition.form)
        .sort((left, right) => right.timestamp - left.timestamp);
    const activeCount = filteredCompetitions.filter((competition) => competition.segment === 'active').length;
    const bestPosition = filteredCompetitions
        .map((competition) => competition.position)
        .filter((value): value is number => value != null)
        .sort((left, right) => left - right)[0] ?? null;
    const totalPointDifference = filteredCompetitions.reduce((sum, competition) => sum + competition.goalDifference, 0);
    const totalCompletedMatches = filteredCompetitions.reduce((sum, competition) => sum + competition.completedMatches.length, 0);
    const wins = filteredCompetitions.reduce(
        (sum, competition) => sum + competition.completedMatches.filter((match) => getMatchOutcome(match) === 'W').length,
        0
    );
    const totalWinRate = totalCompletedMatches > 0 ? Math.round((wins / totalCompletedMatches) * 100) : null;
    const objective = getObjectiveCopy(filteredCompetitions, activeSegment);
    const streak = visibleResults.slice(0, 3).map((entry) => entry.result).join('-') || '--';
    const streakMeta = totalWinRate != null ? `${totalWinRate}% win rate en cierres detectados` : 'Sin resultados suficientes';

    const handleSelectCompetition = (competitionId: string, tab?: CompetitionDetailTab) => {
        setSelectedCompetitionId(competitionId);
        if (tab) setDetailTab(tab);
    };

    if (loading) {
        return (
            <div className="club-competition-loading">
                Cargando competencias del club...
            </div>
        );
    }

    if (competitions.length === 0) {
        return (
            <div className="club-competitions-shell">
                <div className="club-competition-topbar">
                    <div>
                        <span className="card-title">Contexto competitivo</span>
                        <h3 className="club-tab-heading">Competencias - {clubName}</h3>
                        <p className="club-tab-copy">
                            Cuando el club tenga participaciones, standings y fixture asociados, este modulo mostrara posicion, contexto y proyeccion.
                        </p>
                    </div>
                </div>

                <div className="club-competition-empty-state">
                    <Trophy className="w-5 h-5" />
                    <div>
                        <strong>Todavia no hay competencias vinculadas</strong>
                        <p>Conecta torneos, partidos y tablas de G22 para habilitar este tablero estrategico por equipo.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="club-competitions-shell">
            <div className="club-competition-topbar">
                <div className="club-competition-title-group">
                    <span className="club-competition-kicker">Modulo de gestion estrategica</span>
                    <h3 className="club-competition-title">Competencias - {headerContext}</h3>
                    <p className="club-competition-subtitle">
                        Seguimiento del rendimiento del equipo en cada torneo y contexto competitivo.
                    </p>
                </div>

                <div className="club-competition-actions">
                    <button type="button" className="club-competition-action" onClick={() => window.location.reload()}>
                        <RefreshCw className="w-4 h-4" />
                        Sincronizar G22
                    </button>
                    <button type="button" className="club-competition-action" onClick={() => setDetailTab('performance')}>
                        <BarChart3 className="w-4 h-4" />
                        Estadisticas
                    </button>
                    <button type="button" className="club-competition-action" onClick={() => setShowFilters((current) => !current)}>
                        <Filter className="w-4 h-4" />
                        Filtros
                    </button>
                    <button type="button" className="club-competition-action is-primary" onClick={() => setDetailTab('analysis')}>
                        <Target className="w-4 h-4" />
                        Objetivos
                    </button>
                </div>
            </div>

            {showFilters ? (
                <section className="club-competition-filter-panel">
                    <label className="club-competition-filter">
                        <span>Temporada</span>
                        <select value={selectedSeason} onChange={(event) => setSelectedSeason(event.target.value)}>
                            <option value="all">Todas</option>
                            {seasons.map((season) => (
                                <option key={season} value={season}>{season}</option>
                            ))}
                        </select>
                    </label>

                    <label className="club-competition-filter">
                        <span>Division</span>
                        <select value={selectedDivision} onChange={(event) => setSelectedDivision(event.target.value)}>
                            <option value="all">Todas</option>
                            {divisions.map((division) => (
                                <option key={division} value={division}>{division}</option>
                            ))}
                        </select>
                    </label>

                    <div className="club-competition-filter-note">
                        <strong>{filteredCompetitions.length}</strong>
                        <span>competencia(s) visibles con los filtros actuales</span>
                    </div>
                </section>
            ) : null}

            <div className="club-competition-kpis">
                <article className="club-competition-kpi-card">
                    <span className="club-competition-kpi-label">Torneos activos</span>
                    <strong>{String(activeCount).padStart(2, '0')}</strong>
                    <small>{filteredCompetitions.length} visibles en el contexto actual</small>
                </article>

                <article className="club-competition-kpi-card">
                    <span className="club-competition-kpi-label">Mejor ranking</span>
                    <strong>{formatPosition(bestPosition)}</strong>
                    <small>{bestPosition != null ? 'Mejor posicion detectada en torneos filtrados' : 'Sin tabla oficial disponible'}</small>
                </article>

                <article className="club-competition-kpi-card">
                    <span className="club-competition-kpi-label">Objetivo</span>
                    <strong>{objective.value}</strong>
                    <small>{objective.meta}</small>
                </article>

                <article className="club-competition-kpi-card">
                    <span className="club-competition-kpi-label">Racha</span>
                    <strong>{streak}</strong>
                    <small>{streakMeta}</small>
                </article>

                <article className="club-competition-kpi-card">
                    <span className="club-competition-kpi-label">Dif. puntos</span>
                    <strong>{formatSignedValue(totalPointDifference)}</strong>
                    <small>{filteredCompetitions.length > 0 ? 'Balance agregado entre torneos visibles' : 'Sin diferencia acumulada'}</small>
                </article>

                <article className="club-competition-kpi-card">
                    <span className="club-competition-kpi-label">Win rate</span>
                    <strong>{totalWinRate != null ? `${totalWinRate}%` : '--'}</strong>
                    <small>{totalCompletedMatches > 0 ? `${totalCompletedMatches} cierres computados` : 'Sin resultados cerrados'}</small>
                </article>
            </div>

            <div className="club-competition-segment-bar">
                <div className="club-competition-segment-tabs" role="tablist" aria-label="Segmentacion de competencias">
                    {SEGMENT_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`club-competition-segment${activeSegment === tab.id ? ' is-active' : ''}`}
                            onClick={() => setActiveSegment(tab.id)}
                        >
                            {tab.label}
                            <span>{competitionCounts[tab.id]}</span>
                        </button>
                    ))}
                </div>

                <div className="club-competition-segment-meta">
                    <Clock3 className="w-4 h-4" />
                    <span>{filteredCompetitions.length} competencia(s) en esta vista</span>
                </div>
            </div>

            {filteredCompetitions.length === 0 ? (
                <div className="club-competition-empty-state">
                    <Filter className="w-5 h-5" />
                    <div>
                        <strong>No hay competencias en esta combinacion de filtros</strong>
                        <p>Ajusta temporada o division para volver a cargar el bloque estrategico.</p>
                    </div>
                </div>
            ) : (
                <>
                    <div className="club-competition-grid">
                        {filteredCompetitions.map((competition) => {
                            const badge = getSegmentBadge(competition.segment);
                            const isSelected = selectedCompetition?.tournamentId === competition.tournamentId;
                            const operationalStates = [
                                { label: 'Tabla', ready: Boolean(competition.updatedAt) },
                                { label: 'Fixture', ready: competition.tournamentMatches.length > 0 },
                                { label: 'Participacion', ready: competition.sourceKinds.includes('participant') },
                            ];

                            return (
                                <article
                                    key={competition.tournamentId}
                                    className={`club-competition-card${isSelected ? ' is-selected' : ''}`}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => handleSelectCompetition(competition.tournamentId)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            handleSelectCompetition(competition.tournamentId);
                                        }
                                    }}
                                >
                                    <div className="club-competition-card-header">
                                        <div>
                                            <h4>{competition.tournamentName}</h4>
                                            <span>{competition.seasonLabel} Ãƒâ€šÃ‚Â· {competition.divisionNames[0] || 'Competencia oficial'}</span>
                                        </div>
                                        <span className={`club-competition-status ${badge.className}`}>{badge.label}</span>
                                    </div>

                                    <div className="club-competition-card-body">
                                        <div className="club-competition-main-standing">
                                            <div className="club-competition-rank">{formatPosition(competition.position)}</div>
                                            <div className="club-competition-standing-copy mono">
                                                <div>{competition.points} pts</div>
                                                <div>{competition.played} PJ</div>
                                            </div>
                                        </div>

                                        <div className="club-competition-context-box">
                                            {getCompetitionContextText(competition)}
                                        </div>

                                        <div className="club-competition-form-row">
                                            <span className="club-competition-form-label">Forma</span>
                                            <div className="club-competition-form-dots">
                                                {renderFormDots(competition.form)}
                                            </div>
                                        </div>

                                        <div className="club-competition-operational-state">
                                            {operationalStates.map((item) => (
                                                <span
                                                    key={`${competition.tournamentId}-${item.label}`}
                                                    className={`club-competition-operational-pill${item.ready ? ' is-ready' : ' is-missing'}`}
                                                >
                                                    {item.ready ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                                    {item.label}
                                                </span>
                                            ))}
                                        </div>

                                        <div className="club-competition-next-match">
                                            <span className="club-competition-next-label">Proximo desafio</span>
                                            {competition.nextMatch ? (
                                                <>
                                                    <div className="club-competition-next-headline">
                                                        <strong>vs {competition.nextMatch.opponentShortName || competition.nextMatch.opponentName}</strong>
                                                        <span>{formatMatchSlot(competition.nextMatch.dateTime)}</span>
                                                    </div>
                                                    <p>{getCompetitionImpactText(competition)}</p>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="club-competition-next-headline">
                                                        <strong>Sin partido confirmado</strong>
                                                        <span>{competition.segment === 'finished' ? 'Competencia cerrada' : 'Agenda pendiente'}</span>
                                                    </div>
                                                    <p>{getCompetitionImpactText(competition)}</p>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    <div className="club-competition-card-actions">
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSelectCompetition(competition.tournamentId, 'table'); }}>
                                            Tabla
                                        </button>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSelectCompetition(competition.tournamentId, 'fixture'); }}>
                                            Fixture
                                        </button>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSelectCompetition(competition.tournamentId, 'performance'); }}>
                                            Estadisticas
                                        </button>
                                        <button type="button" onClick={(event) => { event.stopPropagation(); handleSelectCompetition(competition.tournamentId, 'analysis'); }}>
                                            Analisis
                                        </button>
                                    </div>
                                </article>
                            );
                        })}
                    </div>

                    {selectedCompetition ? (
                        <section className="club-competition-detail-shell">
                            <div className="club-competition-detail-header">
                                <div>
                                    <span className="club-competition-kicker">Competencia seleccionada</span>
                                    <h3>{selectedCompetition.tournamentName}</h3>
                                    <p>
                                        {selectedCompetition.divisionNames.join(' / ') || 'Competencia oficial'}
                                        {' Ãƒâ€šÃ‚Â· '}
                                        Temporada {selectedCompetition.seasonLabel}
                                    </p>
                                </div>

                                <div className="club-competition-detail-summary mono">
                                    <span>{formatPosition(selectedCompetition.position)} posicion</span>
                                    <span>{selectedCompetition.points} pts</span>
                                    <span>Actualizado {formatUpdatedAt(selectedCompetition.updatedAt || selectedCompetition.recentMatchAt)}</span>
                                </div>
                            </div>

                            <div className="club-competition-detail-tabs" role="tablist" aria-label="Detalle de competencia">
                                {DETAIL_TABS.map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        className={`club-competition-detail-tab${detailTab === tab.id ? ' is-active' : ''}`}
                                        onClick={() => setDetailTab(tab.id)}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {detailTab === 'table' ? (
                                <div className="club-competition-detail-body">
                                    <div className="club-competition-panel">
                                        <div className="club-competition-panel-head">
                                            <div>
                                                <span className="club-competition-panel-kicker">Tabla oficial</span>
                                                <h4>Posiciones del torneo</h4>
                                            </div>
                                            <span className="club-competition-panel-meta">
                                                {selectedStandingsState?.status === 'loaded'
                                                    ? `Sync ${formatUpdatedAt(selectedStandingsState.lastCalculatedAt)}`
                                                    : selectedStandingsState?.status === 'loading' || (!selectedStandingsState && selectedStanding?.phaseId)
                                                        ? 'Cargando tabla...'
                                                        : 'Esperando datos oficiales'}
                                            </span>
                                        </div>

                                        {selectedStandingsState?.status === 'error' ? (
                                            <div className="club-competition-empty-block">
                                                <strong>No se pudo cargar la tabla completa</strong>
                                                <p>{selectedStandingsState.error || 'La tabla oficial no esta disponible para esta competencia.'}</p>
                                            </div>
                                        ) : selectedStandingsState?.status === 'loading' || (!selectedStandingsState && selectedStanding?.phaseId) ? (
                                            <div className="club-competition-loading-inline">Sincronizando tabla oficial...</div>
                                        ) : selectedTable.length > 0 ? (
                                            <div className="club-competition-table-wrap">
                                                <table className="data-table club-competition-data-table">
                                                    <thead>
                                                        <tr>
                                                            <th>#</th>
                                                            <th>Club</th>
                                                            <th>PJ</th>
                                                            <th>PG</th>
                                                            <th>PE</th>
                                                            <th>PP</th>
                                                            <th>PTS</th>
                                                            <th>Dif.</th>
                                                            <th>Forma</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {selectedTable.map((row) => {
                                                            const isCurrentClub = selectedTableRow
                                                                ? row.teamId === selectedTableRow.teamId
                                                                : selectedCompetition.position != null && row.position === selectedCompetition.position;

                                                            return (
                                                                <tr key={`${row.teamId}-${row.position}`} className={isCurrentClub ? 'is-current' : ''}>
                                                                    <td className="mono">{row.position}</td>
                                                                    <td>
                                                                        <div className="club-competition-table-team">
                                                                            <strong>{row.team.name}</strong>
                                                                            {isCurrentClub ? <span>Equipo administrado</span> : null}
                                                                        </div>
                                                                    </td>
                                                                    <td className="mono">{row.played}</td>
                                                                    <td className="mono">{row.won}</td>
                                                                    <td className="mono">{row.drawn}</td>
                                                                    <td className="mono">{row.lost}</td>
                                                                    <td className="mono">{row.total_points}</td>
                                                                    <td className="mono">{formatSignedValue(row.difference)}</td>
                                                                    <td>
                                                                        <div className="club-competition-table-form">
                                                                            {row.form.length > 0
                                                                                ? row.form.slice(-5).map((value, index) => (
                                                                                    <span key={`${row.teamId}-${index}`} className={`club-competition-form-dot ${getResultTone(normalizeFormResult(value))}`}>
                                                                                        {value}
                                                                                    </span>
                                                                                ))
                                                                                : <span className="club-competition-form-empty">Sin forma</span>}
                                                                        </div>
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        ) : (
                                            <div className="club-competition-empty-block">
                                                <strong>Tabla no disponible</strong>
                                                <p>La competencia tiene presencia en el dashboard, pero no trae fase o grupo listos para levantar la tabla completa.</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : null}

                            {detailTab === 'fixture' ? (
                                <div className="club-competition-detail-split">
                                    {renderFixtureList(
                                        'Proximos partidos',
                                        selectedCompetition.tournamentMatches
                                            .filter((match) => {
                                                const timestamp = getTimestamp(match.dateTime);
                                                return timestamp != null && timestamp >= referenceNow;
                                            })
                                            .slice(0, 5),
                                        'Sin proximos cruces cargados',
                                        'Todavia no hay partidos futuros disponibles para esta competencia.',
                                        'upcoming'
                                    )}

                                    {renderFixtureList(
                                        'Resultados anteriores',
                                        selectedCompetition.completedMatches
                                            .slice()
                                            .reverse()
                                            .slice(0, 5),
                                        'Sin resultados anteriores',
                                        'Cuando entren cierres del torneo, se veran automaticamente en este bloque.',
                                        'results'
                                    )}
                                </div>
                            ) : null}

                            {detailTab === 'performance' ? (
                                <div className="club-competition-detail-split">
                                    <section className="club-competition-panel">
                                        <div className="club-competition-panel-head">
                                            <div>
                                                <span className="club-competition-panel-kicker">Rendimiento del equipo</span>
                                                <h4>Lectura competitiva</h4>
                                            </div>
                                        </div>

                                        <div className="club-competition-performance-grid">
                                            <article>
                                                <span>Puntos por partido</span>
                                                <strong>{selectedCompetition.played > 0 ? (selectedCompetition.points / selectedCompetition.played).toFixed(1) : '--'}</strong>
                                            </article>
                                            <article>
                                                <span>Dif. por partido</span>
                                                <strong>{selectedCompetition.played > 0 ? (selectedCompetition.goalDifference / selectedCompetition.played).toFixed(1) : '--'}</strong>
                                            </article>
                                            <article>
                                                <span>Win rate torneo</span>
                                                <strong>{selectedCompetition.winRate != null ? `${selectedCompetition.winRate}%` : '--'}</strong>
                                            </article>
                                            <article>
                                                <span>Partidos detectados</span>
                                                <strong>{selectedCompetition.tournamentMatches.length}</strong>
                                            </article>
                                        </div>

                                        <div className="club-competition-analysis-list">
                                            <div>
                                                <BarChart3 className="w-4 h-4" />
                                                <div>
                                                    <strong>Balance global</strong>
                                                    <span>{selectedCompetition.points} puntos y diferencia {formatSignedValue(selectedCompetition.goalDifference)} en el torneo.</span>
                                                </div>
                                            </div>
                                            <div>
                                                <Activity className="w-4 h-4" />
                                                <div>
                                                    <strong>Forma reciente</strong>
                                                    <span>{selectedCompetition.form.length > 0 ? `Ultimos ${selectedCompetition.form.length} cierres con patron ${selectedCompetition.form.map((entry) => entry.result).join('-')}.` : 'Todavia no hay forma reciente suficiente.'}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <CalendarDays className="w-4 h-4" />
                                                <div>
                                                    <strong>Proximo hito</strong>
                                                    <span>{selectedCompetition.nextMatch ? `Siguiente partido frente a ${selectedCompetition.nextMatch.opponentShortName || selectedCompetition.nextMatch.opponentName}.` : 'Sin hito competitivo confirmado en agenda.'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section className="club-competition-panel">
                                        <div className="club-competition-panel-head">
                                            <div>
                                                <span className="club-competition-panel-kicker">Estado operativo</span>
                                                <h4>Capas sincronizadas</h4>
                                            </div>
                                        </div>

                                        <div className="club-competition-state-stack">
                                            <div className="club-competition-state-item">
                                                <Shield className="w-4 h-4" />
                                                <div>
                                                    <strong>Tabla oficial</strong>
                                                    <span>{selectedCompetition.updatedAt ? `Actualizada ${formatUpdatedAt(selectedCompetition.updatedAt)}` : 'Aun sin ultima actualizacion visible.'}</span>
                                                </div>
                                            </div>
                                            <div className="club-competition-state-item">
                                                <CalendarDays className="w-4 h-4" />
                                                <div>
                                                    <strong>Fixture vinculado</strong>
                                                    <span>{selectedCompetition.tournamentMatches.length > 0 ? `${selectedCompetition.tournamentMatches.length} partido(s) relacionados con esta competencia.` : 'No hay agenda relacionada cargada.'}</span>
                                                </div>
                                            </div>
                                            <div className="club-competition-state-item">
                                                <Trophy className="w-4 h-4" />
                                                <div>
                                                    <strong>Participacion detectada</strong>
                                                    <span>{selectedCompetition.sourceKinds.join(', ')} como fuentes activas en el dashboard.</span>
                                                </div>
                                            </div>
                                        </div>
                                    </section>
                                </div>
                            ) : null}

                            {detailTab === 'analysis' ? (
                                <div className="club-competition-detail-split">
                                    <section className="club-competition-panel">
                                        <div className="club-competition-panel-head">
                                            <div>
                                                <span className="club-competition-panel-kicker">Contexto competitivo</span>
                                                <h4>Donde estamos y que nos jugamos</h4>
                                            </div>
                                        </div>

                                        <div className="club-competition-analysis-list">
                                            <div>
                                                <Trophy className="w-4 h-4" />
                                                <div>
                                                    <strong>Posicion actual</strong>
                                                    <span>{selectedCompetition.position != null ? `El equipo hoy figura ${formatPosition(selectedCompetition.position)} con ${selectedCompetition.points} puntos.` : 'Aun no hay posicion oficial publicada para esta competencia.'}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <Target className="w-4 h-4" />
                                                <div>
                                                    <strong>Objetivo sugerido</strong>
                                                    <span>{objective.value}. {objective.meta}.</span>
                                                </div>
                                            </div>
                                            <div>
                                                <ArrowRight className="w-4 h-4" />
                                                <div>
                                                    <strong>Impacto del proximo partido</strong>
                                                    <span>{getCompetitionImpactText(selectedCompetition)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </section>

                                    <section className="club-competition-panel">
                                        <div className="club-competition-panel-head">
                                            <div>
                                                <span className="club-competition-panel-kicker">Analisis interno</span>
                                                <h4>Notas y seguimiento</h4>
                                            </div>
                                        </div>

                                        <div className="club-competition-empty-block">
                                            <strong>Sin notas internas cargadas todavia</strong>
                                            <p>Este bloque ya deja preparado el espacio para objetivos por torneo, observaciones del staff y evaluaciones posteriores al partido.</p>
                                        </div>
                                    </section>
                                </div>
                            ) : null}

                            {detailTab === 'comparison' ? (
                                <div className="club-competition-detail-split">
                                    <section className="club-competition-panel">
                                        <div className="club-competition-panel-head">
                                            <div>
                                                <span className="club-competition-panel-kicker">Comparativa</span>
                                                <h4>Vs rivales directos</h4>
                                            </div>
                                        </div>

                                        {selectedStandingsState?.status !== 'loaded' || !selectedTableRow ? (
                                            <div className="club-competition-empty-block">
                                                <strong>Comparativa pendiente</strong>
                                                <p>Necesitamos tabla completa y una fila identificable del club para construir el contraste competitivo.</p>
                                            </div>
                                        ) : (
                                            <div className="club-competition-performance-grid">
                                                <article>
                                                    <span>Lider</span>
                                                    <strong>{leaderRow ? leaderRow.team.name : '--'}</strong>
                                                    <small>{leaderRow && selectedTableRow ? `${leaderRow.total_points - selectedTableRow.total_points} pts de diferencia` : 'Sin gap disponible'}</small>
                                                </article>
                                                <article>
                                                    <span>Rival arriba</span>
                                                    <strong>{rowAbove ? rowAbove.team.name : '--'}</strong>
                                                    <small>{rowAbove ? `${rowAbove.total_points - selectedTableRow.total_points} pts de margen` : 'No hay rival por encima'}</small>
                                                </article>
                                                <article>
                                                    <span>Rival abajo</span>
                                                    <strong>{rowBelow ? rowBelow.team.name : '--'}</strong>
                                                    <small>{rowBelow ? `${selectedTableRow.total_points - rowBelow.total_points} pts de colchon` : 'No hay rival por debajo'}</small>
                                                </article>
                                                <article>
                                                    <span>Corte alto</span>
                                                    <strong>{playoffCutRow ? 'Top 4' : '--'}</strong>
                                                    <small>{playoffCutRow ? `${playoffCutRow.total_points - selectedTableRow.total_points} pts respecto del corte` : 'Sin corte de referencia'}</small>
                                                </article>
                                            </div>
                                        )}
                                    </section>

                                    <section className="club-competition-panel">
                                        <div className="club-competition-panel-head">
                                            <div>
                                                <span className="club-competition-panel-kicker">Lectura del staff</span>
                                                <h4>Resumen comparativo</h4>
                                            </div>
                                        </div>

                                        {selectedStandingsState?.status !== 'loaded' || !selectedTableRow ? (
                                            <div className="club-competition-empty-block">
                                                <strong>Sin resumen comparativo</strong>
                                                <p>Cuando la tabla oficial este disponible, este panel mostrara brecha con lider, rivales directos y corte competitivo.</p>
                                            </div>
                                        ) : (
                                            <div className="club-competition-analysis-list">
                                                <div>
                                                    <Trophy className="w-4 h-4" />
                                                    <div>
                                                        <strong>Posicion relativa</strong>
                                                        <span>El equipo se ubica {formatPosition(selectedTableRow.position)} entre {selectedTable.length} participantes del torneo.</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <BarChart3 className="w-4 h-4" />
                                                    <div>
                                                        <strong>Brecha con el lider</strong>
                                                        <span>{leaderRow ? `${leaderRow.total_points - selectedTableRow.total_points} punto(s) respecto del primer puesto.` : 'No hay lider identificado.'}</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <Target className="w-4 h-4" />
                                                    <div>
                                                        <strong>Lectura de corte</strong>
                                                        <span>{playoffCutRow ? `${playoffCutRow.total_points - selectedTableRow.total_points} punto(s) respecto del Top 4.` : 'Sin corte visible para esta tabla.'}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </section>
                                </div>
                            ) : null}
                        </section>
                    ) : null}
                </>
            )}
        </div>
    );
}

