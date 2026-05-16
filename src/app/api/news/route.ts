import { getServerAuthRole, requireNewsSuperAdminServer } from '@/lib/auth/newsAccess';
import { hasNewsManagementAccess } from '@/lib/auth/roles';
import { NextResponse } from 'next/server';
import type { Database } from '@/lib/database.types';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type NewsRow = Database['public']['Tables']['news']['Row'];
type NewsInsert = Database['public']['Tables']['news']['Insert'];
type NewsUpdate = Database['public']['Tables']['news']['Update'];

type NewsRequestBody = {
    id?: string;
    title?: string;
    summary?: string | null;
    content?: string | null;
    image_url?: string | null;
    status?: NewsRow['status'];
    sport?: string | null;
    scope?: string | null;
    scope_id?: string | null;
};

const MISSING_NEWS_COLUMN_REGEX = /Could not find the '([^']+)' column of 'news' in the schema cache/i;
const DEFAULT_NEWS_LIMIT = 50;
const PUBLIC_NEWS_LIMIT = 10;
const MAX_NEWS_LIMIT = 100;

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

        // Public users only see published news, limited for pagination/performance.
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

        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}

async function verifyEditorialUser() {
    return requireNewsSuperAdminServer();
}

export async function POST(req: Request) {
    try {
        const { session } = await verifyEditorialUser();
        const admin = createAdminClient();
        const body = await req.json() as NewsRequestBody;

        // Use ONLY columns that exist in the confirmed minimalist schema
        const { title, summary, content, image_url, status, sport, scope, scope_id } = body;
        const normalizedTitle = title?.trim();
        const normalizedStatus = status || 'draft';
        const normalizedScope = scope || 'global';

        if (!normalizedTitle) {
            throw new Error('Missing title');
        }

        const payload: NewsInsert = {
            author_id: session.user.id,
            title: normalizedTitle,
            summary,
            content,
            image_url,
            status: normalizedStatus,
            sport,
            scope: normalizedScope,
            scope_id: normalizedScope === 'global' ? null : (scope_id || null),
            published_at: normalizedStatus === 'published' ? new Date().toISOString() : null
        };

        const data = await insertNewsWithSchemaFallback(admin, payload);
        return NextResponse.json({ data });
    } catch (error) {
        const message = getErrorMessage(error);
        console.error('[api/news][POST]', error);
        return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 403 : 500 });
    }
}

export async function PUT(req: Request) {
    try {
        await verifyEditorialUser();
        const admin = createAdminClient();
        const body = await req.json() as NewsRequestBody;

        // Use ONLY columns that exist in the confirmed minimalist schema
        const { id, title, summary, content, image_url, status, sport, scope, scope_id } = body;

        if (!id) {
            throw new Error('Missing id');
        }

        const updateData: NewsUpdate = {};
        if (title !== undefined) updateData.title = title;
        if (summary !== undefined) updateData.summary = summary;
        if (content !== undefined) updateData.content = content;
        if (image_url !== undefined) updateData.image_url = image_url;
        if (sport !== undefined) updateData.sport = sport;
        if (scope !== undefined) updateData.scope = scope;
        if (scope_id !== undefined) updateData.scope_id = scope === 'global' ? null : (scope_id || null);
        if (status !== undefined) {
            updateData.status = status;
            if (status === 'published') updateData.published_at = new Date().toISOString();
            if (status === 'draft') updateData.published_at = null;
        }

        const data = await updateNewsWithSchemaFallback(admin, id, updateData);
        return NextResponse.json({ data });
    } catch (error) {
        const message = getErrorMessage(error);
        console.error('[api/news][PUT]', error);
        return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 403 : 500 });
    }
}

export async function DELETE(req: Request) {
    try {
        await verifyEditorialUser();
        const admin = createAdminClient();
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');

        if (!id) throw new Error('Missing id');

        const { error } = await admin.from('news').delete().eq('id', id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (error) {
        const message = getErrorMessage(error);
        console.error('[api/news][DELETE]', error);
        return NextResponse.json({ error: message }, { status: message === 'Unauthorized' ? 403 : 500 });
    }
}
