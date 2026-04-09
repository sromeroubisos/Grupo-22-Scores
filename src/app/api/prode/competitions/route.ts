import { NextResponse } from 'next/server';
import { listPublicProdeCompetitions } from '@/lib/server/prodeCompetitions';

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('schema cache')) return 503;
    return 500;
}

export async function GET() {
    try {
        const result = await listPublicProdeCompetitions();
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json(
            {
                schemaReady: true,
                data: [],
                error: error instanceof Error ? error.message : 'No se pudieron cargar las competencias de prode.',
            },
            { status: getStatusCode(error) },
        );
    }
}
