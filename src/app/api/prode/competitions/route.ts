import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { listPublicProdeCompetitions } from '@/lib/server/prodeCompetitions';

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('schema cache')) return 503;
    return 500;
}

export async function GET() {
    try {
        // El lobby embebido en el perfil entra por aca. Sin la sesion, `viewerIsMember`
        // seria false para todos y el carril "Donde jugas" desapareceria ahi adentro.
        const supabase = await createClient();
        const {
            data: { user: authUser },
        } = await supabase.auth.getUser();

        const result = await listPublicProdeCompetitions(authUser?.id ?? null);
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
