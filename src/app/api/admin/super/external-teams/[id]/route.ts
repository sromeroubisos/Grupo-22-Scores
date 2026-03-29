import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/server';
import { createClient } from '@/lib/supabase/server';
import {
    getExternalTeamLogoOverride,
    upsertExternalTeamLogoOverride,
} from '@/lib/server/externalTeamLogoOverrides';

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

const SELECT_COLUMNS = 'id, source, name, short_name, logo_url, sport, country, team_url';

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireSuperAdmin();
        const { id } = await params;
        const supabase = await createClient();
        const storedOverride = await getExternalTeamLogoOverride(id);

        if (storedOverride) {
            return NextResponse.json({ ok: true, data: storedOverride });
        }

        const { data, error } = await (supabase as any)
            .from('external_teams')
            .select(SELECT_COLUMNS)
            .eq('id', id)
            .maybeSingle();

        if (error) {
            if (error.message?.includes('Could not find the table')) {
                return NextResponse.json({ ok: true, data: null });
            }
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        if (!data) {
            return NextResponse.json({ ok: true, data: null });
        }

        return NextResponse.json({ ok: true, data });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unauthorized';
        return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 401 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireSuperAdmin();
        const { id } = await params;
        const body = await request.json().catch(() => ({}));
        const supabase = await createClient();

        const payload = {
            id,
            source: normalizeString(body?.source) || 'flashscore',
            name: normalizeString(body?.name) || `External team ${id}`,
            short_name: normalizeString(body?.short_name),
            logo_url: normalizeString(body?.logo_url),
            sport: normalizeString(body?.sport) || 'rugby',
            country: normalizeString(body?.country),
            team_url: normalizeString(body?.team_url),
        };

        const storedOverride = await upsertExternalTeamLogoOverride(payload);

        const { data, error } = await (supabase as any)
            .from('external_teams')
            .upsert(payload, { onConflict: 'id' })
            .select(SELECT_COLUMNS)
            .single();

        if (error) {
            if (error.message?.includes('Could not find the table')) {
                return NextResponse.json({ ok: true, data: storedOverride, storage: 'file' });
            }
            return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
        }

        return NextResponse.json({ ok: true, data, storage: 'database' });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unauthorized';
        return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 401 });
    }
}
