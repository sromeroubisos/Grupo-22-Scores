import { NextRequest } from 'next/server';

import { searchClubs, searchPeople } from '@/lib/server/awards';
import {
    awardsErrorResponse,
    json,
    jsonError,
    requireVerifiedParticipant,
    resolveEdition,
} from '@/lib/server/awardsHttp';

export const dynamic = 'force-dynamic';

/**
 * GET /api/awards/:edition/search?type=club|person&q=texto → { results }
 * Las sugerencias del formulario de postulación: clubes de la edición y
 * jugadores de la base. Pide sesión verificada para que el listado de nombres
 * no se pueda barrer sin entrar.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ edition: string }> }) {
    const config = await resolveEdition(params);
    if (!config) return jsonError('Esa edición no existe.', 404);

    const participant = await requireVerifiedParticipant();
    if (participant.ok === false) return participant.response;

    const type = request.nextUrl.searchParams.get('type');
    const q = request.nextUrl.searchParams.get('q') ?? '';
    if (type !== 'club' && type !== 'person') return jsonError('Falta qué buscar.', 400);

    try {
        // `senior=1`: al postular un equipo solo se ofrece plantel superior; al mandar una jugada de los pibes, todos.
        const seniorOnly = request.nextUrl.searchParams.get('senior') === '1';
        const results = type === 'club' ? await searchClubs(config, q, seniorOnly) : await searchPeople(config, q);
        return json({ results });
    } catch (error) {
        return awardsErrorResponse(error, 'No se pudo buscar.');
    }
}
