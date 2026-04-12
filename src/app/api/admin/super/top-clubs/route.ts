import { NextResponse } from 'next/server';
import { requireAdminApiUser } from '@/lib/auth/apiAdmin';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

export async function GET() {
    try {
        await requireAdminApiUser();
    } catch {
        return jsonError('Unauthorized', 401);
    }

    return NextResponse.json({ data: [] });
}
