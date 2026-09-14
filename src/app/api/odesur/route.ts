import { NextResponse } from 'next/server';
import {
    getOdesurAgenda,
    getOdesurCompetitionMatches,
    getOdesurCompetitionStandings,
    getOdesurLatestMedallists,
    getOdesurMedalTable,
    getOdesurMedalTablesByDiscipline,
    getOdesurMedallists,
    odesurCompetition,
    odesurFlagUrl,
    ODESUR_DISCIPLINES,
    ODESUR_FIRST_DAY,
    ODESUR_LAST_DAY,
    type OdesurDisciplineCode,
} from '@/lib/services/odesur2026';
import { toOdesurMatchView } from '@/lib/server/odesurViews';

/**
 * Lo que pide el apartado de los Juegos Suramericanos (`/juegos-odesur`) cada
 * vez que se cambia de pestaña, de día o de deporte. Una ruta, cuatro vistas:
 *
 *   ?view=medals                         medallero general, por deporte y últimas
 *   ?view=agenda&day=2026-09-15          la agenda de un día, los 60 deportes
 *   ?view=competition&disc=HOC&gender=w  partidos y zonas de un torneo de equipo
 *   ?view=medallists&disc=DIV            quién ganó cada prueba de un deporte
 *
 * Lo pesado vive en el servicio, con su caché; acá solo se elige la vista y se
 * dice cuánto puede guardarse la respuesta.
 */

// El medallero y la agenda se mueven con cada final; medio minuto en el CDN
// no deja a nadie mirando algo viejo y ahorra idas a Bornan.
const CACHE_CONTROL = 'public, max-age=15, s-maxage=30, stale-while-revalidate=120';

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function json(data: unknown, status = 200) {
    return NextResponse.json(data, {
        status,
        headers: { 'Cache-Control': status === 200 ? CACHE_CONTROL : 'no-store' },
    });
}

export async function GET(request: Request) {
    const params = new URL(request.url).searchParams;
    const view = params.get('view') || '';

    try {
        if (view === 'medals') {
            const [general, byDiscipline, latest] = await Promise.all([
                getOdesurMedalTable(),
                getOdesurMedalTablesByDiscipline().catch(() => []),
                getOdesurLatestMedallists().catch(() => []),
            ]);
            return json({ general, byDiscipline, latest });
        }

        if (view === 'agenda') {
            const day = params.get('day') || '';
            // Solo los días de los Juegos: cualquier otra fecha es un pedido
            // que Bornan contestaría vacío, y no hay por qué hacerle el viaje.
            if (!ISO_DAY.test(day) || day < ODESUR_FIRST_DAY || day > ODESUR_LAST_DAY) {
                return json({ error: 'Ese día no hay Juegos.' }, 400);
            }
            return json({ day, items: await getOdesurAgenda(day) });
        }

        if (view === 'competition') {
            const code = (params.get('disc') || '').toUpperCase() as OdesurDisciplineCode;
            const gender = params.get('gender') === 'w' ? 'w' : 'm';
            if (!ODESUR_DISCIPLINES[code]) {
                return json({ error: 'Deporte desconocido.' }, 400);
            }

            const competition = odesurCompetition(code, gender);
            // Las zonas van por su cuenta: un deporte que se juega por llave, o
            // una tabla que no contesta, no le saca los partidos a nadie.
            const [matches, standings] = await Promise.all([
                getOdesurCompetitionMatches(competition),
                getOdesurCompetitionStandings(competition).catch(() => []),
            ]);

            return json({
                tournamentId: competition.tournamentId,
                name: competition.name,
                matches: matches.map(toOdesurMatchView),
                standings,
            });
        }

        if (view === 'medallists') {
            const code = (params.get('disc') || '').toUpperCase();
            if (!/^[A-Z0-9]{3}$/.test(code)) {
                return json({ error: 'Deporte desconocido.' }, 400);
            }
            const items = await getOdesurMedallists(code);
            return json({
                items: items.map((item) => ({ ...item, flag: odesurFlagUrl(item.orgCode, item.orgName) })),
            });
        }

        return json({ error: 'Vista desconocida.' }, 400);
    } catch (error) {
        // Un error del proveedor no es "no hay nada": la pantalla tiene que
        // poder decir que la fuente no contesta.
        console.error('[api/odesur] la fuente no contestó:', error instanceof Error ? error.message : error);
        return json({ error: 'Los resultados de los Juegos no están disponibles en este momento.' }, 502);
    }
}
