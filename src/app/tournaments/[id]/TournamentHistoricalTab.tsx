'use client';

/**
 * Tab "Histórica": la tabla que acumula todas las temporadas del torneo.
 *
 * Cada temporada suma lo que dice su tabla de fase regular, con los puntos que
 * valían ese año (src/lib/standings/historicalTable.ts). La arma el servidor
 * (/api/db/tournaments/[id]/historical-standings): son todas las temporadas, y
 * pedir los datos de cada una desde acá serían cuarenta viajes.
 *
 * Los títulos salen de las mismas SeasonOption que alimentan Campeones, con la
 * misma regla que el palmarés: un título compartido suma uno a cada club. Pero
 * solo los de las temporadas que suman puntos: el Top 14 tiene campeones desde
 * 1899 y resultados desde 2000, y una fila con 33 títulos y 26 temporadas
 * mezclaría dos historias distintas.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDifference } from '@/lib/utils/formatDifference';
import { ClubCrest, type ChampionSeasonItem } from './TournamentChampionsTab';
import styles from './page.module.css';

type HistoricalRow = {
    position: number;
    seasons: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    scored: number;
    conceded: number;
    bonus: number;
    points: number;
    club: { id: string; name: string; logo: string | null };
};

type HistoricalPayload = {
    ok: boolean;
    error?: string;
    seasonsCounted: number;
    firstSeason: string | null;
    lastSeason: string | null;
    seasonKeys: string[];
    rows: HistoricalRow[];
};

type LoadState =
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'ok'; data: HistoricalPayload };

export default function TournamentHistoricalTab({
    tournamentId,
    seasons,
}: {
    tournamentId: string;
    seasons: ChampionSeasonItem[];
}) {
    const [state, setState] = useState<LoadState>({ kind: 'loading' });

    useEffect(() => {
        const controller = new AbortController();
        setState({ kind: 'loading' });
        fetch(`/api/db/tournaments/${encodeURIComponent(tournamentId)}/historical-standings`, { signal: controller.signal })
            .then(async (response) => {
                const payload = (await response.json().catch(() => null)) as HistoricalPayload | null;
                if (!response.ok || !payload?.ok) {
                    setState({ kind: 'error', message: payload?.error || 'No se pudo armar la tabla histórica.' });
                    return;
                }
                setState({ kind: 'ok', data: payload });
            })
            .catch((error) => {
                if (controller.signal.aborted) return;
                console.warn('[tabla histórica]', error);
                setState({ kind: 'error', message: 'No se pudo armar la tabla histórica.' });
            });
        return () => controller.abort();
    }, [tournamentId]);

    const countedKeys = state.kind === 'ok' ? state.data.seasonKeys : null;
    const titlesByClub = useMemo(() => {
        const out = new Map<string, number>();
        if (!countedKeys) return out;
        const counted = new Set(countedKeys);
        for (const season of seasons) {
            if (!counted.has(season.id) || !season.champion) continue;
            for (const club of [season.champion, ...(season.coChampions || [])]) {
                out.set(club.id, (out.get(club.id) ?? 0) + 1);
            }
        }
        return out;
    }, [countedKeys, seasons]);

    if (state.kind === 'loading') {
        return <p className={styles.emptyState}>Sumando todas las temporadas…</p>;
    }
    if (state.kind === 'error') {
        return <p className={styles.emptyState}>{state.message}</p>;
    }

    const { rows, seasonsCounted, firstSeason, lastSeason } = state.data;
    if (rows.length === 0) {
        return <p className={styles.emptyState}>Todavía no hay temporadas con resultados para sumar.</p>;
    }

    const hasBonus = rows.some((row) => row.bonus > 0);
    const hasTitles = rows.some((row) => (titlesByClub.get(row.club.id) ?? 0) > 0);
    const span = firstSeason && lastSeason && firstSeason !== lastSeason
        ? `${firstSeason}–${lastSeason}`
        : firstSeason || lastSeason;

    return (
        <div className={styles.standingsContainer}>
            <p className={styles.historicalIntro}>
                Fase regular de {seasonsCounted} {seasonsCounted === 1 ? 'temporada' : 'temporadas'}
                {span ? ` (${span})` : ''}. Cada temporada suma los puntos de su tabla, con el sistema de puntos de ese año.
            </p>
            <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
                <div className={styles.colPos}>#</div>
                <div className={styles.colTeam}>Club</div>
                <div className={`${styles.colVal} ${styles.colValPJ} ${styles.historicalSeasons}`} title="Temporadas jugadas">Tem</div>
                {hasTitles && <div className={`${styles.colVal} ${styles.colValPJ}`} title="Títulos">Tít</div>}
                <div className={`${styles.colVal} ${styles.colValPJ}`}>J</div>
                <div className={`${styles.colVal} ${styles.historicalOptional}`}>G</div>
                <div className={`${styles.colVal} ${styles.historicalOptional}`}>E</div>
                <div className={`${styles.colVal} ${styles.historicalOptional}`}>P</div>
                <div className={`${styles.colVal} ${styles.colValDG} ${styles.historicalDiff}`}>DG</div>
                {hasBonus && <div className={`${styles.colVal} ${styles.historicalOptional}`}>B</div>}
                <div className={`${styles.colPts} ${styles.historicalPts}`}>PTS</div>
            </div>
            {rows.map((row) => (
                <div key={row.club.id} className={styles.tableRow}>
                    <div className={styles.colPos}>{row.position}</div>
                    <div className={styles.colTeam}>
                        <ClubCrest club={row.club} size={22} />
                        <div className={styles.colTeamMeta}>
                            <Link href={`/clubs/${encodeURIComponent(row.club.id)}`} className={styles.colTeamName}>
                                {row.club.name}
                            </Link>
                        </div>
                    </div>
                    <div className={`${styles.colVal} ${styles.colValPJ} ${styles.historicalSeasons}`}>{row.seasons}</div>
                    {hasTitles && (
                        <div className={`${styles.colVal} ${styles.colValPJ}`}>{titlesByClub.get(row.club.id) || '–'}</div>
                    )}
                    <div className={`${styles.colVal} ${styles.colValPJ}`}>{row.played}</div>
                    <div className={`${styles.colVal} ${styles.historicalOptional}`}>{row.won}</div>
                    <div className={`${styles.colVal} ${styles.historicalOptional}`}>{row.drawn}</div>
                    <div className={`${styles.colVal} ${styles.historicalOptional}`}>{row.lost}</div>
                    <div className={`${styles.colVal} ${styles.colValDG} ${styles.historicalDiff}`}>
                        {formatDifference(row.scored - row.conceded)}
                    </div>
                    {hasBonus && <div className={`${styles.colVal} ${styles.historicalOptional}`}>{row.bonus}</div>}
                    <div className={`${styles.colPts} ${styles.historicalPts}`}>{row.points}</div>
                </div>
            ))}
            </div>
        </div>
    );
}
