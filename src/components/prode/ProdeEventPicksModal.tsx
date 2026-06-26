'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './ProdeEventPicksModal.module.css';

type EventPick = {
    userId: string;
    userName: string;
    avatarUrl: string | null;
    isCurrentUser: boolean;
    hasPrediction: boolean;
    predictedHomeScore: number | null;
    predictedAwayScore: number | null;
    outcome: string | null;
    points: number;
};

type OwnPick = {
    predictedHomeScore: number | null;
    predictedAwayScore: number | null;
    outcome: string | null;
} | null;

type PicksResponse = {
    revealed: boolean;
    status: string;
    startsAt: string;
    locksAt: string;
    homeLabel: string;
    awayLabel: string;
    isFinal?: boolean;
    official?: { homeScore: number; awayScore: number; outcome: string } | null;
    ownPick?: OwnPick;
    picks?: EventPick[];
    message?: string;
    error?: string;
};

type Props = {
    leagueId: string;
    eventId: string;
    homeLabel: string;
    awayLabel: string;
    onClose: () => void;
};

function formatScore(home: number | null, away: number | null) {
    return `${home ?? '-'} : ${away ?? '-'}`;
}

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? '')
        .join('') || 'J';
}

export default function ProdeEventPicksModal({ leagueId, eventId, homeLabel, awayLabel, onClose }: Props) {
    const [data, setData] = useState<PicksResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const isMountedRef = useRef(true);

    const load = useCallback(async (silent: boolean) => {
        if (!silent) {
            setIsLoading(true);
        }

        try {
            const response = await fetch(
                `/api/prode/private-leagues/${encodeURIComponent(leagueId)}/events/${encodeURIComponent(eventId)}/picks`,
                { credentials: 'same-origin', cache: 'no-store' },
            );
            const result = await response.json() as PicksResponse;

            if (!isMountedRef.current) return;

            if (!response.ok) {
                throw new Error(result.error || 'No se pudieron cargar los pronósticos.');
            }

            setData(result);
            setError(null);
        } catch (loadError) {
            if (!isMountedRef.current) return;
            setError(loadError instanceof Error ? loadError.message : 'No se pudieron cargar los pronósticos.');
        } finally {
            if (isMountedRef.current) {
                setIsLoading(false);
            }
        }
    }, [leagueId, eventId]);

    useEffect(() => {
        isMountedRef.current = true;
        void load(false);
        return () => {
            isMountedRef.current = false;
        };
    }, [load]);

    // Mientras el partido siga en vivo (revelado y no final), refrescamos los
    // puntos provisorios cada 20s para que se vean "subir" con el marcador.
    useEffect(() => {
        if (!data?.revealed || data.isFinal) {
            return;
        }
        const timer = window.setInterval(() => void load(true), 20_000);
        return () => window.clearInterval(timer);
    }, [data?.revealed, data?.isFinal, load]);

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    const official = data?.official ?? null;
    const isLive = Boolean(data?.revealed) && !data?.isFinal && (data?.status === 'live');

    return (
        <div className={styles.overlay} role="dialog" aria-modal="true" onClick={onClose}>
            <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.headerTitles}>
                        <span className={styles.eyebrow}>Pronósticos del grupo</span>
                        <strong className={styles.matchTitle}>{homeLabel} vs {awayLabel}</strong>
                    </div>
                    <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Cerrar">×</button>
                </div>

                {official ? (
                    <div className={styles.scoreboard}>
                        <span className={styles.scoreboardScore}>{official.homeScore} : {official.awayScore}</span>
                        <span className={`${styles.liveBadge} ${isLive ? styles.liveBadgeOn : ''}`}>
                            {data?.isFinal ? 'Final' : isLive ? 'En vivo' : 'Marcador'}
                        </span>
                    </div>
                ) : null}

                <div className={styles.body}>
                    {isLoading ? (
                        <p className={styles.muted}>Cargando pronósticos...</p>
                    ) : error ? (
                        <p className={styles.errorText}>{error}</p>
                    ) : !data ? (
                        <p className={styles.muted}>Sin datos.</p>
                    ) : !data.revealed ? (
                        <div className={styles.lockedBox}>
                            <p className={styles.lockedTitle}>🔒 Pronósticos ocultos</p>
                            <p className={styles.muted}>
                                {data.message || 'Los pronósticos del resto se revelan cuando arranca el partido.'}
                            </p>
                            <div className={styles.ownPickRow}>
                                <span>Tu pronóstico</span>
                                <strong>
                                    {data.ownPick
                                        ? formatScore(data.ownPick.predictedHomeScore, data.ownPick.predictedAwayScore)
                                        : 'Sin cargar'}
                                </strong>
                            </div>
                        </div>
                    ) : (
                        <ul className={styles.pickList}>
                            {data.picks && data.picks.length ? (
                                data.picks.map((pick) => (
                                    <li
                                        key={pick.userId}
                                        className={`${styles.pickRow} ${pick.isCurrentUser ? styles.pickRowMe : ''}`}
                                    >
                                        <span className={styles.avatar} aria-hidden="true">
                                            {pick.avatarUrl
                                                // eslint-disable-next-line @next/next/no-img-element
                                                ? <img src={pick.avatarUrl} alt="" className={styles.avatarImg} />
                                                : initials(pick.userName)}
                                        </span>
                                        <span className={styles.pickName}>
                                            {pick.userName}
                                            {pick.isCurrentUser ? <span className={styles.meTag}>Vos</span> : null}
                                        </span>
                                        <span className={styles.pickScore}>
                                            {pick.hasPrediction
                                                ? formatScore(pick.predictedHomeScore, pick.predictedAwayScore)
                                                : <span className={styles.muted}>Sin pronóstico</span>}
                                        </span>
                                        <span className={`${styles.pickPoints} ${pick.points > 0 ? styles.pickPointsOn : ''}`}>
                                            +{pick.points} pts
                                        </span>
                                    </li>
                                ))
                            ) : (
                                <li className={styles.muted}>Todavía nadie cargó un pronóstico.</li>
                            )}
                        </ul>
                    )}
                </div>

                {data?.revealed && !data.isFinal ? (
                    <p className={styles.footerNote}>
                        Puntos provisorios según el marcador actual. Se confirman al cerrar el partido y se suman a la tabla.
                    </p>
                ) : null}
            </div>
        </div>
    );
}
