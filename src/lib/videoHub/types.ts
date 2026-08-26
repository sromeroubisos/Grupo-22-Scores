// El hub de videos de un torneo: lo que la página necesita para dibujar cada
// partido con sus videos, resuelto en el servidor. Tipos puros y dos
// utilidades sin dependencias.

import type { MatchVideoLink } from '../matches/videoLinks';
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

/** Una tarjeta en la portada de noticias: el torneo y cuánto hay para ver. */
export interface VideoHubSummary {
    tournament: VideoHubTournament;
    videoCount: number;
    matchCount: number;
    /** ISO del video cargado más recientemente. */
    latestAddedAt: string | null;
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
