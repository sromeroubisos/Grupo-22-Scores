// Las noticias: leer (público solo lo publicado), crear, editar y borrar
// (solo el super admin de noticias). Lo que llega se valida acá y se
// contesta con un 400 que dice qué está mal; el error crudo de Supabase
// va al log, nunca a la pantalla.

import { NextResponse } from 'next/server';

import { getServerAuthRole, requireNewsSuperAdminServer } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import type { Database } from '@/lib/database.types';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type NewsRow = Database['public']['Tables']['news']['Row'];
type NewsInsert = Database['public']['Tables']['news']['Insert'];
type NewsUpdate = Database['public']['Tables']['news']['Update'];

type NewsRequestBody = {
    id?: unknown;
    title?: unknown;
    summary?: unknown;
    content?: unknown;
    image_url?: unknown;
    status?: unknown;
    sport?: unknown;
    scope?: unknown;
    scope_id?: unknown;
};

const MISSING_NEWS_COLUMN_REGEX = /Could not find the '([^']+)' column of 'news' in the schema cache/i;
const DEFAULT_NEWS_LIMIT = 50;
const PUBLIC_NEWS_LIMIT = 10;
const MAX_NEWS_LIMIT = 100;

// Los mismos topes que muestra el editor.
const TITLE_MAX = 140;
const SUMMARY_MAX = 280;
const CONTENT_MAX = 20000;
const SPORT_MAX = 40;
const IMAGE_URL_MAX = 2048;
const STATUSES = new Set<NewsRow['status']>(['draft', 'published', 'archived']);
const SCOPES = new Set(['global', 'tournament', 'club', 'union']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Un dato que no sirve: se contesta 400 con el mensaje, tal cual. */
class NewsValidationError extends Error {}

function parseNewsLimit(value: string | null, fallback: number) {
    const parsed = Number.parseInt(value || String(fallback), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, 1), MAX_NEWS_LIMIT);
}

function getErrorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'object' && error !== null) {
        const maybeMessage = 'message' in error ? error.message : null;
        const maybeDetails = 'details' in error ? error.details : null;
        const maybeHint = 'hint' in error ? error.hint : null;

        const parts = [maybeMessage, maybeDetails, maybeHint]
            .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

        if (parts.length > 0) {
            return parts.join(' | ');
        }
    }

    return 'Unknown error';
}

function extractMissingNewsColumn(error: unknown) {
    const match = getErrorMessage(error).match(MISSING_NEWS_COLUMN_REGEX);
    return match?.[1] || null;
}

function isTransientSupabaseReadError(error: unknown) {
    const message = getErrorMessage(error).toLowerCase();
    return (
        message.includes('timed out') ||
        message.includes('fetch failed') ||
        message.includes('connection timed out') ||
        message.includes('error 522') ||
        message.includes('<!doctype html') ||
        message.includes('supabase.co')
    );
}

function removeUndefinedFields(record: Record<string, unknown>) {
    return Object.fromEntries(
        Object.entries(record).filter(([, value]) => value !== undefined)
    );
}

async function insertNewsWithSchemaFallback(
    admin: ReturnType<typeof createAdminClient>,
    payload: NewsInsert
) {
    const insertPayload: Record<string, unknown> = removeUndefinedFields({ ...payload });

    while (true) {
        const { data, error } = await admin.from('news').insert(insertPayload).select().single();

        if (!error) {
            return data;
        }

        const missingColumn = extractMissingNewsColumn(error);
        if (!missingColumn || !(missingColumn in insertPayload)) {
            throw error;
        }

        delete insertPayload[missingColumn];
    }
}

async function updateNewsWithSchemaFallback(
    admin: ReturnType<typeof createAdminClient>,
    id: string,
    payload: NewsUpdate
) {
    const updatePayload: Record<string, unknown> = removeUndefinedFields({ ...payload });

    while (true) {
        const { data, error } = await admin.from('news').update(updatePayload).eq('id', id).select().single();

        if (!error) {
            return data;
        }

        const missingColumn = extractMissingNewsColumn(error);
        if (!missingColumn || !(missingColumn in updatePayload)) {
            throw error;
        }

        delete updatePayload[missingColumn];
    }
}

// ── Lo que llega del editor ───────────────────────────────────────────────

/** undefined = no vino (en un PUT, no se toca); null = vino vacío. */
function cleanText(value: unknown, max: number, label: string): string | null | undefined {
    if (value === undefined) return undefined;
    if (value === null) return null;
    if (typeof value !== 'string') throw new NewsValidationError(`${label} tiene que ser texto.`);
    const text = value.trim();
    if (text.length > max) throw new NewsValidationError(`${label} no puede pasar los ${max} caracteres.`);
    return text || null;
}

function cleanImageUrl(value: unknown): string | null | undefined {
    const text = cleanText(value, IMAGE_URL_MAX, 'El link de la imagen');
    if (text && !/^https?:\/\//i.test(text)) {
        throw new NewsValidationError('La imagen tiene que ser un link que empiece con https://, o subirse desde el editor.');
    }
    return text;
}

function cleanStatus(value: unknown): NewsRow['status'] | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string' || !STATUSES.has(value)) {
        throw new NewsValidationError('El estado tiene que ser borrador, publicada o archivada.');
    }
    return value;
}

function cleanScope(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return 'global';
    if (typeof value !== 'string' || !SCOPES.has(value)) {
        throw new NewsValidationError('El alcance tiene que ser general, torneo, club o unión.');
    }
    return value;
}

function cleanId(value: unknown): string {
    if (typeof value !== 'string' || !UUID.test(value)) throw new NewsValidationError('Falta el id de la noticia.');
    return value;
}

function errorResponse(scope: string, error: unknown) {
    if (error instanceof NewsValidationError) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }
    const message = getErrorMessage(error);
    if (message === 'Unauthorized') {
        return NextResponse.json({ error: 'No tenés permiso para administrar noticias.' }, { status: 403 });
    }
    console.error(`[api/news][${scope}]`, error);
    return NextResponse.json({ error: 'No se pudo guardar la noticia. Probá de nuevo en unos segundos.' }, { status: 500 });
}

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const requestedLimit = parseNewsLimit(searchParams.get('limit'), DEFAULT_NEWS_LIMIT);

    try {
        const { supabase, role } = await getServerAuthRole();
        const canManageNews = hasNewsManagementAccess(role);

        if (id) {
            let singleQuery = supabase.from('news').select('*').eq('id', id);

            if (!canManageNews) {
                singleQuery = singleQuery.eq('status', 'published');
            }

            const { data, error } = await singleQuery.maybeSingle();
            if (error) throw error;

            return NextResponse.json({ data });
        }

        let query = supabase.from('news').select('*').order('published_at', { ascending: false });

        // El público solo ve lo publicado, y con tope.
        if (!canManageNews) {
            query = query.eq('status', 'published').limit(PUBLIC_NEWS_LIMIT);
        } else {
            query = query.limit(requestedLimit);
        }

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json({ data });
    } catch (error) {
        if (isTransientSupabaseReadError(error)) {
            console.warn('[api/news][GET] transient Supabase read error:', getErrorMessage(error));
            return NextResponse.json({
                data: id ? null : [],
                degraded: true,
            });
        }

        console.error('[api/news][GET]', error);
        return NextResponse.json({ error: 'No se pudieron leer las noticias.' }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const { session } = await requireNewsSuperAdminServer();
        const admin = createAdminClient();
        const body = (await req.json().catch(() => ({}))) as NewsRequestBody;

        const title = cleanText(body.title, TITLE_MAX, 'El título');
        if (!title) throw new NewsValidationError('El título es obligatorio.');

        const status = cleanStatus(body.status) ?? 'draft';
        const scope = cleanScope(body.scope) ?? 'global';
        const scopeId = cleanText(body.scope_id, 128, 'El id del alcance') ?? null;

        const payload: NewsInsert = {
            author_id: session!.user.id,
            title,
            summary: cleanText(body.summary, SUMMARY_MAX, 'El resumen') ?? null,
            content: cleanText(body.content, CONTENT_MAX, 'El contenido') ?? null,
            image_url: cleanImageUrl(body.image_url) ?? null,
            status,
            sport: cleanText(body.sport, SPORT_MAX, 'El deporte') ?? null,
            scope,
            scope_id: scope === 'global' ? null : scopeId,
            published_at: status === 'published' ? new Date().toISOString() : null,
        };

        const data = await insertNewsWithSchemaFallback(admin, payload);
        return NextResponse.json({ data });
    } catch (error) {
        return errorResponse('POST', error);
    }
}

export async function PUT(req: Request) {
    try {
        await requireNewsSuperAdminServer();
        const admin = createAdminClient();
        const body = (await req.json().catch(() => ({}))) as NewsRequestBody;

        const id = cleanId(body.id);
        const updateData: NewsUpdate = {};

        const title = cleanText(body.title, TITLE_MAX, 'El título');
        if (title === null) throw new NewsValidationError('El título es obligatorio.');
        if (title !== undefined) updateData.title = title;

        const summary = cleanText(body.summary, SUMMARY_MAX, 'El resumen');
        if (summary !== undefined) updateData.summary = summary;
        const content = cleanText(body.content, CONTENT_MAX, 'El contenido');
        if (content !== undefined) updateData.content = content;
        const imageUrl = cleanImageUrl(body.image_url);
        if (imageUrl !== undefined) updateData.image_url = imageUrl;
        const sport = cleanText(body.sport, SPORT_MAX, 'El deporte');
        if (sport !== undefined) updateData.sport = sport;

        const scope = cleanScope(body.scope);
        if (scope !== undefined) updateData.scope = scope;
        const scopeId = cleanText(body.scope_id, 128, 'El id del alcance');
        if (scopeId !== undefined || scope === 'global') {
            updateData.scope_id = scope === 'global' ? null : (scopeId ?? null);
        }

        // Sin `status` en el pedido, el estado (y su fecha) no se tocan: así
        // "Guardar cambios" en una nota publicada no le cambia la fecha.
        const status = cleanStatus(body.status);
        if (status !== undefined) {
            updateData.status = status;
            if (status === 'published') updateData.published_at = new Date().toISOString();
            if (status === 'draft') updateData.published_at = null;
        }

        if (Object.keys(updateData).length === 0) throw new NewsValidationError('No hay nada para guardar.');

        const data = await updateNewsWithSchemaFallback(admin, id, updateData);
        return NextResponse.json({ data });
    } catch (error) {
        return errorResponse('PUT', error);
    }
}

export async function DELETE(req: Request) {
    try {
        await requireNewsSuperAdminServer();
        const admin = createAdminClient();
        const { searchParams } = new URL(req.url);
        const id = cleanId(searchParams.get('id'));

        const { error } = await admin.from('news').delete().eq('id', id);
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        return errorResponse('DELETE', error);
    }
}
