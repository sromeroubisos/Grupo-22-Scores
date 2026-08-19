'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import styles from './ProdeLobby.module.css';
import ProdeCompetitionCard, { LockTime, StateBadge } from './ProdeCompetitionCard';
import {
    compareByPlayableThenPopular,
    getCompetitionState,
    getSportLabel,
    isUrgent,
} from './competitionState';
import { compareLobbyCompetitions, isCompetitionActive } from '@/lib/prode/lobbyOrder';
import type { ProdePrivateLeagueSummary, PublicProdeCompetition, PublicProdeUserTotal } from '@/lib/prode/types';

type ProdeLobbyProps = {
    competitions: PublicProdeCompetition[];
    totals: PublicProdeUserTotal[];
    privateLeagues?: ProdePrivateLeagueSummary[];
    viewerId?: string | null;
    schemaReady: boolean;
    embedded?: boolean;
};

// La portada muestra una vitrina, no el catálogo entero. El resto vive en
// /prode/competencias, que es la pantalla de buscar.
const FEATURED_COUNT = 10;

/**
 * Copia al portapapeles con red de contención. `navigator.clipboard` no existe fuera
 * de un contexto seguro (http a secas, que es como se prueba en la red local) y puede
 * rechazar por permisos. Sin el respaldo, el botón se apretaba y no pasaba nada.
 */
async function copyToClipboard(text: string) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Sigue por el camino de abajo.
    }

    try {
        const field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.top = '0';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand('copy');
        document.body.removeChild(field);
        return copied;
    } catch {
        return false;
    }
}

export default function ProdeLobby({
    competitions,
    totals,
    privateLeagues = [],
    viewerId = null,
    schemaReady,
    embedded = false,
}: ProdeLobbyProps) {
    const router = useRouter();
    const [managedPrivateLeagues, setManagedPrivateLeagues] = useState<ProdePrivateLeagueSummary[]>(privateLeagues);
    const [deletingLeagueId, setDeletingLeagueId] = useState<string | null>(null);
    const [confirmingLeagueId, setConfirmingLeagueId] = useState<string | null>(null);
    const [copyState, setCopyState] = useState<{ code: string; ok: boolean } | null>(null);
    const [privateLeagueFeedback, setPrivateLeagueFeedback] = useState<string | null>(null);

    // El reloj entra recién en el cliente. Antes de montar, todo lo que dependa de
    // la hora dibuja su fecha absoluta, que es idéntica en las dos puntas.
    const [now, setNow] = useState<number | null>(null);

    useEffect(() => {
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);
        return () => window.clearInterval(timer);
    }, []);

    useEffect(() => {
        setManagedPrivateLeagues(privateLeagues);
    }, [privateLeagues]);

    useEffect(() => {
        if (!copyState) return;
        const timer = window.setTimeout(() => setCopyState(null), 2200);
        return () => window.clearTimeout(timer);
    }, [copyState]);

    const featured = useMemo(
        () => [...competitions].sort(compareByPlayableThenPopular).slice(0, FEATURED_COUNT),
        [competitions],
    );

    const myCompetitions = useMemo(
        () => competitions.filter((competition) => competition.viewerIsMember).sort(compareLobbyCompetitions),
        [competitions],
    );

    // El próximo cierre que le importa al que mira: si ya juega en algún lado, el suyo;
    // si no, el más cercano de todo el catálogo, que acá funciona como invitación.
    const nextLock = useMemo(() => {
        const withLock = competitions.filter(
            (competition) => isCompetitionActive(competition) && competition.stats.nextLockAt,
        );
        if (!withLock.length) return null;

        const mine = withLock.filter((competition) => competition.viewerIsMember);
        const pool = mine.length ? mine : withLock;

        return pool
            .slice()
            .sort((left, right) => (left.stats.nextLockAt || '').localeCompare(right.stats.nextLockAt || ''))[0] || null;
    }, [competitions]);

    const selfTotal = useMemo(
        () => (viewerId ? totals.find((row) => row.userId === viewerId) || null : null),
        [totals, viewerId],
    );

    const podium = totals.slice(0, 3);
    const selfInPodium = Boolean(selfTotal && podium.some((row) => row.userId === selfTotal.userId));

    const openCount = competitions.filter(isCompetitionActive).length;
    const totalPlayers = competitions.reduce((sum, competition) => sum + competition.members.totalMembers, 0);
    const hasMine = myCompetitions.length > 0 || managedPrivateLeagues.length > 0;
    const hiddenCount = Math.max(0, competitions.length - featured.length);

    const handleCopyCode = useCallback(async (code: string) => {
        setCopyState({ code, ok: await copyToClipboard(code) });
    }, []);

    async function handleDeleteLeague(league: ProdePrivateLeagueSummary) {
        if (!league.canManage || deletingLeagueId) return;

        setConfirmingLeagueId(null);
        setDeletingLeagueId(league.id);
        setPrivateLeagueFeedback('Borrando liga...');

        try {
            const response = await fetch('/api/prode/private-leagues', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({
                    leagueId: league.id,
                    action: 'delete_league',
                }),
            });

            const result = await response.json() as { error?: string; message?: string };

            if (!response.ok) {
                throw new Error(result.error || 'No se pudo borrar la liga.');
            }

            setManagedPrivateLeagues((current) => current.filter((item) => item.id !== league.id));
            setPrivateLeagueFeedback(result.message || 'La liga fue borrada.');
            router.refresh();
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo borrar la liga.';
            setPrivateLeagueFeedback(message);
        } finally {
            setDeletingLeagueId(null);
        }
    }

    const actions = (
        <div className={styles.headerActions}>
            <Link href="/prode/ligas/unirse" className={styles.btnSecondary}>
                Ingresar con codigo
            </Link>
            <Link href="/prode/ligas/nueva" className={styles.btnPrimary}>
                Crear liga privada
            </Link>
        </div>
    );

    const standing = selfTotal ? (
        <Link href="/prode/ranking-global" className={styles.standing}>
            <span className={styles.standingRank}>{selfTotal.position ? `#${selfTotal.position}` : '-'}</span>
            <span className={styles.standingLabel}>en el ranking global</span>
            <span className={styles.standingPoints}>{selfTotal.totalPoints} pts</span>
        </Link>
    ) : null;

    const lobbyContent = (
        <div className={`${styles.shell} ${embedded ? styles.embedded : ''}`}>
            {embedded ? (
                <div className={styles.headerSide}>
                    {standing}
                    {actions}
                </div>
            ) : (
                <header className={styles.header}>
                    <div className={styles.headerCopy}>
                        <Link href="/juegos" className={styles.backLink}>← Juegos</Link>
                        <h1 className={styles.title}>Prode</h1>
                        <p className={styles.lede}>
                            Elegi donde jugar: ligas publicas por torneo, o una privada con codigo para
                            competir entre amigos. Prodes no oficiales, gratis, sin apuestas ni premios.
                        </p>
                    </div>
                    <div className={styles.headerSide}>
                        {standing}
                        {actions}
                    </div>
                </header>
            )}

            {nextLock && nextLock.stats.nextLockAt ? (
                <Link
                    href={`/prode/${nextLock.slug}`}
                    className={`${styles.nextLock} ${now !== null && isUrgent(nextLock.stats.nextLockAt, now) ? styles.nextLockUrgent : ''}`}
                >
                    <StateBadge state={getCompetitionState(nextLock)} />

                    <span className={styles.nextLockBody}>
                        <span className={styles.nextLockLabel}>
                            {nextLock.viewerIsMember ? 'Tu proximo cierre' : 'Proximo cierre'}
                        </span>
                        <span className={styles.nextLockName}>{nextLock.name}</span>
                    </span>

                    <span className={styles.nextLockTime}>
                        <LockTime iso={nextLock.stats.nextLockAt} now={now} className={styles.nextLockCountdown} />
                        <span className={styles.nextLockHint}>
                            {nextLock.stats.open} {nextLock.stats.open === 1 ? 'partido abierto' : 'partidos abiertos'}
                        </span>
                    </span>
                </Link>
            ) : null}

            {!schemaReady ? (
                <p className={styles.notice}>
                    La base activa todavia no tiene aplicadas las tablas del prode. Cuando corra la
                    migracion de Supabase, estas listas se pueblan solas.
                </p>
            ) : null}

            {hasMine ? (
                <section className={styles.section}>
                    <div className={styles.sectionHead}>
                        <div className={styles.sectionHeading}>
                            <h2 className={styles.sectionTitle}>Donde jugas</h2>
                            <span className={styles.sectionCount}>
                                {myCompetitions.length + managedPrivateLeagues.length}
                            </span>
                        </div>
                    </div>

                    {privateLeagueFeedback ? (
                        <p className={styles.feedback} role="status">{privateLeagueFeedback}</p>
                    ) : null}

                    <div className={styles.mineList}>
                        {myCompetitions.map((competition) => {
                            const state = getCompetitionState(competition);

                            return (
                                <div key={competition.id} className={styles.mineRow}>
                                    <Link href={`/prode/${competition.slug}`} className={styles.mineLink}>
                                        <span className={styles.mineTop}>
                                            <span className={styles.mineName}>{competition.name}</span>
                                            <StateBadge state={state} />
                                        </span>
                                        <span className={styles.mineMeta}>
                                            <span>{getSportLabel(competition.sportId)}</span>
                                            <span>
                                                <span className={styles.mineMetaNum}>{competition.members.totalMembers}</span>
                                                {' '}participantes
                                            </span>
                                            {competition.stats.nextLockAt && (state === 'open' || state === 'live') ? (
                                                <span>
                                                    Cierra en{' '}
                                                    <LockTime
                                                        iso={competition.stats.nextLockAt}
                                                        now={now}
                                                        className={styles.mineMetaNum}
                                                    />
                                                </span>
                                            ) : null}
                                        </span>
                                    </Link>

                                    <div className={styles.mineActions}>
                                        <Link href={`/prode/${competition.slug}`} className={styles.btnSecondary}>
                                            Entrar
                                        </Link>
                                    </div>
                                </div>
                            );
                        })}

                        {managedPrivateLeagues.map((league) => {
                            const confirming = confirmingLeagueId === league.id;
                            const deleting = deletingLeagueId === league.id;

                            return (
                                <div key={league.id} className={styles.mineRow}>
                                    <Link href={`/prode/ligas/${league.slug}`} className={styles.mineLink}>
                                        <span className={styles.mineTop}>
                                            <span className={styles.mineName}>{league.name}</span>
                                            <span className={styles.mineTag}>Privada</span>
                                            {league.canManage ? <span className={styles.mineTag}>Admin</span> : null}
                                        </span>
                                        <span className={styles.mineMeta}>
                                            <span>{league.competitionName}</span>
                                            <span>
                                                <span className={styles.mineMetaNum}>{league.memberCount}</span>
                                                {' '}participantes
                                            </span>
                                        </span>
                                    </Link>

                                    <div className={styles.mineActions}>
                                        {league.inviteCode ? (
                                            <button
                                                type="button"
                                                className={`${styles.inviteCode} ${
                                                    copyState?.code === league.inviteCode && copyState.ok ? styles.inviteCodeCopied : ''
                                                }`}
                                                onClick={() => void handleCopyCode(league.inviteCode as string)}
                                                aria-label={`Copiar el codigo de invitacion ${league.inviteCode}`}
                                            >
                                                {copyState?.code === league.inviteCode
                                                    ? (copyState.ok ? 'Copiado' : 'Copialo a mano')
                                                    : league.inviteCode}
                                            </button>
                                        ) : null}

                                        <Link href={`/prode/ligas/${league.slug}`} className={styles.btnSecondary}>
                                            Entrar
                                        </Link>

                                        {league.canManage ? (
                                            confirming ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        className={`${styles.btnGhost} ${styles.btnDanger}`}
                                                        onClick={() => void handleDeleteLeague(league)}
                                                        disabled={deleting}
                                                    >
                                                        {deleting ? 'Borrando...' : 'Confirmar borrado'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.btnGhost}
                                                        onClick={() => setConfirmingLeagueId(null)}
                                                        disabled={deleting}
                                                    >
                                                        Cancelar
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className={styles.btnGhost}
                                                    onClick={() => setConfirmingLeagueId(league.id)}
                                                    disabled={Boolean(deletingLeagueId)}
                                                >
                                                    Borrar
                                                </button>
                                            )
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>
            ) : null}

            <section id="ligas" className={styles.section}>
                <div className={styles.sectionHead}>
                    <div className={styles.sectionHeading}>
                        <h2 className={styles.sectionTitle}>Ligas disponibles</h2>
                        <span className={styles.sectionCount}>
                            {openCount} abiertas de {competitions.length} · {totalPlayers} jugadores
                        </span>
                    </div>
                    <Link href="/prode/competencias" className={styles.sectionLink}>
                        Buscar en todas
                    </Link>
                </div>

                {featured.length ? (
                    <div className={styles.cardGrid}>
                        {featured.map((competition) => (
                            <ProdeCompetitionCard key={competition.id} competition={competition} now={now} />
                        ))}

                        {hiddenCount > 0 ? (
                            <Link href="/prode/competencias" className={styles.seeAll}>
                                Ver las {competitions.length} competencias
                                <span className={styles.seeAllHint}>+{hiddenCount} mas</span>
                            </Link>
                        ) : null}
                    </div>
                ) : (
                    <div className={styles.empty}>
                        <p className={styles.emptyTitle}>Todavia no hay competencias publicadas</p>
                        <p className={styles.emptyText}>
                            Cuando se publique el primer prode va a aparecer aca. Mientras tanto podes
                            armar una liga privada sobre cualquier torneo.
                        </p>
                    </div>
                )}
            </section>

            <section className={styles.createBanner}>
                <div>
                    <h2 className={styles.createBannerTitle}>Jugar entre amigos</h2>
                    <p className={styles.createBannerText}>
                        Arma una liga privada sobre cualquier prode publicado, comparti el codigo y
                        el ranking queda entre ustedes.
                    </p>
                </div>
                <div className={styles.createBannerActions}>
                    <Link href="/prode/ligas/unirse" className={styles.btnSecondary}>Ingresar con codigo</Link>
                    <Link href="/prode/ligas/nueva" className={styles.btnPrimary}>Crear liga</Link>
                </div>
            </section>

            <section id="ranking-global" className={styles.section}>
                <div className={styles.sectionHead}>
                    <div className={styles.sectionHeading}>
                        <h2 className={styles.sectionTitle}>Ranking global</h2>
                        <span className={styles.sectionCount}>suma de todos los prodes</span>
                    </div>
                    <Link href="/prode/ranking-global" className={styles.sectionLink}>
                        Ver ranking completo
                    </Link>
                </div>

                {totals.length ? (
                    <div className={styles.ranking}>
                        {podium.map((row) => (
                            <article
                                key={row.userId}
                                className={`${styles.rankRow} ${row.userId === viewerId ? styles.rankRowSelf : ''}`}
                            >
                                <span className={styles.rankPos}>{row.position ?? '-'}</span>
                                <span className={styles.rankIdentity}>
                                    <span className={styles.rankName}>
                                        {row.userName}
                                        {row.userId === viewerId ? <span className={styles.selfTag}>Vos</span> : null}
                                    </span>
                                    <span className={styles.rankSub}>
                                        <span className={styles.rankSubNum}>{row.exactHits}</span> exactos ·{' '}
                                        <span className={styles.rankSubNum}>{row.correctOutcomes}</span> aciertos
                                    </span>
                                </span>
                                <span className={styles.rankPoints}>{row.totalPoints} pts</span>
                            </article>
                        ))}

                        {selfTotal && !selfInPodium ? (
                            <>
                                <div className={styles.rankGap} aria-hidden="true">···</div>
                                <article className={`${styles.rankRow} ${styles.rankRowSelf}`}>
                                    <span className={styles.rankPos}>{selfTotal.position ?? '-'}</span>
                                    <span className={styles.rankIdentity}>
                                        <span className={styles.rankName}>
                                            {selfTotal.userName}
                                            <span className={styles.selfTag}>Vos</span>
                                        </span>
                                        <span className={styles.rankSub}>
                                            <span className={styles.rankSubNum}>{selfTotal.exactHits}</span> exactos ·{' '}
                                            <span className={styles.rankSubNum}>{selfTotal.correctOutcomes}</span> aciertos
                                        </span>
                                    </span>
                                    <span className={styles.rankPoints}>{selfTotal.totalPoints} pts</span>
                                </article>
                            </>
                        ) : null}
                    </div>
                ) : (
                    <div className={styles.empty}>
                        <p className={styles.emptyTitle}>Todavia no hay puntajes</p>
                        <p className={styles.emptyText}>
                            El acumulado se arma solo cuando se puntue la primera fecha. Entra a una
                            competencia abierta y carga tus pronosticos antes del cierre.
                        </p>
                    </div>
                )}
            </section>
        </div>
    );

    if (embedded) {
        return lobbyContent;
    }

    return (
        <div className={styles.page}>
            <div className="container">
                {lobbyContent}
            </div>
        </div>
    );
}
