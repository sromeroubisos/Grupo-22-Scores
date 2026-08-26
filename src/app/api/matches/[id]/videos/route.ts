import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { ensureMatchManagementAccess } from '@/lib/server/matchCenterAdmin';
import { getMatchVideos, saveMatchVideos } from '@/lib/server/matchVideos';
import { enrichVideoThumbnails } from '@/lib/server/videoThumbnails';
import {
    MATCH_VIDEO_KINDS,
    MATCH_VIDEO_POSTERS,
    MAX_MATCH_VIDEOS,
    MAX_VIDEO_TITLE_LENGTH,
    MAX_VIDEO_URL_LENGTH,
    parseVideoUrl,
    type MatchVideoLink,
} from '@/lib/matches/videoLinks';

export const dynamic = 'force-dynamic';

// Local (uuid) o del proveedor (FlashScore, espn-*, fih-*): la llave es la
// misma que viaja en la URL de la página.
const MATCH_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const PayloadSchema = z.object({
    videos: z
        .array(
            z.object({
                id: z.string().trim().max(64).nullish(),
                url: z.string().trim().min(1).max(MAX_VIDEO_URL_LENGTH),
                kind: z.enum(MATCH_VIDEO_KINDS),
                title: z.string().trim().max(MAX_VIDEO_TITLE_LENGTH).nullish(),
                poster: z.enum(MATCH_VIDEO_POSTERS).optional(),
            }),
        )
        .max(MAX_MATCH_VIDEOS, `Tope de ${MAX_MATCH_VIDEOS} videos por partido.`),
});

function json(body: unknown, init?: ResponseInit) {
    const headers = new Headers(init?.headers);
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return NextResponse.json(body, { ...init, headers });
}

function jsonError(message: string, status: number, details?: unknown) {
    return json({ error: message, ...(details !== undefined ? { details } : {}) }, { status });
}

function statusForAuthError(message: string) {
    return message === 'Unauthorized' ? 401 : message === 'Forbidden' ? 403 : 500;
}

async function resolveMatchId(params: Promise<{ id: string }>) {
    const raw = (await params).id;
    const matchId = typeof raw === 'string' ? raw.trim() : '';
    return MATCH_ID_PATTERN.test(matchId) ? matchId : null;
}

/** GET /api/matches/:id/videos → { videos } — público. */
export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const matchId = await resolveMatchId(params);
    if (!matchId) return jsonError('Invalid match id', 400);

    try {
        const videos = await getMatchVideos(matchId);
        return json({ videos });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return jsonError(message, 500);
    }
}

/**
 * PUT /api/matches/:id/videos  { videos: [{ id?, url, kind, title? }] } → { videos }
 *
 * Reemplaza la lista entera. Mismo gate que el editor del partido: quien
 * administra ESTE torneo. En un partido externo no hay torneo local, así que
 * solo pasan los administradores globales.
 */
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const matchId = await resolveMatchId(params);
    if (!matchId) return jsonError('Invalid match id', 400);

    let userId: string | null = null;
    try {
        const context = await ensureMatchManagementAccess(matchId, MANAGEMENT_MEMBERSHIP_ROLES);
        userId = context.userId ?? null;
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Forbidden';
        const status = statusForAuthError(message);
        return jsonError(status === 500 ? 'Forbidden' : message, status === 500 ? 403 : status);
    }

    const body = await request.json().catch(() => null);
    const parsed = PayloadSchema.safeParse(body);
    if (!parsed.success) {
        return jsonError('La lista de videos no tiene la forma esperada.', 400, parsed.error.issues);
    }

    try {
        const existing = await getMatchVideos(matchId);
        const existingById = new Map(existing.map((video) => [video.id, video]));
        const seen = new Set<string>();
        const now = new Date().toISOString();
        const videos: MatchVideoLink[] = [];

        for (const item of parsed.data.videos) {
            const url = item.url.trim();
            const parsedUrl = parseVideoUrl(url);
            if (!parsedUrl) {
                return jsonError(
                    `El link "${url.slice(0, 80)}" no es una dirección válida: tiene que empezar con http:// o https://.`,
                    400,
                );
            }

            const dedupeKey = url.toLowerCase();
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);

            const previous = item.id ? existingById.get(item.id) : undefined;
            // La portada ya resuelta se conserva mientras el link sea el mismo.
            const keepsThumbnail = previous !== undefined && previous.url === url && previous.thumbnailUrl !== undefined;
            videos.push({
                id: previous?.id ?? randomUUID(),
                url,
                kind: item.kind,
                title: item.title?.trim() || null,
                provider: parsedUrl.provider,
                addedAt: previous?.addedAt || now,
                ...(keepsThumbnail ? { thumbnailUrl: previous.thumbnailUrl } : {}),
                ...(item.poster === 'generated' ? { poster: 'generated' as const } : {}),
            });
        }

        // La portada de lo nuevo (la que publica la plataforma) se busca ahora,
        // una sola vez, y queda guardada con el link.
        const { videos: withThumbnails } = await enrichVideoThumbnails(videos);
        const saved = await saveMatchVideos({ matchId, videos: withThumbnails, updatedBy: userId });
        return json({ videos: saved });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Internal server error';
        return jsonError(message, 500);
    }
}
