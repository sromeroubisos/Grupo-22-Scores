import { NextRequest, NextResponse } from 'next/server';
import { fetchDivisions } from '@/lib/services/divisionService';
import { getApiErrorMessage, getApiErrorStatus, requireAdminApiUser } from '@/lib/auth/apiAdmin';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ clubId: string }> }
) {
    try {
        await requireAdminApiUser();
    } catch (error) {
        return NextResponse.json(
            { error: getApiErrorMessage(error, 'Unauthorized') },
            { status: getApiErrorStatus(error, 401) },
        );
    }

    try {
        const { clubId } = await params;
        const divisions = await fetchDivisions(clubId);

        const squads = divisions.map((division) => ({
            id: division.id,
            name: division.name,
            sport: division.sport,
            gender: division.gender,
            category: division.category,
            season: division.season,
            status: division.status,
            featured: division.featured ?? false,
            players_count: division.players_count ?? 0,
            staff_count: division.staff_count ?? 0,
        }));

        return NextResponse.json(squads);
    } catch (error) {
        console.error('Unexpected error fetching squads:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
