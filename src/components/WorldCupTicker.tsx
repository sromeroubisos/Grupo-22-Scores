'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './WorldCupTicker.module.css';

const FIFA_WC_TOURNAMENT_ID = 'espn-soccer-league-fifa.world';
const FIFA_WC_URL = '/soccer/fifa/world-cup/';

type MatchLike = {
    event_key?: string;
    match_id?: string;
    timestamp?: number;
    start_time?: number;
    time?: number;
    home_team?: { name?: string; logo?: string };
    away_team?: { name?: string; logo?: string };
    event_home_team?: string;
    event_away_team?: string;
    home_team_name?: string;
    away_team_name?: string;
    home_team_logo?: string;
    away_team_logo?: string;
};

function extractTimestamp(match: MatchLike | null | undefined): number {
    if (!match) return 0;
    const raw = match.timestamp ?? match.start_time ?? match.time ?? 0;
    return Number(raw) * 1000;
}

export default function WorldCupTicker() {
    const pathname = usePathname();
    const isOnFifaWorldCupPage = pathname?.startsWith(`/tournaments/${FIFA_WC_TOURNAMENT_ID}`) ?? false;

    const [nextMatch, setNextMatch] = useState<MatchLike | null>(null);
    const [countdown, setCountdown] = useState({ d: 0, h: 0, m: 0, s: 0 });

    // Fetch the FIFA World Cup fixtures once on mount.
    useEffect(() => {
        const controller = new AbortController();
        (async () => {
            try {
                const params = new URLSearchParams({
                    id: FIFA_WC_TOURNAMENT_ID,
                    url: FIFA_WC_URL,
                    sport: 'football',
                });
                const res = await fetch(`/api/tournaments?${params.toString()}`, {
                    signal: controller.signal,
                });
                if (!res.ok) return;
                const data = await res.json();
                const fixtures: MatchLike[] =
                    data?.fixtures ||
                    data?.matches?.fixtures ||
                    data?.data?.fixtures ||
                    [];
                const results: MatchLike[] =
                    data?.results ||
                    data?.matches?.results ||
                    data?.data?.results ||
                    [];
                const nowMs = Date.now();
                const upcoming = [...fixtures, ...results]
                    .map((m) => ({ m, ts: extractTimestamp(m) }))
                    .filter((x) => x.ts > nowMs)
                    .sort((a, b) => a.ts - b.ts);
                if (upcoming.length > 0) setNextMatch(upcoming[0].m);
            } catch {
                // Network/abort — ticker stays hidden.
            }
        })();
        return () => controller.abort();
    }, []);

    // Tick the countdown every second.
    useEffect(() => {
        if (!nextMatch) return;
        const ts = extractTimestamp(nextMatch);
        if (!ts) return;
        const tick = () => {
            const diff = Math.max(0, ts - Date.now());
            const d = Math.floor(diff / 86400000);
            const h = Math.floor(diff / 3600000) % 24;
            const m = Math.floor(diff / 60000) % 60;
            const s = Math.floor(diff / 1000) % 60;
            setCountdown({ d, h, m, s });
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [nextMatch]);

    if (!nextMatch || isOnFifaWorldCupPage) return null;

    const homeName =
        nextMatch.home_team?.name || nextMatch.event_home_team || nextMatch.home_team_name || '';
    const awayName =
        nextMatch.away_team?.name || nextMatch.event_away_team || nextMatch.away_team_name || '';
    const homeLogo = nextMatch.home_team?.logo || nextMatch.home_team_logo || '';
    const awayLogo = nextMatch.away_team?.logo || nextMatch.away_team_logo || '';
    const tournamentHref =
        `/tournaments/${FIFA_WC_TOURNAMENT_ID}?url=${encodeURIComponent(FIFA_WC_URL)}`;

    return (
        <Link href={tournamentHref} className={styles.ticker} aria-label="Ir al torneo FIFA World Cup 2026">
            <div className={styles.brand}>
                <img
                    src="/FIFA%20WC.PNG"
                    alt="FIFA World Cup 2026"
                    className={styles.brandLogo}
                />
            </div>

            <div className={styles.countdown}>
                <span className={styles.label}>Faltan</span>
                <div className={styles.timer}>
                    <span className={styles.cell}>
                        <b>{String(countdown.d).padStart(2, '0')}</b>
                        <em>d</em>
                    </span>
                    <span className={styles.colon}>:</span>
                    <span className={styles.cell}>
                        <b>{String(countdown.h).padStart(2, '0')}</b>
                        <em>h</em>
                    </span>
                    <span className={styles.colon}>:</span>
                    <span className={styles.cell}>
                        <b>{String(countdown.m).padStart(2, '0')}</b>
                        <em>m</em>
                    </span>
                    <span className={styles.colon}>:</span>
                    <span className={styles.cell}>
                        <b>{String(countdown.s).padStart(2, '0')}</b>
                        <em>s</em>
                    </span>
                </div>
            </div>

            <div className={styles.nextLink}>
                <span className={styles.nextLabel}>Próximo partido</span>
                <span className={styles.nextMatch}>
                    {homeLogo && (
                        <img
                            src={homeLogo}
                            alt={homeName}
                            className={styles.flag}
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                    )}
                    <span className={styles.team}>{homeName}</span>
                    <span className={styles.vs}>vs</span>
                    <span className={styles.team}>{awayName}</span>
                    {awayLogo && (
                        <img
                            src={awayLogo}
                            alt={awayName}
                            className={styles.flag}
                            onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                    )}
                </span>
            </div>
        </Link>
    );
}
