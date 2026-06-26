'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Gavel } from 'lucide-react';
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

function formatKickoffTime(value: string) {
    try {
        return new Intl.DateTimeFormat('es-AR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
    } catch {
        return '';
    }
}

function formatDayChip(value: string) {
    try {
        const date = new Date(value);
        const weekday = new Intl.DateTimeFormat('es-AR', { weekday: 'short' }).format(date).replace('.', '');
        const day = new Intl.DateTimeFormat('es-AR', { day: 'numeric' }).format(date);
        return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${day}`;
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

function TeamCrest({ label, logoUrl, size = 'sm' }: { label: string; logoUrl: string | null; size?: 'sm' | 'lg' }) {
    const [imageFailed, setImageFailed] = useState(false);
    const isLarge = size === 'lg';
    const wrapClass = isLarge ? styles.scoreTeamCrestLg : styles.scoreTeamCrest;
    const fallbackClass = isLarge ? styles.scoreTeamCrestFallbackLg : styles.scoreTeamCrestFallback;

    if (logoUrl && !imageFailed) {
        return (
            <span className={wrapClass} aria-hidden="true">
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
        <span className={fallbackClass} aria-hidden="true" title={label}>
            <Shield size={isLarge ? 22 : 16} strokeWidth={2.1} />
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
    const searchParams = useSearchParams();
    const { user, login } = useAuth();
    const playPanelRef = useRef<HTMLDivElement | null>(null);
    const [events, setEvents] = useState(view.events);
    const [savingEventId, setSavingEventId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<Record<string, string>>({});
    const [copiedTarget, setCopiedTarget] = useState<'code' | 'link' | null>(null);
    const [activeTab, setActiveTab] = useState<'play' | 'table' | 'rules'>('play');
    // Día seleccionado en el date picker del play (null = aún sin elegir → cae al primero abierto).
    const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
    const [isEditingRules, setIsEditingRules] = useState(false);
    const [isSavingRules, setIsSavingRules] = useState(false);
    const [rulesFeedback, setRulesFeedback] = useState<string | null>(null);
    const [leagueActionFeedback, setLeagueActionFeedback] = useState<string | null>(null);
    const [runningLeagueAction, setRunningLeagueAction] = useState<'archive_league' | 'delete_league' | null>(null);
    const [nameDraft, setNameDraft] = useState(view.title);
    const [isRenamingLeague, setIsRenamingLeague] = useState(false);
    const [renameFeedback, setRenameFeedback] = useState<string | null>(null);
    const [ruleDrafts, setRuleDrafts] = useState<Record<string, string>>(() => Object.fromEntries(
        view.rules.items.map((rule) => [rule.key, rule.points.toString()]),
    ));
    const [lockMinutesDraft, setLockMinutesDraft] = useState(view.rules.lockMinutes?.toString() ?? '');
    const [doubleFinalsDraft, setDoubleFinalsDraft] = useState(view.rules.doubleFinals);
    // false = "mantener" (congela partidos ya jugados); true = "cambiar todo".
    // Default conservador: no reescribir la historia salvo que el admin lo pida.
    const [retroactiveDraft, setRetroactiveDraft] = useState(false);
    const [scoreDrafts, setScoreDrafts] = useState<Record<string, { home: string; away: string }>>(() => Object.fromEntries(
        view.events.map((event) => [
            event.id,
            {
                home: event.prediction?.predictedHomeScore?.toString() ?? '',
                away: event.prediction?.predictedAwayScore?.toString() ?? '',
            },
        ]),
    ));

    // Cuando alguien llega recién ingresado desde el link de invitación
    // (?jugar=1), lo dejamos directo en el panel de cargar resultados: forzamos
    // el tab 'play' y scrolleamos hasta la sección, en vez de que tenga que
    // buscarla entre el hero y las pestañas.
    useEffect(() => {
        if (searchParams.get('jugar') !== '1') {
            return;
        }

        setActiveTab('play');

        const timer = window.setTimeout(() => {
            playPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);

        return () => window.clearTimeout(timer);
    }, [searchParams]);

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

    // El date picker filtra por día: el chip elegido (o el primer día abierto por defecto)
    // define qué grupo se muestra. Si el día seleccionado ya no existe, cae al primero.
    const activeDayKey = openEventGroups.some((group) => group.key === selectedDayKey)
        ? selectedDayKey
        : openEventGroups[0]?.key ?? null;
    const visibleGroups = useMemo(
        () => (activeDayKey ? openEventGroups.filter((group) => group.key === activeDayKey) : openEventGroups),
        [activeDayKey, openEventGroups],
    );

    const latestClosedEvents = useMemo(() => {
        // El historial dice "tus últimos cierres, con resultado y puntos": prioriza
        // eventos que ya tienen resultado o donde el usuario jugó, para no llenar la
        // lista de partidos cerrados todavía sin marcador ("Resultado pendiente").
        const withSignal = closedEvents.filter((event) => event.officialResult || event.prediction);
        const source = withSignal.length ? withSignal : closedEvents;
        return [...source].sort((left, right) => right.startsAt.localeCompare(left.startsAt)).slice(0, 6);
    }, [closedEvents]);

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
                    retroactive: retroactiveDraft,
                }),
            });

            const result = await response.json() as { error?: string; message?: string };

            if (!response.ok) {
                throw new Error(result.error || 'No se pudieron actualizar las reglas.');
            }

            setRulesFeedback(result.message || 'Reglas actualizadas.');
            setIsEditingRules(false);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudieron actualizar las reglas.';
            setRulesFeedback(message);
        } finally {
            setIsSavingRules(false);
        }
    }

    async function handleRenameLeague() {
        if (!view.canManage || !view.privateLeagueId) {
            return;
        }

        const trimmedName = nameDraft.trim();

        if (!trimmedName) {
            setRenameFeedback('El nombre de la liga es obligatorio.');
            return;
        }

        if (trimmedName === view.title) {
            setRenameFeedback('Ese ya es el nombre actual de la liga.');
            return;
        }

        setIsRenamingLeague(true);
        setRenameFeedback('Guardando nombre...');

        try {
            const response = await fetch('/api/prode/private-leagues', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    leagueId: view.privateLeagueId,
                    action: 'rename_league',
                    name: trimmedName,
                }),
            });

            const result = await response.json() as { error?: string; message?: string; name?: string };

            if (!response.ok) {
                throw new Error(result.error || 'No se pudo renombrar la liga.');
            }

            setRenameFeedback(result.message || 'El nombre de la liga se actualizó.');
            router.refresh();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo renombrar la liga.';
            setRenameFeedback(message);
        } finally {
            setIsRenamingLeague(false);
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
                        <div ref={playPanelRef} className={`${styles.playMainColumn} ${activeTab === 'table' || activeTab === 'rules' ? styles.mobileTabHidden : ''}`}>
                            <section className={styles.section}>
                                <div className={styles.sectionHeader}>
                                    <div>
                                        <h2 className={styles.sectionTitle}>Jugar ahora</h2>
                                        <p className={styles.sectionText}>
                                            Si la competencia esta en marcha, aca aparecen primero los partidos jugables.
                                        </p>
                                    </div>
                                </div>

                                {openEventGroups.length > 1 ? (
                                    <nav className={styles.datePicker} aria-label="Elegir fecha">
                                        {openEventGroups.map((group) => (
                                            <button
                                                key={group.key}
                                                type="button"
                                                className={`${styles.dateChip} ${group.key === activeDayKey ? styles.dateChipActive : ''}`}
                                                aria-pressed={group.key === activeDayKey}
                                                onClick={() => setSelectedDayKey(group.key)}
                                            >
                                                {formatDayChip(group.events[0]?.startsAt ?? group.key)}
                                            </button>
                                        ))}
                                    </nav>
                                ) : null}

                                {!user && openEvents.length ? (
                                    <div className={styles.loginBanner}>
                                        <div className={styles.loginBannerCopy}>
                                            <strong>Inicia sesion para guardar</strong>
                                            <p>Apenas elijas un resultado te llevamos directo al login.</p>
                                        </div>
                                        <button
                                            type="button"
                                            className={styles.loginBannerBtn}
                                            onClick={() => login('fan', typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/prode')}
                                        >
                                            Ingresar
                                        </button>
                                    </div>
                                ) : null}

                                {openEvents.length ? (
                                    <div className={styles.pickList}>
                                        {visibleGroups.map((group) => (
                                            <div key={group.key} className={styles.pickGroup}>
                                                <div className={styles.dateDivider}>
                                                    <span>{group.label}</span>
                                                </div>

                                                {group.events.map((event) => {
                                                    const currentPrediction = event.prediction;
                                                    return (
                                                        <article key={event.id} className={styles.pickCard}>
                                                            <div className={styles.cardStatusRow}>
                                                                <span className={styles.cardStatus}>
                                                                    <span className={`${styles.cardStatusDot} ${event.isOpen ? styles.cardStatusDotOpen : ''}`} />
                                                                    {getEventStatusLabel(event)}
                                                                </span>
                                                                <span className={styles.cardTime}>{formatKickoffTime(event.startsAt)}</span>
                                                            </div>

                                                            <div className={styles.matchScoreRow}>
                                                                <div className={styles.teamSide}>
                                                                    <TeamCrest label={event.homeLabel} logoUrl={event.homeLogoUrl} size="lg" />
                                                                    <span className={styles.teamName}>{event.homeLabel}</span>
                                                                </div>

                                                                <div className={styles.scoreInputs}>
                                                                    <input
                                                                        type="text"
                                                                        inputMode="numeric"
                                                                        aria-label={`Goles ${event.homeLabel}`}
                                                                        className={styles.scoreInputBox}
                                                                        value={scoreDrafts[event.id]?.home ?? ''}
                                                                        onChange={(eventInput) => updateScoreDraft(event.id, 'home', eventInput.target.value)}
                                                                        placeholder="-"
                                                                        disabled={savingEventId === event.id}
                                                                    />
                                                                    <span className={styles.scoreColon}>:</span>
                                                                    <input
                                                                        type="text"
                                                                        inputMode="numeric"
                                                                        aria-label={`Goles ${event.awayLabel}`}
                                                                        className={styles.scoreInputBox}
                                                                        value={scoreDrafts[event.id]?.away ?? ''}
                                                                        onChange={(eventInput) => updateScoreDraft(event.id, 'away', eventInput.target.value)}
                                                                        placeholder="-"
                                                                        disabled={savingEventId === event.id}
                                                                    />
                                                                </div>

                                                                <div className={styles.teamSide}>
                                                                    <TeamCrest label={event.awayLabel} logoUrl={event.awayLogoUrl} size="lg" />
                                                                    <span className={styles.teamName}>{event.awayLabel}</span>
                                                                </div>
                                                            </div>

                                                            <button
                                                                type="button"
                                                                className={`${styles.saveBtnFull} ${currentPrediction ? styles.saveBtnFullSaved : ''}`}
                                                                onClick={() => void savePrediction(event)}
                                                                disabled={savingEventId === event.id}
                                                            >
                                                                {savingEventId === event.id ? 'Guardando...' : currentPrediction ? 'Actualizar pronostico' : 'Guardar pronostico'}
                                                            </button>

                                                            <span className={styles.pickFeedback}>
                                                                {feedback[event.id] || (currentPrediction ? 'Pronostico guardado' : `Cierra: ${formatDate(event.locksAt)}`)}
                                                            </span>
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

                            {openEvents.length && view.rules.items.length ? (
                                <section className={styles.quickRules}>
                                    <div className={styles.quickRulesHead}>
                                        <Gavel size={16} color="#86f6b6" />
                                        <h3>Reglas rapidas</h3>
                                    </div>
                                    <div className={styles.quickRulesList}>
                                        {view.rules.items.map((rule) => (
                                            <div key={rule.key} className={styles.quickRulesRow}>
                                                <span>{rule.label}</span>
                                                <span className={styles.rulesPoints}>+{rule.points} pts</span>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ) : null}

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

                            <section className={styles.summaryCard}>
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
                                        <span className={styles.pickFeedback}>Al guardar elegís si recalcula lo ya jugado.</span>
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
                                        <label className={styles.checkboxRow}>
                                            <input
                                                type="checkbox"
                                                checked={retroactiveDraft}
                                                onChange={(event) => setRetroactiveDraft(event.target.checked)}
                                                disabled={isSavingRules}
                                            />
                                            <span>
                                                Recalcular partidos ya jugados con las nuevas reglas
                                                <small className={styles.checkboxHint}>
                                                    {retroactiveDraft
                                                        ? 'Se reescribe toda la tabla, incluida la historia.'
                                                        : 'Los partidos ya cerrados conservan su puntaje actual.'}
                                                </small>
                                            </span>
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

                                    <label className={styles.formField}>
                                        <span className={styles.formLabel}>Nombre de la liga</span>
                                        <input
                                            type="text"
                                            className={styles.formInput}
                                            value={nameDraft}
                                            maxLength={80}
                                            onChange={(event) => setNameDraft(event.target.value)}
                                            disabled={isRenamingLeague}
                                        />
                                    </label>
                                    <div className={styles.leagueAdminActions}>
                                        <button
                                            type="button"
                                            className={styles.posterSecondaryCta}
                                            onClick={() => void handleRenameLeague()}
                                            disabled={isRenamingLeague || !nameDraft.trim() || nameDraft.trim() === view.title}
                                        >
                                            {isRenamingLeague ? 'Guardando...' : 'Guardar nombre'}
                                        </button>
                                    </div>
                                    {renameFeedback ? <div className={styles.warning}>{renameFeedback}</div> : null}

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
