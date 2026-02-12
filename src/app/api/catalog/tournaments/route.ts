import { NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET() {
    const manual = db.tournaments.map(t => ({
        id: t.id,
        name: t.name,
        sport: t.sport,
        seasonId: t.seasonId,
        source: 'Manual',
        country: undefined,
        updatedAt: t.createdAt
    }));

    const external = db.externalTournaments.map(t => ({
        id: t.id,
        name: t.name,
        sport: t.sport,
        seasonId: t.seasonId,
        source: t.source,
        country: t.country,
        updatedAt: t.updatedAt,
        logoUrl: t.logoUrl
    }));

    return NextResponse.json({
        items: [...manual, ...external]
    });
}
