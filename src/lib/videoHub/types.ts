// El hub de videos de un torneo: lo que la página necesita para dibujar cada
// partido con sus videos, resuelto en el servidor. Tipos puros y dos
// utilidades sin dependencias.

import type { MatchVideoKind, MatchVideoLink, MatchVideoProvider } from '../matches/videoLinks';
import type { VideoPollOptionRef } from './polls';

export interface VideoHubTeam {
    id: string | null;
    name: string;
    logoUrl: string | null;
}

export interface VideoHubMatch {
    id: string;
    /** ISO en UTC. null si el partido no tiene fecha. */
    dateTime: string | null;
    roundLabel: string | null;
    status: string | null;
    home: VideoHubTeam;
    away: VideoHubTeam;
    score: { home: number; away: number } | null;
    videos: MatchVideoLink[];
}

export interface VideoHubTournament {
    id: string;
    name: string;
    slug: string | null;
    logoUrl: string | null;
    sportId: string | null;
    seasonId: string | null;
    /** Los colores del torneo (hex), para la placa generada. */
    primaryColor: string | null;
    secondaryColor: string | null;
}

export interface VideoHub {
    tournament: VideoHubTournament;
    /** Solo partidos con al menos un video, del más reciente al más viejo. */
    matches: VideoHubMatch[];
    videoCount: number;
}

/** El video cargado más recientemente en el torneo: la portada de su tarjeta en noticias. */
export interface VideoHubFeaturedVideo {
    id: string;
    kind: MatchVideoKind;
    title: string | null;
    provider: MatchVideoProvider;
    /** ISO. En filas viejas sin fecha propia, la de la fila. */
    addedAt: string;
    /**
     * La portada que publica la plataforma, si ya está guardada o se deduce
     * de la URL. null = se dibuja la placa G22. La portada de noticias no sale
     * a buscar nada: lo que no está, se dibuja.
     */
    posterUrl: string | null;
    /** true si quien lo cargó pidió la placa G22 aunque haya miniatura. */
    generatedPoster: boolean;
    match: Pick<VideoHubMatch, 'id' | 'dateTime' | 'roundLabel' | 'home' | 'away' | 'score'>;
}

/** La votación abierta de un torneo, para invitar a votar desde la portada. */
export interface VideoHubOpenPoll {
    id: string;
    name: string;
    title: string;
    closesAt: string | null;
    /** null = no se pudieron contar (la portada no muestra el número). */
    totalVotes: number | null;
    optionCount: number;
}

/** Una tarjeta en la portada de noticias: el torneo y cuánto hay para ver. */
export interface VideoHubSummary {
    tournament: VideoHubTournament;
    videoCount: number;
    matchCount: number;
    /** ISO del video cargado más recientemente. */
    latestAddedAt: string | null;
    /** El video más reciente, con su partido: la portada de la tarjeta. */
    latestVideo: VideoHubFeaturedVideo | null;
    /** La votación abierta, si hay. La pega la página (ver noticias/page.tsx). */
    openPoll: VideoHubOpenPoll | null;
}

export function matchLabelOf(match: Pick<VideoHubMatch, 'home' | 'away'>): string {
    return `${match.home.name} vs ${match.away.name}`;
}

export function scoreLabelOf(match: Pick<VideoHubMatch, 'score'>): string | null {
    return match.score ? `${match.score.home}–${match.score.away}` : null;
}

export function findHubVideo(
    hub: Pick<VideoHub, 'matches'>,
    ref: VideoPollOptionRef,
): { match: VideoHubMatch; video: MatchVideoLink } | null {
    const match = hub.matches.find((candidate) => candidate.id === ref.matchId);
    const video = match?.videos.find((candidate) => candidate.id === ref.videoId);
    return match && video ? { match, video } : null;
}
