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

    /**
     * Una opcion = un boton. En fila: escudo local · Empate · escudo visitante.
     *
     * Antes cada opcion era una tarjeta ancha apilada, y con el empate serian
     * tres bloques uno abajo del otro: el gesto "elijo entre estos tres" se
     * pierde cuando hay que scrollear para ver la tercera.
     */
    function renderOption(choice: MatchVoteChoice, percent: number, votes: number) {
        const isSelected = summary.userChoice === choice;
        const isSubmitting = submittingChoice === choice;
        const team = choice === 'home' ? homeTeam : choice === 'away' ? awayTeam : null;
        const label = team ? team.name : 'Empate';

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
                aria-label={`Votar por ${label}`}
                title={label}
            >
                <span className={styles.optionMark}>
                    {team ? (
                        team.logo ? (
                            <img src={team.logo} alt="" className={styles.logo} loading="lazy" />
                        ) : (
                            <span className={styles.logoPlaceholder}>{team.name.slice(0, 1)}</span>
                        )
                    ) : (
                        <span className={styles.drawMark}>X</span>
                    )}
                </span>

                <span className={styles.optionLabel}>{team ? team.name : 'Empate'}</span>

                <span className={styles.percent}>
                    {isSubmitting ? '…' : `${formatPercentage(percent)}%`}
                </span>
                {/* Sin contador por opcion: el porcentaje ya lo dice, y el total
                    de votos vive una sola vez en la cabecera. */}
                <span className={styles.srOnly}>{votes} {votes === 1 ? 'voto' : 'votos'}</span>

                <span className={styles.barTrack} aria-hidden="true">
                    <span
                        className={[
                            styles.barFill,
                            choice === 'home' ? styles.barFillHome
                                : choice === 'away' ? styles.barFillAway
                                : styles.barFillDraw,
                        ].join(' ')}
                        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
                    />
                </span>

                {isSelected && <span className={styles.pickBadge}>Tu voto</span>}
            </button>
        );
    }

    const caption = votingClosed
        ? 'La votacion se cerro. Queda el pulso de la comunidad para este partido.'
        : user
            ? summary.userChoice
                ? 'Tu voto quedo guardado. Si queres, podes cambiarlo antes del cierre.'
                : 'Elegi como termina: gana uno, empatan, o gana el otro.'
            : 'Los resultados son publicos. Inicia sesion para dejar tu voto.';

    return (
        <div className={styles.stack}>
            <p className={styles.srOnly}>
                {caption}
                {isLoading ? '' : ` ${summary.totalVotes} ${summary.totalVotes === 1 ? 'voto' : 'votos'} en total.`}
            </p>
            <div className={styles.header}>
                <div className={styles.titleBlock}>
                    <p className={styles.eyebrow}>Comunidad</p>
                    <h3 className={styles.title}>Vota al ganador</h3>
                </div>
            </div>

            <div className={styles.options} role="group" aria-label="Elegir resultado">
                {renderOption('home', summary.homePercentage, summary.homeVotes)}
                {renderOption('draw', summary.drawPercentage, summary.drawVotes)}
                {renderOption('away', summary.awayPercentage, summary.awayVotes)}
            </div>

            <div className={styles.footer}>
                {summary.userChoice && (
                    <span className={styles.pill}>
                        Tu voto: {summary.userChoice === 'home' ? homeTeam.name
                            : summary.userChoice === 'away' ? awayTeam.name : 'Empate'}
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
