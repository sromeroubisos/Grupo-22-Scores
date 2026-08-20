'use client';

// El puntaje de la gente.
//
// Dos gestos sobre la misma lista: el semáforo puntúa (rojo/amarillo/verde) y
// la estrella elige la figura del partido. Se guardan por separado — se puede
// elegir figura sin puntuar y al revés — pero viven en la misma fila.

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
    RATING_LABELS,
    createEmptyPlayerRatingsSummary,
    scoreTone,
    type MatchPlayerRatingsSummary,
    type PlayerRatingValue,
} from '@/lib/types/matchPlayerRatings';

import styles from './PeopleRatingsPanel.module.css';

export interface RateablePlayer {
    key: string;
    name: string;
    team: 'home' | 'away';
    number?: number | null;
    position?: string | null;
}

const RATING_ORDER: PlayerRatingValue[] = [1, 2, 3];

export default function PeopleRatingsPanel({
    matchId,
    players,
    homeName,
    awayName,
    canVote,
}: {
    matchId: string;
    players: RateablePlayer[];
    homeName: string;
    awayName: string;
    /** Sin sesión el panel se lee pero no se vota. */
    canVote: boolean;
}) {
    const [summary, setSummary] = useState<MatchPlayerRatingsSummary>(createEmptyPlayerRatingsSummary);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [side, setSide] = useState<'home' | 'away'>('home');

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetch(`/api/matches/${encodeURIComponent(matchId)}/player-ratings`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : createEmptyPlayerRatingsSummary()))
            .then((data) => { if (!cancelled) setSummary(data); })
            .catch(() => { if (!cancelled) setSummary(createEmptyPlayerRatingsSummary()); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [matchId]);

    const mine = useMemo(() => {
        const map = new Map<string, { rating: PlayerRatingValue | null; isMvp: boolean }>();
        for (const row of summary.mine) map.set(row.playerKey, { rating: row.rating, isMvp: row.isMvp });
        return map;
    }, [summary.mine]);

    const byKey = useMemo(() => {
        const map = new Map(summary.players.map((p) => [p.playerKey, p]));
        return map;
    }, [summary.players]);

    const send = useCallback(async (player: RateablePlayer, body: { rating?: number | null; isMvp?: boolean }) => {
        if (!canVote) return;
        setSaving(player.key);
        setError(null);
        try {
            const res = await fetch(`/api/matches/${encodeURIComponent(matchId)}/player-ratings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    playerKey: player.key,
                    playerName: player.name,
                    team: player.team,
                    ...body,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data?.error || 'No se pudo guardar tu voto.');
                return;
            }
            setSummary(data);
        } catch {
            setError('No se pudo guardar tu voto. Probá de nuevo.');
        } finally {
            setSaving(null);
        }
    }, [matchId, canVote]);

    const rate = (player: RateablePlayer, value: PlayerRatingValue) => {
        const current = mine.get(player.key);
        // Tocar el mismo color de nuevo saca el voto: es la unica forma de
        // arrepentirse sin tener que elegir otro.
        const next = current?.rating === value ? null : value;
        send(player, { rating: next, isMvp: current?.isMvp ?? false });
    };

    const pickMvp = (player: RateablePlayer) => {
        const current = mine.get(player.key);
        send(player, { rating: current?.rating ?? null, isMvp: !current?.isMvp });
    };

    const shown = players.filter((p) => p.team === side);
    const mvp = summary.mvp;
    const mvpPlayer = mvp ? players.find((p) => p.key === mvp.playerKey) : null;

    if (players.length === 0) return null;

    return (
        <section className={styles.panel} aria-labelledby="people-ratings-title">
            <div className={styles.head}>
                <h3 id="people-ratings-title" className={styles.title}>Puntaje de la gente</h3>
                {summary.voters > 0 && (
                    <span className={styles.voters}>
                        {summary.voters === 1 ? '1 persona votó' : `${summary.voters} personas votaron`}
                    </span>
                )}
            </div>

            {mvp && mvp.mvpVotes > 0 && (
                <div className={styles.mvp}>
                    <div className={styles.mvpLabel}>Figura del partido</div>
                    <div className={styles.mvpBody}>
                        <span className={`${styles.score} ${styles[`tone_${scoreTone(mvp.score)}`]}`}>
                            {mvp.score != null ? mvp.score.toFixed(1) : '—'}
                        </span>
                        <div className={styles.mvpWho}>
                            <span className={styles.mvpName}>{mvp.playerName}</span>
                            <span className={styles.mvpTeam}>
                                {(mvpPlayer?.team ?? mvp.team) === 'home' ? homeName : awayName}
                                {' · '}
                                {mvp.mvpVotes === 1 ? '1 voto' : `${mvp.mvpVotes} votos`}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            <div className={styles.sides} role="tablist" aria-label="Elegir club">
                {(['home', 'away'] as const).map((value) => (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={side === value}
                        className={`${styles.sideBtn} ${side === value ? styles.sideActive : ''}`}
                        onClick={() => setSide(value)}
                    >
                        {value === 'home' ? homeName : awayName}
                    </button>
                ))}
            </div>

            {!canVote && (
                <p className={styles.hint}>Entrá con tu cuenta para puntuar y elegir la figura.</p>
            )}
            {error && <p className={styles.error} role="alert">{error}</p>}

            <ul className={styles.list}>
                {shown.map((player) => {
                    const agg = byKey.get(player.key);
                    const my = mine.get(player.key);
                    const tone = scoreTone(agg?.score ?? null);
                    return (
                        <li key={player.key} className={styles.row}>
                            <div className={styles.who}>
                                <span className={styles.name}>
                                    {player.number != null && <b className={styles.number}>{player.number}</b>}
                                    {player.name}
                                </span>
                                <span className={styles.meta}>
                                    {player.position || '—'}
                                    {agg && agg.votes > 0 && ` · ${agg.votes === 1 ? '1 voto' : `${agg.votes} votos`}`}
                                </span>
                            </div>

                            <span className={`${styles.score} ${styles[`tone_${tone}`]}`}>
                                {agg?.score != null ? agg.score.toFixed(1) : '—'}
                            </span>

                            <div className={styles.actions}>
                                <div className={styles.lights} role="group" aria-label={`Puntuar a ${player.name}`}>
                                    {RATING_ORDER.map((value) => (
                                        <button
                                            key={value}
                                            type="button"
                                            disabled={!canVote || saving === player.key}
                                            aria-pressed={my?.rating === value}
                                            aria-label={`${RATING_LABELS[value]} — ${player.name}`}
                                            title={RATING_LABELS[value]}
                                            className={`${styles.light} ${styles[`light${value}`]} ${my?.rating === value ? styles.lightOn : ''}`}
                                            onClick={() => rate(player, value)}
                                        />
                                    ))}
                                </div>

                                <button
                                    type="button"
                                    disabled={!canVote || saving === player.key}
                                    aria-pressed={my?.isMvp === true}
                                    aria-label={`Elegir a ${player.name} como figura del partido`}
                                    title="Figura del partido"
                                    className={`${styles.star} ${my?.isMvp ? styles.starOn : ''}`}
                                    onClick={() => pickMvp(player)}
                                >
                                    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"
                                         fill={my?.isMvp ? 'currentColor' : 'none'}
                                         stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
                                        <path d="m12 3 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.4l6-.9L12 3Z" />
                                    </svg>
                                    {agg && agg.mvpVotes > 0 && <span className={styles.starCount}>{agg.mvpVotes}</span>}
                                </button>
                            </div>
                        </li>
                    );
                })}
            </ul>

            {loading && <p className={styles.hint}>Cargando el puntaje…</p>}
            {!loading && summary.voters === 0 && (
                <p className={styles.hint}>Todavía no votó nadie. Sé el primero.</p>
            )}
        </section>
    );
}
