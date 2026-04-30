import { NextResponse } from 'next/server';
import { getApiErrorStatus, requireGlobalAdminApiUser } from '@/lib/auth/apiAdmin';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

export async function GET() {
    try {
        await requireGlobalAdminApiUser();
    } catch (error) {
        return jsonError('Unauthorized', getApiErrorStatus(error, 401));
    }

    return NextResponse.json({ data: [] });
}
