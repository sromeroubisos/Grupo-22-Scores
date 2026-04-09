'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import styles from '@/app/prode/page.module.css';
import type { ProdePlayEvent, ProdePlayPrediction, ProdePlayView, ProdePredictionOutcome } from '@/lib/prode/types';

type ProdePlayScreenProps = {
    view: ProdePlayView;
    backHref: string;
    backLabel: string;
};

function formatDate(value: string | null) {
    if (!value) return 'Sin fecha';

    try {
        return new Intl.DateTimeFormat('es-AR', {
            dateStyle: 'medium',
            timeStyle: 'short',
        }).format(new Date(value));
    } catch {
        return value;
    }
}

function formatDateDivider(value: string) {
    try {
        const formatted = new Intl.DateTimeFormat('es-AR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
        }).format(new Date(value));

        return formatted.charAt(0).toUpperCase() + formatted.slice(1);
    } catch {
        return value;
    }
}

function formatTimeUntil(value: string | null) {
    if (!value) return 'Sin cierre inmediato';

    const diff = new Date(value).getTime() - Date.now();
    if (diff <= 0) return 'Cerrado';

    const hours = Math.floor(diff / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);

    if (hours <= 0) return `Cierra en ${minutes}m`;
    return `Cierra en ${hours}h ${minutes}m`;
}

function getEventStatusLabel(event: ProdePlayEvent) {
    if (event.isOpen) return 'Abierto';
    if (event.status === 'live') return 'En juego';
    if (event.status === 'cancelled') return 'Cancelado';
    return 'Cerrado';
}

function getPredictionLabel(outcome: ProdePredictionOutcome | null, event: ProdePlayEvent) {
    if (outcome === 'home') return event.homeLabel;
    if (outcome === 'away') return event.awayLabel;
    if (outcome === 'draw') return 'Empate';
    return 'Sin pick';
}

function formatScorePair(homeScore: number | null, awayScore: number | null) {
    if (homeScore === null || awayScore === null) return null;
    return `${homeScore} - ${awayScore}`;
}

function TeamCrest({ label, logoUrl }: { label: string; logoUrl: string | null }) {
    const [imageFailed, setImageFailed] = useState(false);

    if (logoUrl && !imageFailed) {
        return (
            <span className={styles.scoreTeamCrest} aria-hidden="true">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={logoUrl}
                    alt=""
                    className={styles.scoreTeamCrestImage}
                    loading="lazy"
                    onError={() => setImageFailed(true)}
                />
            </span>
        );
    }

    return (
        <span className={styles.scoreTeamCrestFallback} aria-hidden="true" title={label}>
            <Shield size={16} strokeWidth={2.1} />
        </span>
    );
}

function getPredictionScoreLabel(prediction: ProdePlayPrediction | null, event: ProdePlayEvent) {
    if (!prediction) return 'Sin pick';

    const scoreLabel = formatScorePair(prediction.predictedHomeScore, prediction.predictedAwayScore);
    if (scoreLabel) {
        return `${event.homeLabel} ${scoreLabel} ${event.awayLabel}`;
    }

    return getPredictionLabel(prediction.outcome, event);
}

function getOfficialResultLabel(event: ProdePlayEvent) {
    if (!event.officialResult) return 'Resultado pendiente';
    if (event.officialResult.homeScore === null || event.officialResult.awayScore === null) {
        return 'Resultado cargado';
    }
    return `${event.homeLabel} ${event.officialResult.homeScore} - ${event.officialResult.awayScore} ${event.awayLabel}`;
}

function isPredictionCorrect(event: ProdePlayEvent, prediction: ProdePlayPrediction | null) {
    if (!prediction?.outcome || !event.officialResult?.outcome) return null;
    return prediction.outcome === event.officialResult.outcome;
}

function getPredictionBreakdown(event: ProdePlayEvent, prediction: ProdePlayPrediction | null) {
    if (!prediction || prediction.predictedHomeScore === null || prediction.predictedAwayScore === null || !event.officialResult) {
        return [];
    }

    const homeOfficial = event.officialResult.homeScore;
    const awayOfficial = event.officialResult.awayScore;
    if (homeOfficial === null || awayOfficial === null) {
        return [];
    }

    const predictionDiff = prediction.predictedHomeScore - prediction.predictedAwayScore;
    const officialDiff = homeOfficial - awayOfficial;
    const exactHome = prediction.predictedHomeScore === homeOfficial;
    const exactAway = prediction.predictedAwayScore === awayOfficial;
    const exactScore = exactHome && exactAway;
    const winner = prediction.outcome === event.officialResult.outcome;

    return [
        winner ? 'Ganador' : null,
        predictionDiff === officialDiff ? 'Diferencia' : null,
        exactHome ? `${event.homeLabel} exacto` : null,
        exactAway ? `${event.awayLabel} exacto` : null,
        exactScore ? 'Marcador exacto' : null,
    ].filter((value): value is string => Boolean(value));
}

export default function ProdePlayScreen({ view, backHref, backLabel }: ProdePlayScreenProps) {
    const router = useRouter();
    const { user, login } = useAuth();
    const [events, setEvents] = useState(view.events);
    const [savingEventId, setSavingEventId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<Record<string, string>>({});
    const [copiedTarget, setCopiedTarget] = useState<'code' | 'link' | null>(null);
    const [activeTab, setActiveTab] = useState<'play' | 'table' | 'rules'>('play');
    const [isEditingRules, setIsEditingRules] = useState(false);
    const [isSavingRules, setIsSavingRules] = useState(false);
    const [rulesFeedback, setRulesFeedback] = useState<string | null>(null);
    const [leagueActionFeedback, setLeagueActionFeedback] = useState<string | null>(null);
    const [runningLeagueAction, setRunningLeagueAction] = useState<'archive_league' | 'delete_league' | null>(null);
    const [ruleDrafts, setRuleDrafts] = useState<Record<string, string>>(() => Object.fromEntries(
        view.rules.items.map((rule) => [rule.key, rule.points.toString()]),
    ));
    const [lockMinutesDraft, setLockMinutesDraft] = useState(view.rules.lockMinutes?.toString() ?? '');
    const [doubleFinalsDraft, setDoubleFinalsDraft] = useState(view.rules.doubleFinals);
    const [scoreDrafts, setScoreDrafts] = useState<Record<string, { home: string; away: string }>>(() => Object.fromEntries(
        view.events.map((event) => [
            event.id,
            {
                home: event.prediction?.predictedHomeScore?.toString() ?? '',
                away: event.prediction?.predictedAwayScore?.toString() ?? '',
            },
        ]),
    ));

    const openEvents = useMemo(() => events.filter((event) => event.isOpen), [events]);
    const lockedOrLiveEvents = useMemo(
        () => events.filter((event) => !event.isOpen && (event.status === 'scheduled' || event.status === 'live')),
        [events],
    );
    const closedEvents = useMemo(() => events.filter((event) => !event.isOpen), [events]);

    const openEventGroups = useMemo(() => {
        const groups: Array<{ key: string; label: string; events: ProdePlayEvent[] }> = [];

        openEvents.forEach((event) => {
            const key = event.startsAt.slice(0, 10);
            const lastGroup = groups[groups.length - 1];

            if (!lastGroup || lastGroup.key !== key) {
                groups.push({
                    key,
                    label: formatDateDivider(event.startsAt),
                    events: [event],
                });
                return;
            }

            lastGroup.events.push(event);
        });

        return groups;
    }, [openEvents]);

    const latestClosedEvents = useMemo(
        () => [...closedEvents].sort((left, right) => right.startsAt.localeCompare(left.startsAt)).slice(0, 6),
        [closedEvents],
    );

    const highlightedLeaderboard = useMemo(() => {
        const rows = view.leaderboard.slice(0, 8);
        if (user && !rows.some((row) => row.userId === user.id)) {
            const currentRow = view.leaderboard.find((row) => row.userId === user.id);
            if (currentRow) {
                return [...rows, currentRow];
            }
        }
        return rows;
    }, [user, view.leaderboard]);

    const playEmptyMessage = useMemo(() => {
        if (openEvents.length) return null;
        if (view.isFinished || view.competitionStatus === 'finished') {
            return 'La competencia ya termino. Abajo tenes tu resumen final y la tabla cerrada.';
        }
        if (lockedOrLiveEvents.length) {
            return 'Los pronosticos estan cerrados para esta fecha. Tus picks ya quedaron definidos y ahora solo queda esperar los resultados.';
        }
        if (view.competitionStatus === 'draft' || view.competitionStatus === 'published') {
            return 'La competencia todavia no comenzo. Los pronosticos se habilitan antes del inicio de la primera fecha.';
        }
        if (events.length) {
            return 'No hay partidos activos en este momento. La proxima fecha se va a habilitar cuando haya nuevos partidos disponibles.';
        }
        return 'Todavia no hay partidos cargados para esta competencia.';
    }, [events.length, lockedOrLiveEvents.length, openEvents.length, view.competitionStatus, view.isFinished]);

    const activityLabel = useMemo(() => {
        if (openEvents.length) return `${openEvents.length} picks abiertos`;
        if (lockedOrLiveEvents.length) return 'Fecha cerrada';
        if (view.isFinished) return 'Competencia cerrada';
        return 'Sin fecha activa';
    }, [lockedOrLiveEvents.length, openEvents.length, view.isFinished]);
    const inviteCode = view.inviteCode ?? '';
    const shareUrl = view.shareUrl ?? '';
    const showInviteActions = view.scope === 'private_league' && Boolean(inviteCode || shareUrl) && (view.canInvite || view.canManage);
    const showManageShortcut = view.scope === 'private_league' && view.canManage;

    async function copyToClipboard(value: string, target: 'code' | 'link') {
        if (typeof navigator === 'undefined' || !navigator.clipboard) return;
        await navigator.clipboard.writeText(value);
        setCopiedTarget(target);
        window.setTimeout(() => {
            setCopiedTarget((current) => (current === target ? null : current));
        }, 1600);
    }

    function updateRuleDraft(ruleKey: string, value: string) {
        if (value && !/^\d+$/.test(value)) return;
        setRuleDrafts((current) => ({ ...current, [ruleKey]: value }));
    }

    function updateScoreDraft(eventId: string, side: 'home' | 'away', value: string) {
        if (value && !/^\d+$/.test(value)) return;

        setScoreDrafts((current) => ({
            ...current,
            [eventId]: {
                home: current[eventId]?.home ?? '',
                away: current[eventId]?.away ?? '',
                [side]: value,
            },
        }));
    }

    async function savePrediction(event: ProdePlayEvent) {
        if (!user) {
            login('fan', typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/prode');
            return;
        }

        const homeDraft = scoreDrafts[event.id]?.home ?? '';
        const awayDraft = scoreDrafts[event.id]?.away ?? '';
        const predictedHomeScore = Number(homeDraft);
        const predictedAwayScore = Number(awayDraft);

        if (!homeDraft || !awayDraft || !Number.isInteger(predictedHomeScore) || !Number.isInteger(predictedAwayScore) || predictedHomeScore < 0 || predictedAwayScore < 0) {
            setFeedback((current) => ({ ...current, [event.id]: 'Carga un marcador valido para ambos equipos.' }));
            return;
        }

        setSavingEventId(event.id);
        setFeedback((current) => ({ ...current, [event.id]: 'Guardando...' }));

        try {
            const response = await fetch('/api/prode/predictions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    eventId: event.id,
                    predictedHomeScore,
                    predictedAwayScore,
                }),
            });

            const result = await response.json() as { error?: string; prediction?: ProdePlayPrediction };

            if (!response.ok || !result.prediction) {
                throw new Error(result.error || 'No se pudo guardar el pronostico.');
            }

            setEvents((current) => current.map((item) => (
                item.id === event.id
                    ? { ...item, prediction: result.prediction ?? null }
                    : item
            )));
            setScoreDrafts((current) => ({
                ...current,
                [event.id]: {
                    home: predictedHomeScore.toString(),
                    away: predictedAwayScore.toString(),
                },
            }));
            setFeedback((current) => ({ ...current, [event.id]: 'Pronostico guardado' }));
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo guardar el pronostico.';
            setFeedback((current) => ({ ...current, [event.id]: message }));
        } finally {
            setSavingEventId(null);
        }
    }

    async function saveRules() {
        if (!view.canManage || !view.privateLeagueId) {
            return;
        }

        const nextRules = view.rules.items.reduce<Record<string, number>>((accumulator, rule) => {
            const rawValue = ruleDrafts[rule.key] ?? '';
            const numericValue = Number(rawValue);
            accumulator[rule.key] = Number.isFinite(numericValue) ? numericValue : rule.points;
            return accumulator;
        }, {});

        setIsSavingRules(true);
        setRulesFeedback('Guardando reglas...');

        try {
            const response = await fetch('/api/prode/private-leagues', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    leagueId: view.privateLeagueId,
                    action: 'update_rules',
                    rules: {
                        winner: nextRules.winner,
                        diff: nextRules.diff,
                        oneTeamExact: nextRules['one-team-exact'],
                        exact: nextRules.exact,
                        minutes: lockMinutesDraft ? Number(lockMinutesDraft) : view.rules.lockMinutes,
                        doubleFinals: doubleFinalsDraft,
                    },
                }),
            });

            const result = await response.json() as { error?: string; message?: string };

            if (!response.ok) {
                throw new Error(result.error || 'No se pudieron actualizar las reglas.');
            }

            setRulesFeedback(result.message || 'Reglas actualizadas. Los puntos ya obtenidos no se recalculan.');
            setIsEditingRules(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudieron actualizar las reglas.';
            setRulesFeedback(message);
        } finally {
            setIsSavingRules(false);
        }
    }

    async function handleLeagueLifecycleAction(action: 'archive_league' | 'delete_league') {
        if (!view.canManage || !view.privateLeagueId) {
            return;
        }

        const isDelete = action === 'delete_league';
        const confirmed = window.confirm(
            isDelete
                ? 'Esta accion saca la liga de circulacion. Queres borrarla?'
                : 'La liga dejara de estar activa y quedara archivada. Queres continuar?',
        );

        if (!confirmed) {
            return;
        }

        setRunningLeagueAction(action);
        setLeagueActionFeedback(isDelete ? 'Borrando liga...' : 'Archivando liga...');

        try {
            const response = await fetch('/api/prode/private-leagues', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    leagueId: view.privateLeagueId,
                    action,
                }),
            });

            const result = await response.json() as { error?: string; message?: string };

            if (!response.ok) {
                throw new Error(result.error || 'No se pudo actualizar la liga.');
            }

            setLeagueActionFeedback(result.message || 'La liga fue actualizada.');
            router.replace('/prode');
            router.refresh();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo actualizar la liga.';
            setLeagueActionFeedback(message);
        } finally {
            setRunningLeagueAction(null);
        }
    }

    return (
        <div className={styles.page}>
            <div className="container">
                <div className={styles.detailShell}>
                    <Link href={backHref} className={styles.backLink}>{backLabel}</Link>

                    <section className={styles.playHero}>
                        <div className={styles.playHeroMain}>
                            <div className={styles.playHeroCopy}>
                                <p className={styles.privateLeagueEyebrow}>{view.scope === 'private_league' ? 'Liga privada' : 'Liga global'}</p>
                                <h1 className={styles.playHeroTitle}>{view.title}</h1>
                                <p className={styles.playHeroText}>{view.subtitle}</p>

                                <div className={styles.playHeroMeta}>
                                    <span className={styles.metaTag}>Jugadores: {view.memberCount}</span>
                                    <span className={styles.metaTag}>Estado: {activityLabel}</span>
                                    <span className={styles.metaTag}>{formatTimeUntil(view.nextLockAt)}</span>
                                    {view.canManage ? <span className={`${styles.metaTag} ${styles.metaTagSuccess}`}>Admin</span> : null}
                                </div>
                            </div>

                            <div className={styles.playHeroActions}>
                                {showInviteActions && inviteCode ? (
                                    <button type="button" className={styles.posterPrimaryCta} onClick={() => void copyToClipboard(inviteCode, 'code')}>
                                        {copiedTarget === 'code' ? 'Codigo copiado' : 'Copiar codigo'}
                                    </button>
                                ) : null}
                                {showInviteActions && shareUrl ? (
                                    <button type="button" className={styles.posterSecondaryCta} onClick={() => void copyToClipboard(shareUrl, 'link')}>
                                        {copiedTarget === 'link' ? 'Link copiado' : 'Copiar link'}
                                    </button>
                                ) : null}
                                <button type="button" className={styles.posterSecondaryCta} onClick={() => setActiveTab('table')}>Ver tabla</button>
                                {showManageShortcut ? (
                                    <button
                                        type="button"
                                        className={styles.posterSecondaryCta}
                                        onClick={() => {
                                            setRulesFeedback(null);
                                            setActiveTab('rules');
                                            setIsEditingRules(true);
                                        }}
                                    >
                                        Editar reglas
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        <div className={styles.playHeroRail}>
                            <article className={styles.posterStat}>
                                <strong>{view.personalSummary.position ? `${view.personalSummary.position}o` : '-'}</strong>
                                <span>Tu posicion</span>
                            </article>
                            <article className={styles.posterStat}>
                                <strong>{view.personalSummary.totalPoints}</strong>
                                <span>Tus puntos</span>
                            </article>
                            <article className={styles.posterStat}>
                                <strong>{view.personalSummary.correctOutcomes}</strong>
                                <span>Aciertos</span>
                            </article>
                        </div>
                    </section>

                    <div className={styles.mobilePlayTabs} role="tablist" aria-label="Secciones del prode">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'play'}
                            className={`${styles.mobilePlayTab} ${activeTab === 'play' ? styles.mobilePlayTabActive : ''}`}
                            onClick={() => setActiveTab('play')}
                        >
                            Cargar resultados
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'table'}
                            className={`${styles.mobilePlayTab} ${activeTab === 'table' ? styles.mobilePlayTabActive : ''}`}
                            onClick={() => setActiveTab('table')}
                        >
                            Tabla
                        </button>
                        <button
                            type="button"
                            role="tab"
                            aria-selected={activeTab === 'rules'}
                            className={`${styles.mobilePlayTab} ${activeTab === 'rules' ? styles.mobilePlayTabActive : ''}`}
                            onClick={() => setActiveTab('rules')}
                        >
                            Reglas
                        </button>
                    </div>

                    <section className={styles.playGrid}>
                        <div className={`${styles.playMainColumn} ${activeTab === 'table' || activeTab === 'rules' ? styles.mobileTabHidden : ''}`}>
                            <section className={styles.section}>
                                <div className={styles.sectionHeader}>
                                    <div>
                                        <h2 className={styles.sectionTitle}>Jugar ahora</h2>
                                        <p className={styles.sectionText}>
                                            Si la competencia esta en marcha, aca aparecen primero los partidos jugables.
                                        </p>
                                    </div>
                                </div>

                                {!user ? (
                                    <div className={styles.warning}>
                                        Para guardar picks tenes que iniciar sesion. Apenas elijas un resultado te llevamos directo al login.
                                    </div>
                                ) : null}

                                {openEvents.length ? (
                                    <div className={styles.pickList}>
                                        {openEventGroups.map((group) => (
                                            <div key={group.key} className={styles.pickGroup}>
                                                <div className={styles.dateDivider}>
                                                    <span>{group.label}</span>
                                                </div>

                                                {group.events.map((event) => {
                                                    const currentPrediction = event.prediction;
                                                    return (
                                                        <article key={event.id} className={styles.pickCard}>
                                                            <div className={styles.pickCardTop}>
                                                                <div>
                                                                    <h3 className={styles.pickMatchTitle}>{event.homeLabel} vs {event.awayLabel}</h3>
                                                                    <p className={styles.pickMatchMeta}>{formatDate(event.startsAt)}</p>
                                                                </div>
                                                                <span className={styles.leagueStatus}>{getEventStatusLabel(event)}</span>
                                                            </div>

                                                            <div className={styles.scoreEntryRow}>
                                                                <label className={styles.scoreInputGroup}>
                                                                    <span>{event.homeLabel}</span>
                                                                    <div className={styles.scoreInputShell}>
                                                                        <TeamCrest label={event.homeLabel} logoUrl={event.homeLogoUrl} />
                                                                        <input
                                                                            type="text"
                                                                            inputMode="numeric"
                                                                            className={styles.scoreInput}
                                                                            value={scoreDrafts[event.id]?.home ?? ''}
                                                                            onChange={(eventInput) => updateScoreDraft(event.id, 'home', eventInput.target.value)}
                                                                            placeholder="0"
                                                                            disabled={savingEventId === event.id}
                                                                        />
                                                                    </div>
                                                                </label>

                                                                <span className={styles.scoreDivider}>-</span>

                                                                <label className={`${styles.scoreInputGroup} ${styles.scoreInputGroupAway}`}>
                                                                    <span>{event.awayLabel}</span>
                                                                    <div className={`${styles.scoreInputShell} ${styles.scoreInputShellReverse}`}>
                                                                        <input
                                                                            type="text"
                                                                            inputMode="numeric"
                                                                            className={styles.scoreInput}
                                                                            value={scoreDrafts[event.id]?.away ?? ''}
                                                                            onChange={(eventInput) => updateScoreDraft(event.id, 'away', eventInput.target.value)}
                                                                            placeholder="0"
                                                                            disabled={savingEventId === event.id}
                                                                        />
                                                                        <TeamCrest label={event.awayLabel} logoUrl={event.awayLogoUrl} />
                                                                    </div>
                                                                </label>
                                                            </div>

                                                            <div className={styles.pickFooter}>
                                                                <div className={styles.pickFooterActions}>
                                                                    <span className={styles.pickFeedback}>
                                                                        {feedback[event.id] || (currentPrediction ? 'Guardado' : `Cierra: ${formatDate(event.locksAt)}`)}
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        className={`${styles.pickSaveBtn} ${currentPrediction ? styles.pickSaveBtnSaved : styles.pickSaveBtnPending}`}
                                                                        onClick={() => void savePrediction(event)}
                                                                        disabled={savingEventId === event.id}
                                                                    >
                                                                        {savingEventId === event.id ? 'Guardando...' : currentPrediction ? 'Actualizar pick' : 'Guardar pronostico'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </article>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className={styles.empty}>
                                        {playEmptyMessage}
                                    </div>
                                )}
                            </section>

                            <section className={styles.section}>
                                <div className={styles.sectionHeader}>
                                    <div>
                                        <h2 className={styles.sectionTitle}>Historial</h2>
                                        <p className={styles.sectionText}>
                                            Tus ultimos cierres, con resultado y puntos sumados.
                                        </p>
                                    </div>
                                </div>

                                {latestClosedEvents.length ? (
                                    <div className={styles.historyList}>
                                        {latestClosedEvents.map((event) => {
                                            const prediction = event.prediction;
                                            const correct = isPredictionCorrect(event, prediction);
                                            return (
                                                <article key={event.id} className={styles.historyCard}>
                                                    <div>
                                                        <strong>{event.homeLabel} vs {event.awayLabel}</strong>
                                                        <p className={styles.pickMatchMeta}>{formatDate(event.startsAt)}</p>
                                                    </div>
                                                    <div className={styles.historyMeta}>
                                                        <span className={styles.metaTag}>Tu pick: {prediction ? getPredictionScoreLabel(prediction, event) : 'No jugaste'}</span>
                                                        <span className={styles.metaTag}>{getOfficialResultLabel(event)}</span>
                                                        {getPredictionBreakdown(event, prediction).map((badge) => (
                                                            <span key={`${event.id}-${badge}`} className={styles.metaTagSuccess}>{badge}</span>
                                                        ))}
                                                        <span className={`${styles.metaTag} ${correct === true ? styles.metaTagSuccess : correct === false ? styles.metaTagDanger : ''}`}>
                                                            {prediction ? `${prediction.pointsAwarded > 0 ? '+' : ''}${prediction.pointsAwarded} pts` : 'Sin puntos'}
                                                        </span>
                                                    </div>
                                                </article>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className={styles.empty}>
                                        Todavia no hay partidos cerrados para mostrar historial.
                                    </div>
                                )}
                            </section>
                        </div>

                        <aside id="tabla" className={`${styles.playSidebar} ${activeTab === 'play' || activeTab === 'rules' ? styles.mobileTabHidden : ''}`}>
                            <section className={styles.summaryCard}>
                                <p className={styles.previewEyebrow}>Tu rendimiento</p>
                                <div className={styles.summaryList}>
                                    <div className={styles.summaryRow}><span>Posicion</span><strong>{view.personalSummary.position ? `${view.personalSummary.position}o` : '-'}</strong></div>
                                    <div className={styles.summaryRow}><span>Puntos</span><strong>{view.personalSummary.totalPoints}</strong></div>
                                    <div className={styles.summaryRow}><span>Aciertos</span><strong>{view.personalSummary.correctOutcomes}</strong></div>
                                    <div className={styles.summaryRow}><span>Ultima fecha</span><strong>{view.personalSummary.latestPoints > 0 ? `+${view.personalSummary.latestPoints}` : view.personalSummary.latestPoints}</strong></div>
                                </div>
                            </section>

                            <section id="tabla" className={styles.summaryCard}>
                                <p className={styles.previewEyebrow}>Tabla</p>
                                <div className={styles.leaderboardCompact}>
                                    {highlightedLeaderboard.length ? highlightedLeaderboard.map((row) => (
                                        <article key={`${row.userId}-${row.position ?? 'x'}`} className={`${styles.leaderboardCompactRow} ${row.isCurrentUser ? styles.leaderboardCompactRowCurrent : ''}`}>
                                            <span>{row.position ? `${row.position}.` : '-'}</span>
                                            <strong>{row.isCurrentUser ? 'Vos' : row.userName}</strong>
                                            <span>{row.totalPoints} pts</span>
                                        </article>
                                    )) : (
                                        <div className={styles.empty}>
                                            La tabla se va a poblar cuando empiece el puntaje.
                                        </div>
                                    )}
                                </div>
                            </section>

                            {showInviteActions ? (
                                <section className={styles.summaryCard}>
                                    <p className={styles.previewEyebrow}>Acciones sociales</p>
                                    <div className={styles.socialActions}>
                                        {inviteCode ? (
                                            <button type="button" className={styles.inviteActionBtn} onClick={() => void copyToClipboard(inviteCode, 'code')}>
                                                {copiedTarget === 'code' ? 'Codigo copiado' : 'Copiar codigo'}
                                            </button>
                                        ) : null}
                                        {shareUrl ? (
                                            <button type="button" className={styles.inviteActionBtn} onClick={() => void copyToClipboard(shareUrl, 'link')}>
                                                {copiedTarget === 'link' ? 'Link copiado' : 'Copiar link'}
                                            </button>
                                        ) : null}
                                    </div>
                                </section>
                            ) : null}
                        </aside>

                        <aside className={`${styles.playSidebar} ${activeTab === 'play' || activeTab === 'table' ? styles.mobileTabHidden : ''}`}>
                            <section className={styles.summaryCard}>
                                <p className={styles.previewEyebrow}>Reglas</p>
                                <div className={styles.rulesCardHeader}>
                                    <strong>{view.rules.title}</strong>
                                    {view.rules.lockMinutes !== null && !isEditingRules ? (
                                        <span className={styles.metaTag}>Cierre: {view.rules.lockMinutes} min antes</span>
                                    ) : null}
                                </div>

                                {view.canManage ? (
                                    <div className={styles.rulesAdminBar}>
                                        <button
                                            type="button"
                                            className={styles.inviteActionBtn}
                                            onClick={() => {
                                                setRulesFeedback(null);
                                                setIsEditingRules((current) => !current);
                                            }}
                                        >
                                            {isEditingRules ? 'Cancelar edicion' : 'Editar puntos'}
                                        </button>
                                        <span className={styles.pickFeedback}>Solo aplica a futuros puntajes.</span>
                                    </div>
                                ) : null}

                                <div className={styles.rulesList}>
                                    {view.rules.items.map((rule) => (
                                        <article key={rule.key} className={styles.rulesRow}>
                                            <div>
                                                <strong>{rule.label}</strong>
                                                {rule.description ? <p>{rule.description}</p> : null}
                                            </div>
                                            {isEditingRules ? (
                                                <input
                                                    type="text"
                                                    inputMode="numeric"
                                                    className={styles.rulesInput}
                                                    value={ruleDrafts[rule.key] ?? ''}
                                                    onChange={(event) => updateRuleDraft(rule.key, event.target.value)}
                                                    disabled={isSavingRules}
                                                />
                                            ) : (
                                                <span className={styles.rulesPoints}>{rule.points} pts</span>
                                            )}
                                        </article>
                                    ))}
                                </div>

                                {isEditingRules ? (
                                    <div className={styles.rulesEditorExtras}>
                                        <label className={styles.formField}>
                                            <span className={styles.formLabel}>Cierre de picks</span>
                                            <input
                                                type="text"
                                                inputMode="numeric"
                                                className={styles.formInput}
                                                value={lockMinutesDraft}
                                                onChange={(event) => {
                                                    if (event.target.value && !/^\d+$/.test(event.target.value)) return;
                                                    setLockMinutesDraft(event.target.value);
                                                }}
                                                disabled={isSavingRules}
                                            />
                                        </label>
                                        <label className={styles.checkboxRow}>
                                            <input
                                                type="checkbox"
                                                checked={doubleFinalsDraft}
                                                onChange={(event) => setDoubleFinalsDraft(event.target.checked)}
                                                disabled={isSavingRules}
                                            />
                                            <span>Doble puntaje en finales</span>
                                        </label>
                                        <div className={styles.rulesEditorActions}>
                                            <button
                                                type="button"
                                                className={styles.posterPrimaryCta}
                                                onClick={() => void saveRules()}
                                                disabled={isSavingRules}
                                            >
                                                {isSavingRules ? 'Guardando...' : 'Guardar reglas'}
                                            </button>
                                        </div>
                                    </div>
                                ) : null}

                                {view.rules.notes.length ? (
                                    <div className={styles.rulesNotes}>
                                        {view.rules.notes.map((note) => (
                                            <span key={note} className={styles.metaTag}>{note}</span>
                                        ))}
                                    </div>
                                ) : null}

                                {rulesFeedback ? <div className={styles.warning}>{rulesFeedback}</div> : null}
                            </section>

                            {view.canManage && view.privateLeagueId ? (
                                <section className={styles.summaryCard}>
                                    <p className={styles.previewEyebrow}>Administracion</p>
                                    <p className={styles.leagueAdminCopy}>
                                        Si esta liga ya no va a seguir, podes archivarla o borrarla sin tocar la competencia base.
                                    </p>
                                    <div className={styles.leagueAdminActions}>
                                        <button
                                            type="button"
                                            className={styles.posterSecondaryCta}
                                            onClick={() => void handleLeagueLifecycleAction('archive_league')}
                                            disabled={runningLeagueAction !== null}
                                        >
                                            {runningLeagueAction === 'archive_league' ? 'Archivando...' : 'Archivar liga'}
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.dangerCta}
                                            onClick={() => void handleLeagueLifecycleAction('delete_league')}
                                            disabled={runningLeagueAction !== null}
                                        >
                                            {runningLeagueAction === 'delete_league' ? 'Borrando...' : 'Borrar liga'}
                                        </button>
                                    </div>
                                    {leagueActionFeedback ? <div className={styles.warning}>{leagueActionFeedback}</div> : null}
                                </section>
                            ) : null}
                        </aside>
                    </section>
                </div>
            </div>
        </div>
    );
}
