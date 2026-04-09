import { NextResponse } from 'next/server';
import { listPublicProdeUserTotals } from '@/lib/server/prodeCompetitions';

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('schema cache')) return 503;
    return 500;
}

export async function GET() {
    try {
        const result = await listPublicProdeUserTotals();
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json(
            {
                schemaReady: true,
                data: [],
                error: error instanceof Error ? error.message : 'No se pudo cargar la tabla total del prode.',
            },
            { status: getStatusCode(error) },
        );
    }
}
