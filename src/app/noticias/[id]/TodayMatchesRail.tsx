'use client';

// Los partidos de hoy, al costado de la nota. Es el mismo store que la
// portada (`useMatchesStore`): la misma caché en memoria, el mismo feed
// `/api/matches` con FlashScore, la misma vuelta de un minuto para los que
// están en juego. Acá se muestra un recorte: primero lo que se juega ahora,
// después lo que viene, al final lo terminado, y como mucho ocho partidos
// agrupados por torneo. El resto queda a un clic, en la portada.

import Link from 'next/link';
import { useMemo } from 'react';

import { useMatchesStore } from '@/hooks/useMatchesStore';
import { getMatchPenaltyScore, getMatchWinnerByScore, hasMatchPenaltyShootout } from '@/lib/matchUtils';
import { getTodayKey, toLocalMatch } from '@/lib/timezone';
import { resolveTeamLogo } from '@/lib/utils/teamLogoOverrides';
import { isDualAudienceTournament, resolveTournamentAudience } from '@/lib/utils/tournamentAudience';

import styles from './page.module.css';

type TodayMatchesRailProps = {
    /** El id de deporte que entiende `/api/matches` (rugby, field-hockey, football…). */
    sportId: string;
    /** El deporte como se lee, para el título y el vacío. */
    sportLabel: string;
};

type RailStatus = 'live' | 'scheduled' | 'finished';

type RailMatch = {
    id: string;
    status: RailStatus;
    time: string;
    sortKey: number;
    home: string;
    away: string;
    homeLogo: string;
    awayLogo: string;
    homeScore: number | null;
    awayScore: number | null;
    /** La tanda, cuando la regulación terminó empatada: se lee "1 (4)". */
    homePenalty: number | null;
    awayPenalty: number | null;
    winner: 'home' | 'away' | null;
    period: string | null;
    tournament: string;
};

type RailGroup = {
    tournament: string;
    matches: RailMatch[];
};

const MAX_MATCHES = 8;
const STATUS_ORDER: Record<RailStatus, number> = { live: 0, scheduled: 1, finished: 2 };

function railStatusOf(raw: unknown): RailStatus {
    const status = String(raw ?? '').trim().toLowerCase();
    if (status === 'live' || status === 'in_play') return 'live';
    if (status === 'final' || status === 'finished' || status === 'ft') return 'finished';
    return 'scheduled';
}

function scoreOf(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** El nombre del torneo sin el país que FlashScore le antepone ("ARGENTINA: URBA Top 12" → "URBA Top 12"). */
function tournamentLabel(tournament: Record<string, unknown> | null | undefined): string {
    const raw = String(tournament?.name ?? '').trim();
    if (!raw) return 'Competencia';
    const cut = raw.indexOf(':');
    return cut > 0 && cut < raw.length - 1 ? raw.slice(cut + 1).trim() : raw;
}

function toRailMatch(match: any, timeZone: string): RailMatch | null {
    const tournament = (match?.tournament ?? null) as Record<string, unknown> | null;
    if (!tournament) return null;
    // La portada de mayores no muestra juveniles ni reservas; acá tampoco.
    const audienceInput = { name: typeof tournament.name === 'string' ? tournament.name : null };
    if (!isDualAudienceTournament(audienceInput) && resolveTournamentAudience(audienceInput) !== 'mayores') return null;

    const status = railStatusOf(match.status);
    const { localTime } = toLocalMatch(match.dateTime, timeZone);
    const at = typeof match.dateTime === 'string' ? Date.parse(match.dateTime) : Number.NaN;
    const period = match.clock?.period;

    // Un 1-1 en una final se define por penales: sin el número, la fila miente.
    const penalties = hasMatchPenaltyShootout(match) ? getMatchPenaltyScore(match) : null;

    return {
        id: String(match.id),
        status,
        time: localTime,
        sortKey: Number.isFinite(at) ? at : Number.MAX_SAFE_INTEGER,
        home: String(match.homeTeam?.name || 'Local'),
        away: String(match.awayTeam?.name || 'Visita'),
        homeLogo: resolveTeamLogo(match.homeTeam),
        awayLogo: resolveTeamLogo(match.awayTeam),
        homeScore: status === 'scheduled' ? null : (scoreOf(match.score?.home) ?? 0),
        awayScore: status === 'scheduled' ? null : (scoreOf(match.score?.away) ?? 0),
        homePenalty: penalties?.home ?? null,
        awayPenalty: penalties?.away ?? null,
        winner: status === 'finished' ? getMatchWinnerByScore(match) : null,
        period: period === 'HT' || period === 'ET' ? String(period) : null,
        tournament: tournamentLabel(tournament),
    };
}

/** Lo que escucha un lector de pantalla: el marcador, la tanda si la hubo, y el estado. */
function railLabel(match: RailMatch): string {
    const shootout = match.homePenalty != null && match.awayPenalty != null
        ? `, ${match.homePenalty} a ${match.awayPenalty} por penales`
        : '';
    const state = match.status === 'live' ? 'en juego' : match.status === 'finished' ? 'final' : `a las ${match.time}`;
    return `${match.home} ${match.homeScore ?? ''} - ${match.awayScore ?? ''} ${match.away}${shootout}, ${state}`;
}

function StatusCell({ match }: { match: RailMatch }) {
    if (match.status === 'live') {
        return (
            <span className={`${styles.railStatus} ${styles.railStatusLive}`}>
                <span className={styles.railLiveDot} aria-hidden="true" />
                {match.period ?? 'Vivo'}
            </span>
        );
    }
    if (match.status === 'finished') {
        return <span className={`${styles.railStatus} ${styles.railStatusFinal}`}>Final</span>;
    }
    return <span className={styles.railStatus}>{match.time}</span>;
}

function TeamLine({ name, logo, score, penalty, winner }: { name: string; logo: string; score: number | null; penalty: number | null; winner: boolean }) {
    return (
        <span className={`${styles.railTeam} ${winner ? styles.railTeamWinner : ''}`}>
            <span className={styles.railCrest} aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element -- escudo por proxy; la fila queda igual si no llega. */}
                {logo ? <img src={logo} alt="" loading="lazy" decoding="async" /> : null}
            </span>
            <span className={styles.railTeamName}>{name}</span>
            <span className={styles.railScore}>{score ?? '–'}</span>
            {penalty != null && <span className={styles.railPenalty} title="Penales">({penalty})</span>}
        </span>
    );
}

export default function TodayMatchesRail({ sportId, sportLabel }: TodayMatchesRailProps) {
    const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
    const today = useMemo(() => getTodayKey(timeZone), [timeZone]);
    const { matches, loading } = useMatchesStore(today, sportId, {
        prefetchWindowDays: 0,
        livePollIntervalMs: 60_000,
        runInitialLivePoll: false,
    });

    const { groups, total, liveCount } = useMemo(() => {
        const rows = matches
            .map((match) => toRailMatch(match, timeZone))
            .filter((row): row is RailMatch => row !== null)
            .sort((a, b) => {
                if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
                // Lo terminado, del más reciente al más viejo; lo demás, en orden de horario.
                return a.status === 'finished' ? b.sortKey - a.sortKey : a.sortKey - b.sortKey;
            });

        const shown = rows.slice(0, MAX_MATCHES);
        const byTournament = new Map<string, RailGroup>();
        shown.forEach((row) => {
            const group = byTournament.get(row.tournament);
            if (group) group.matches.push(row);
            else byTournament.set(row.tournament, { tournament: row.tournament, matches: [row] });
        });

        return {
            groups: Array.from(byTournament.values()),
            total: rows.length,
            liveCount: rows.filter((row) => row.status === 'live').length,
        };
    }, [matches, timeZone]);

    const headingId = 'rail-partidos';
    const busy = loading && matches.length === 0;

    return (
        <section className={styles.railCard} aria-labelledby={headingId} aria-busy={busy}>
            <div className={styles.railHead}>
                <h2 id={headingId} className={styles.railTitle}>Partidos de hoy</h2>
                {liveCount > 0 && (
                    <span className={`${styles.railBadge} ${styles.railBadgeLive}`}>
                        <span className={styles.railLiveDot} aria-hidden="true" />
                        {liveCount} en juego
                    </span>
                )}
            </div>

            {busy ? (
                <ul className={styles.railSkeleton} aria-hidden="true">
                    <li /><li /><li /><li />
                </ul>
            ) : groups.length === 0 ? (
                <p className={styles.railEmpty}>Hoy no hay partidos de {sportLabel.toLowerCase()} cargados.</p>
            ) : (
                <div className={styles.railGroups}>
                    {groups.map((group) => (
                        <div key={group.tournament} className={styles.railGroup}>
                            <p className={styles.railGroupTitle}>{group.tournament}</p>
                            <ul className={styles.railList}>
                                {group.matches.map((match) => (
                                    <li key={match.id}>
                                        <Link
                                            href={`/matches/${match.id}`}
                                            className={`${styles.railMatch} ${match.status === 'live' ? styles.railMatchLive : ''}`}
                                            aria-label={railLabel(match)}
                                        >
                                            <StatusCell match={match} />
                                            <span className={styles.railTeams}>
                                                <TeamLine name={match.home} logo={match.homeLogo} score={match.homeScore} penalty={match.homePenalty} winner={match.winner === 'home'} />
                                                <TeamLine name={match.away} logo={match.awayLogo} score={match.awayScore} penalty={match.awayPenalty} winner={match.winner === 'away'} />
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            )}

            <Link href="/" className={styles.railFooterLink}>
                {total > MAX_MATCHES ? `Ver los ${total} partidos de hoy` : 'Ver todos los partidos'}
            </Link>
        </section>
    );
}
