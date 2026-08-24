import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';
import { getApiErrorMessage, getApiErrorStatus, requireAdminApiUser } from '@/lib/auth/apiAdmin';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        await requireAdminApiUser();
    } catch (error) {
        return NextResponse.json(
            { error: getApiErrorMessage(error, 'Unauthorized') },
            { status: getApiErrorStatus(error, 401) },
        );
    }

    const { id } = await params;

    const incidents = db.disciplineIncidents.filter(i => i.unionId === id);
    const sanctions = db.disciplineSanctions.filter(s => {
        const incident = db.disciplineIncidents.find(i => i.id === s.incidentId);
        return incident?.unionId === id;
    });

    const tournaments = db.tournaments.filter(t => t.unionId === id);

    return NextResponse.json({
        ok: true,
        incidents,
        sanctions,
        tournaments
    });
}
