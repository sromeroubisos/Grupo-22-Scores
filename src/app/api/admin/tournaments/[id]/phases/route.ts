import { NextRequest, NextResponse } from 'next/server';
import { db, PhaseConfiguration } from '@/lib/mock-db';

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const configs = db.phaseConfigurations[id] || [];
    return NextResponse.json({ ok: true, configs });
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();
    const { config, phaseIndex, isDraft } = body;

    if (!db.phaseConfigurations[id]) {
        db.phaseConfigurations[id] = [];
    }

    // Find or create phase config
    const existingIndex = db.phaseConfigurations[id].findIndex(p => p.id === String(phaseIndex));

    const phaseConfig: PhaseConfiguration = {
        ...config,
        id: String(phaseIndex),
        tournamentId: id,
        status: isDraft ? 'draft' : 'published',
        name: config.name || `Fase ${phaseIndex}`
    };

    if (existingIndex >= 0) {
        db.phaseConfigurations[id][existingIndex] = phaseConfig;
    } else {
        db.phaseConfigurations[id].push(phaseConfig);
    }

    // Update tournament status if needed
    const tournament = db.tournaments.find(t => t.id === id || t.slug === id);
    if (tournament && !isDraft) {
        tournament.status = 'published';
    }

    return NextResponse.json({ ok: true, phaseConfig });
}
