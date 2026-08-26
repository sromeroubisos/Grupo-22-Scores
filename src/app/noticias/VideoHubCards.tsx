'use client';

// Los torneos con videos, como tarjetas uniformes de a dos por fila (en el
// teléfono también): la portada de su último video con el marcador, el
// nombre, cuánto hay para ver y la votación abierta si hay. La portada de
// noticias muestra una fila y despliega el resto con "Ver más"; el índice
// /noticias/videos las muestra todas.

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, ChevronDown, Play, Vote } from 'lucide-react';

import VideoPlate from '@/components/video/VideoPlate';
import { VIDEO_KIND_LABELS, describeVideo } from '@/lib/matches/videoLinks';
import { plateCaption, type VideoPlateContext } from '@/lib/matches/videoPlate';
import { playLabelForSport } from '@/lib/videoHub/polls';
import {
    scoreLabelOf,
    type VideoHubFeaturedVideo,
    type VideoHubOpenPoll,
    type VideoHubSummary,
    type VideoHubTeam,
    type VideoHubTournament,
} from '@/lib/videoHub/types';

import styles from './page.module.css';

// ── Textos ────────────────────────────────────────────────────────────────

const TIME_ZONE = 'America/Argentina/Buenos_Aires';
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "22 ago", en hora argentina y con partes numéricas: el servidor y el navegador escriben lo mismo. */
export function formatDay(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'numeric', day: 'numeric' }).formatToParts(date);
    const day = parts.find((part) => part.type === 'day')?.value;
    const month = Number(parts.find((part) => part.type === 'month')?.value);
    return day && month ? `${day} ${MONTHS[month - 1]}` : null;
}

export function pluralize(count: number, singular: string, plural: string): string {
    return `${count} ${count === 1 ? singular : plural}`;
}

export function hubHref(hub: VideoHubSummary): string {
    return `/noticias/videos/${hub.tournament.id}`;
}

// ── Piezas ────────────────────────────────────────────────────────────────

function TournamentMark({ tournament, eager = false }: { tournament: VideoHubTournament; eager?: boolean }) {
    if (tournament.logoUrl) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- logo por el proxy propio.
            <img
                className={styles.tMark}
                src={tournament.logoUrl}
                alt=""
                width={32}
                height={32}
                loading={eager ? 'eager' : 'lazy'}
                decoding="async"
            />
        );
    }
    return <span className={styles.tMarkFallback} aria-hidden="true">{tournament.name.slice(0, 1)}</span>;
}

function TeamMark({ team }: { team: VideoHubTeam }) {
    if (team.logoUrl) {
        // eslint-disable-next-line @next/next/no-img-element -- escudo por el proxy propio.
        return <img className={styles.crest} src={team.logoUrl} alt="" width={22} height={22} loading="lazy" decoding="async" />;
    }
    return <span className={styles.crestFallback} aria-hidden="true">{team.name.slice(0, 1)}</span>;
}

function plateContextOf(hub: VideoHubSummary, video: VideoHubFeaturedVideo): VideoPlateContext {
    return {
        tournamentName: hub.tournament.name,
        roundLabel: video.match.roundLabel,
        sportId: hub.tournament.sportId,
        home: { name: video.match.home.name, logoUrl: video.match.home.logoUrl },
        away: { name: video.match.away.name, logoUrl: video.match.away.logoUrl },
        score: video.match.score,
        fieldColor: hub.tournament.primaryColor,
        accentColor: hub.tournament.secondaryColor,
    };
}

/**
 * La portada de un hub: la miniatura del último video con el partido encima,
 * o la placa G22 (que ya trae escudos y marcador) cuando no hay miniatura o
 * quien lo cargó la pidió. `priority` = está sobre el pliegue: no se difiere.
 */
function HubCover({ hub, priority = false }: { hub: VideoHubSummary; priority?: boolean }) {
    const [broken, setBroken] = useState(false);
    const video = hub.latestVideo;

    if (!video) {
        return (
            <span className={styles.coverEmpty} aria-hidden="true">
                <TournamentMark tournament={hub.tournament} eager={priority} />
            </span>
        );
    }

    const usePlate = video.generatedPoster || !video.posterUrl || broken;
    const caption = plateCaption({ title: video.title, kindLabel: VIDEO_KIND_LABELS[video.kind] });
    const score = scoreLabelOf(video.match);

    return (
        <>
            {usePlate ? (
                <VideoPlate context={plateContextOf(hub, video)} title={caption.title} kind={caption.kind} playSlot />
            ) : (
                <>
                    {/* eslint-disable-next-line @next/next/no-img-element -- portada remota de la plataforma; no pasa por el optimizador. */}
                    <img
                        className={styles.coverImg}
                        src={video.posterUrl ?? undefined}
                        alt=""
                        width={640}
                        height={360}
                        loading={priority ? 'eager' : 'lazy'}
                        fetchPriority={priority ? 'high' : 'auto'}
                        decoding="async"
                        referrerPolicy="no-referrer"
                        onError={() => setBroken(true)}
                    />
                    <span className={styles.coverShade} aria-hidden="true" />
                    <span className={styles.coverKind} aria-hidden="true">{VIDEO_KIND_LABELS[video.kind]}</span>
                    <span className={styles.coverMatch} aria-hidden="true">
                        <span className={styles.coverTeam}>
                            <TeamMark team={video.match.home} />
                            <span className={styles.coverName}>{video.match.home.name}</span>
                        </span>
                        <span className={styles.coverScore}>{score ?? 'vs'}</span>
                        <span className={`${styles.coverTeam} ${styles.coverTeamAway}`}>
                            <span className={styles.coverName}>{video.match.away.name}</span>
                            <TeamMark team={video.match.away} />
                        </span>
                    </span>
                </>
            )}
            <span className={styles.coverPlay} aria-hidden="true">
                <Play size={22} fill="currentColor" strokeWidth={0} />
            </span>
        </>
    );
}

function pollLine(poll: VideoHubOpenPoll, playSingular: string): string {
    const parts = [`Votación abierta${poll.name ? ` · ${poll.name}` : ''}`];
    if (poll.totalVotes !== null && poll.totalVotes > 0) parts.push(pluralize(poll.totalVotes, 'voto', 'votos'));
    return parts.length === 1 && !poll.name ? `Votación abierta · el mejor ${playSingular}` : parts.join(' · ');
}

interface CardProps {
    hub: VideoHubSummary;
    canManage: boolean;
    /** Las dos primeras están sobre el pliegue: su portada no se difiere. */
    priority?: boolean;
    /** El nivel del nombre: h3 debajo de un h2 de sección, h2 en el índice. */
    titleTag?: 'h2' | 'h3';
}

/** Un torneo con videos. La portada y el nombre llevan al hub; la votación, a votar. */
export function HubCard({ hub, canManage, priority = false, titleTag = 'h3' }: CardProps) {
    const Title = titleTag;
    const href = hubHref(hub);
    const play = playLabelForSport(hub.tournament.sportId);
    const video = hub.latestVideo;
    const poll = hub.openPoll;
    const latestDay = formatDay(hub.latestAddedAt);
    const meta = [
        pluralize(hub.videoCount, 'video', 'videos'),
        pluralize(hub.matchCount, 'partido', 'partidos'),
        latestDay,
    ].filter(Boolean).join(' · ');
    const latestLine = video ? [describeVideo(video), video.match.roundLabel].filter(Boolean).join(' · ') : null;
    const titleId = `hub-${hub.tournament.id}`;

    return (
        <li className={styles.hubCard} aria-labelledby={titleId}>
            <Link href={href} className={styles.hubCover} aria-label={`Ver los videos de ${hub.tournament.name}`} tabIndex={-1}>
                <HubCover hub={hub} priority={priority} />
            </Link>

            <div className={styles.hubBody}>
                <div className={styles.hubIdentity}>
                    <TournamentMark tournament={hub.tournament} eager={priority} />
                    <Title id={titleId} className={styles.hubName}>
                        <Link href={href} className={styles.hubNameLink}>{hub.tournament.name}</Link>
                    </Title>
                </div>
                <p className={styles.hubMeta}>{meta}</p>
                {latestLine && <p className={styles.hubLatest}>Lo último: <strong>{latestLine}</strong></p>}
                {poll && (
                    <Link href={`${href}#polls-title`} className={styles.hubPollChip}>
                        <Vote size={13} aria-hidden="true" /> {pollLine(poll, play.singular)}
                    </Link>
                )}
                <div className={styles.hubActions}>
                    <Link href={href} className={styles.hubCta}>
                        Ver los videos <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                    {canManage && (
                        <Link href={`${href}?votacion=nueva`} className={styles.hubAdmin}>
                            Nueva votación
                        </Link>
                    )}
                </div>
            </div>
        </li>
    );
}

// ── La sección y el índice ────────────────────────────────────────────────

interface SectionProps {
    hubs: VideoHubSummary[];
    canManage: boolean;
    /** Cuántas tarjetas se ven de entrada; "Ver más" despliega el resto. Sin tope, todas. */
    initialCount?: number;
    titleTag?: 'h2' | 'h3';
}

export function VideoHubsSection({ hubs, canManage, initialCount, titleTag = 'h3' }: SectionProps) {
    const [expanded, setExpanded] = useState(false);
    if (hubs.length === 0) return null;

    const shown = expanded || initialCount === undefined ? hubs : hubs.slice(0, initialCount);
    const hidden = hubs.length - shown.length;

    return (
        <>
            <ul className={styles.hubGrid} aria-label="Torneos con videos">
                {shown.map((hub, index) => (
                    <HubCard key={hub.tournament.id} hub={hub} canManage={canManage} priority={index < 2} titleTag={titleTag} />
                ))}
            </ul>
            {hidden > 0 && (
                <button type="button" className={styles.moreBtn} onClick={() => setExpanded(true)} aria-expanded={false}>
                    Ver más torneos <span className={styles.moreCount}>{hidden}</span>
                    <ChevronDown size={16} aria-hidden="true" />
                </button>
            )}
        </>
    );
}

/** La página /noticias/videos: todos los torneos con videos. */
export function VideoHubsIndex({ hubs, canManage }: { hubs: VideoHubSummary[]; canManage: boolean }) {
    const totalVideos = hubs.reduce((sum, hub) => sum + hub.videoCount, 0);

    return (
        <div className={styles.page}>
            <div className={styles.shell}>
                <div className={styles.topBar}>
                    <Link href="/noticias" className={styles.backLink}>← Volver a noticias</Link>
                    <span className={styles.sectionMeta}>
                        {pluralize(hubs.length, 'torneo', 'torneos')} · {pluralize(totalVideos, 'video', 'videos')}
                    </span>
                </div>

                <header className={styles.mastheadText}>
                    <p className={styles.eyebrow}>Noticias · Videos</p>
                    <h1 className={styles.title}>Videos por torneo</h1>
                    <p className={styles.lede}>
                        Highlights, partidos completos y clips de cada torneo, y la votación al mejor try o gol.
                    </p>
                </header>

                {hubs.length === 0 ? (
                    <div className={styles.empty}>
                        <p className={styles.emptyTitle}>Todavía no hay videos cargados en ningún torneo.</p>
                    </div>
                ) : (
                    <section className={styles.section} aria-label="Torneos con videos">
                        <VideoHubsSection hubs={hubs} canManage={canManage} titleTag="h2" />
                    </section>
                )}
            </div>
        </div>
    );
}
