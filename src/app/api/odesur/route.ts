import { NextResponse } from 'next/server';
import {
    getOdesurCompetitionMatches,
    getOdesurCompetitionStandings,
    getOdesurDayBoard,
    getOdesurDisciplineMedalTable,
    getOdesurLatestMedallists,
    getOdesurMedalTable,
    getOdesurMedalTablesByDiscipline,
    getOdesurMedallists,
    getOdesurSportAgenda,
    getOdesurSportDays,
    getOdesurSportsIndex,
    getOdesurUnitRanking,
    odesurCompetition,
    odesurDisciplineName,
    odesurFlagUrl,
    ODESUR_DISCIPLINES,
    ODESUR_FIRST_DAY,
    ODESUR_LAST_DAY,
    type OdesurDisciplineCode,
} from '@/lib/services/odesur2026';
import { toOdesurMatchView } from '@/lib/server/odesurViews';

/**
 * Lo que pide el apartado de los Juegos Suramericanos (`/juegos-odesur`) cada
 * vez que se cambia de pestaña, de día o de deporte. Una ruta, varias vistas:
 *
 *   ?view=medals                         medallero general, por deporte y últimas
 *   ?view=agenda&day=2026-09-15          la agenda de un día, los 60 deportes,
 *                                        con quién compite en cada unidad
 *   ?view=index                          el calendario de los 60 deportes
 *   ?view=sport&disc=FEN&day=2026-09-15  un deporte: sus días, la agenda de uno,
 *                                        su medallero y sus medallistas
 *   ?view=result&disc=SWM&code=<ResCode> la clasificación de una unidad
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
const DISC_CODE = /^[A-Z0-9]{3}$/;
/** `W.100FREE-----------.FNL-.000100--`: la llave de una unidad de Bornan. */
const RES_CODE = /^[MWXO]\.[A-Z0-9-]+\.[A-Z0-9-]+\.[0-9A-Z-]+$/;

function isGamesDay(day: string): boolean {
    return ISO_DAY.test(day) && day >= ODESUR_FIRST_DAY && day <= ODESUR_LAST_DAY;
}

function gamesDays(): string[] {
    const days: string[] = [];
    const cursor = new Date(`${ODESUR_FIRST_DAY}T12:00:00Z`);
    const end = new Date(`${ODESUR_LAST_DAY}T12:00:00Z`);
    while (cursor <= end) {
        days.push(cursor.toISOString().slice(0, 10));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return days;
}

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
            if (!isGamesDay(day)) {
                return json({ error: 'Ese día no hay Juegos.' }, 400);
            }
            const board = await getOdesurDayBoard(day);
            return json({ day, items: board.items, partial: board.partial });
        }

        if (view === 'index') {
            return json(await getOdesurSportsIndex(gamesDays()));
        }

        if (view === 'sport') {
            const code = (params.get('disc') || '').toUpperCase();
            if (!DISC_CODE.test(code)) {
                return json({ error: 'Deporte desconocido.' }, 400);
            }
            const days = (await getOdesurSportDays(code)).filter(isGamesDay);
            const requested = params.get('day') || '';
            // El día pedido si el deporte compite; si no, el primero que
            // todavía no pasó, y si ya pasaron todos, el último.
            const today = params.get('today') || '';
            const day = days.includes(requested)
                ? requested
                : (days.find((value) => value >= today) ?? days[days.length - 1] ?? '');

            const [items, medals, medallists] = await Promise.all([
                day ? getOdesurSportAgenda(code, day) : Promise.resolve([]),
                getOdesurDisciplineMedalTable(code).catch(() => null),
                getOdesurMedallists(code).catch(() => []),
            ]);

            return json({
                code,
                name: odesurDisciplineName(code),
                days,
                day,
                items,
                medals,
                medallists: medallists.map((item) => ({ ...item, flag: odesurFlagUrl(item.orgCode, item.orgName) })),
            });
        }

        if (view === 'result') {
            const code = (params.get('disc') || '').toUpperCase();
            const resCode = params.get('code') || '';
            if (!DISC_CODE.test(code) || !RES_CODE.test(resCode)) {
                return json({ error: 'Prueba desconocida.' }, 400);
            }
            return json({ rows: await getOdesurUnitRanking(code, resCode) });
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
            if (!DISC_CODE.test(code)) {
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
