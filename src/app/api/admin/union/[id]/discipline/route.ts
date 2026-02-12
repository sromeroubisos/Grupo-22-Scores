import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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
