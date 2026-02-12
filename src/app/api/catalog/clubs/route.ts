import { NextResponse } from 'next/server';
import { db } from '@/lib/mock-db';

export async function GET() {
    const manual = db.clubs.map(c => ({
        id: c.id,
        name: c.name,
        sport: undefined,
        country: undefined,
        logoUrl: c.logoUrl,
        source: 'Manual',
        updatedAt: new Date().toISOString()
    }));

    const external = db.externalClubs.map(c => ({
        id: c.id,
        name: c.name,
        sport: c.sports,
        country: c.country,
        logoUrl: c.logoUrl,
        source: c.source,
        updatedAt: c.updatedAt
    }));

    return NextResponse.json({
        items: [...manual, ...external]
    });
}
