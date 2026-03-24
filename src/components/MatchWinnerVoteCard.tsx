'use client';

import { useEffect, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import {
    createEmptyMatchVoteSummary,
    type MatchVoteChoice,
    type MatchVoteSummary,
} from '@/lib/types/matchVotes';

import styles from './MatchWinnerVoteCard.module.css';

type TeamOption = {
    name: string;
    logo?: string | null;
};

type MatchWinnerVoteCardProps = {
    matchId: string;
    status: string;
    homeTeam: TeamOption;
    awayTeam: TeamOption;
    homeScore?: number | null;
    awayScore?: number | null;
};

function formatPercentage(value: number) {
    return Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
}

function getResultLabel(
    homeTeam: TeamOption,
    awayTeam: TeamOption,
    homeScore?: number | null,
    awayScore?: number | null
) {
    if (typeof homeScore !== 'number' || typeof awayScore !== 'number') {
        return null;
    }

    if (homeScore > awayScore) {
        return `Gano ${homeTeam.name}`;
    }

    if (awayScore > homeScore) {
        return `Gano ${awayTeam.name}`;
    }

    return 'Termino empatado';
}

export default function MatchWinnerVoteCard({
    matchId,
    status,
    homeTeam,
    awayTeam,
    homeScore = null,
    awayScore = null,
}: MatchWinnerVoteCardProps) {
    const { user, login } = useAuth();
    const [summary, setSummary] = useState<MatchVoteSummary>(() => createEmptyMatchVoteSummary(matchId));
    const [isLoading, setIsLoading] = useState(true);
    const [submittingChoice, setSubmittingChoice] = useState<MatchVoteChoice | null>(null);
    const [error, setError] = useState<string | null>(null);

    const votingClosed = status === 'final' || status === 'cancelled';
    const resultLabel = status === 'final'
        ? getResultLabel(homeTeam, awayTeam, homeScore, awayScore)
        : null;

    useEffect(() => {
        let active = true;

        async function loadVotes() {
            setIsLoading(true);
            setError(null);

            try {
                const response = await fetch(`/api/matches/${matchId}/vote`, {
                    cache: 'no-store',
                    credentials: 'same-origin',
                });

                if (!response.ok) {
                    const payload = await response.json().catch(() => null) as { error?: string } | null;

                    if (!active) {
                        return;
                    }

                    setSummary(createEmptyMatchVoteSummary(matchId));
                    setError(payload?.error || 'No se pudo cargar la votacion en este momento.');
                    return;
                }

                const data = await response.json() as MatchVoteSummary;

                if (!active) {
                    return;
                }

                setSummary({
                    ...createEmptyMatchVoteSummary(matchId),
                    ...data,
                    matchId,
                });
            } catch {
                if (!active) {
                    return;
                }

                setSummary(createEmptyMatchVoteSummary(matchId));
                setError('No se pudo cargar la votacion en este momento.');
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        }

        void loadVotes();

        return () => {
            active = false;
        };
    }, [matchId, user?.id]);

    async function handleVote(choice: MatchVoteChoice) {
        if (votingClosed) {
            return;
        }

        if (!user) {
            const returnTo = typeof window === 'undefined'
                ? undefined
                : `${window.location.pathname}${window.location.search}`;

            login('fan', returnTo);
            return;
        }

        if (summary.userChoice === choice) {
            return;
        }

        setSubmittingChoice(choice);
        setError(null);

        try {
            const response = await fetch(`/api/matches/${matchId}/vote`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'same-origin',
                body: JSON.stringify({ choice }),
            });

            if (response.status === 401) {
                const returnTo = typeof window === 'undefined'
                    ? undefined
                    : `${window.location.pathname}${window.location.search}`;

                login('fan', returnTo);
                return;
            }

            if (!response.ok) {
                const payload = await response.json().catch(() => null) as { error?: string } | null;
                setError(payload?.error || 'No pudimos guardar tu voto. Proba de nuevo.');
                return;
            }

            const data = await response.json() as MatchVoteSummary;

            setSummary({
                ...createEmptyMatchVoteSummary(matchId),
                ...data,
                matchId,
                userChoice: choice,
            });
        } catch {
            setError('No pudimos guardar tu voto. Proba de nuevo.');
        } finally {
            setSubmittingChoice(null);
        }
    }

    function renderOption(choice: MatchVoteChoice, team: TeamOption, percent: number, votes: number) {
        const isSelected = summary.userChoice === choice;
        const isSubmitting = submittingChoice === choice;

        return (
            <button
                key={choice}
                type="button"
                className={[
                    styles.option,
                    isSelected ? styles.optionSelected : '',
                    votingClosed ? styles.optionLocked : '',
                ].filter(Boolean).join(' ')}
                onClick={() => void handleVote(choice)}
                disabled={votingClosed || !!submittingChoice}
                aria-pressed={isSelected}
            >
                <div className={styles.optionTop}>
                    <div className={styles.team}>
                        {team.logo ? (
                            <img src={team.logo} alt="" className={styles.logo} />
                        ) : (
                            <div className={styles.logoPlaceholder}>
                                {team.name.slice(0, 1)}
                            </div>
                        )}
                        <span className={styles.teamName}>{team.name}</span>
                        {isSelected && <span className={styles.pickBadge}>Tu voto</span>}
                    </div>
                    <div className={styles.voteMeta}>
                        <div className={styles.percent}>
                            {isSubmitting ? '...' : `${formatPercentage(percent)}%`}
                        </div>
                        <div className={styles.votes}>
                            {votes} {votes === 1 ? 'voto' : 'votos'}
                        </div>
                    </div>
                </div>
                <div className={styles.barTrack}>
                    <div
                        className={[
                            styles.barFill,
                            choice === 'home' ? styles.barFillHome : styles.barFillAway,
                        ].join(' ')}
                        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                    />
                </div>
            </button>
        );
    }

    const caption = votingClosed
        ? 'La votacion se cerro. Queda el pulso de la comunidad para este partido.'
        : user
            ? summary.userChoice
                ? 'Tu voto quedo guardado. Si queres, podes cambiarlo antes del cierre.'
                : 'Elegi quien pensas que se queda con el partido.'
            : 'Los resultados son publicos. Inicia sesion para dejar tu voto.';

    return (
        <div className={styles.stack}>
            <div className={styles.header}>
                <div className={styles.titleBlock}>
                    <p className={styles.eyebrow}>Comunidad</p>
                    <h3 className={styles.title}>Vota al ganador</h3>
                </div>
                <span className={styles.totalBadge}>
                    {isLoading ? 'Cargando...' : `${summary.totalVotes} ${summary.totalVotes === 1 ? 'voto' : 'votos'}`}
                </span>
            </div>

            <p className={styles.caption}>{caption}</p>

            <div className={styles.options}>
                {renderOption('home', homeTeam, summary.homePercentage, summary.homeVotes)}
                {renderOption('away', awayTeam, summary.awayPercentage, summary.awayVotes)}
            </div>

            <div className={styles.footer}>
                {summary.userChoice && (
                    <span className={styles.pill}>
                        Tu voto: {summary.userChoice === 'home' ? homeTeam.name : awayTeam.name}
                    </span>
                )}
                {resultLabel && (
                    <span className={styles.pill}>{resultLabel}</span>
                )}
                {!user && !votingClosed && (
                    <button type="button" className={styles.loginBtn} onClick={() => login('fan', typeof window === 'undefined' ? undefined : `${window.location.pathname}${window.location.search}`)}>
                        Iniciar sesion para votar
                    </button>
                )}
            </div>

            {error && <p className={styles.error}>{error}</p>}
        </div>
    );
}
