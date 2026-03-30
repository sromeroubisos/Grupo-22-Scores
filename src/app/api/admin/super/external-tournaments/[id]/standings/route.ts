import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/server';
import {
    getExternalTournamentStandingsOverride,
    upsertExternalTournamentStandingsOverride,
} from '@/lib/server/externalTournamentStandingsOverrides';

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

async function requireExactSuperAdmin() {
    const user = await getCurrentUser();

    if (!user) {
        throw new Error('Unauthorized');
    }

    if (user.role !== 'super_admin') {
        throw new Error('Forbidden: Super admin access required');
    }

    return user;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        await requireExactSuperAdmin();
        const { id } = await params;
        const data = await getExternalTournamentStandingsOverride(id);
        return NextResponse.json({ ok: true, data });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unauthorized';
        return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 401 });
    }
}

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        await requireExactSuperAdmin();
        const { id } = await params;
        const body = await request.json().catch(() => ({}));

        const data = await upsertExternalTournamentStandingsOverride({
            id,
            source: normalizeString(body?.source) || 'external-api',
            groups: Array.isArray(body?.groups) ? body.groups : [],
            assignments: Array.isArray(body?.assignments) ? body.assignments : [],
            labels: Array.isArray(body?.labels) ? body.labels : [],
        });

        return NextResponse.json({ ok: true, data, storage: 'file' });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unauthorized';
        return NextResponse.json({ ok: false, error: message }, { status: message.includes('Forbidden') ? 403 : 401 });
    }
}
