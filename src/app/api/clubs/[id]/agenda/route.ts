import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { createClient } from '@/lib/supabase/server';
import { canManageClubContext, getClubManagementTarget, requireUserAccessContext } from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES, isGlobalAdminRole } from '@/lib/auth/roles';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import {
    categoryLevelRank,
    compareCategoryLevel,
    resolveCategoryLevel,
    type ResolvedCategoryLevel,
} from '@/lib/clubs/categoryLevel';
import { isMatchVisibleToPublic } from '@/lib/matchReview';
import { canonicalizeSportId } from '@/lib/clubDerivatives';

/**
 * ¿Esta cuenta administra el club? Viaja en la agenda y no en una llamada
 * aparte porque el panel ya la pide: una sola ida y vuelta decide si además de
 * mirar la jornada se puede cargar un partido.
 *
 * Es solo para DIBUJAR el botón. Quien manda sigue siendo la ruta de escritura,
 * que revalida por su cuenta: un `canManage: true` falseado en el cliente no
 * crea nada.
 */
async function resolveCanManage(clubId: string): Promise<{ canManage: boolean; isGlobalAdmin: boolean }> {
    try {
        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) return { canManage: false, isGlobalAdmin: false };

        const target = await getClubManagementTarget(supabase, clubId);
        const isGlobalAdmin = isGlobalAdminRole(context.role);
        return {
            canManage: isGlobalAdmin || Boolean(target && canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES)),
            isGlobalAdmin,
        };
    } catch {
        return { canManage: false, isGlobalAdmin: false };
    }
}

export const dynamic = 'force-dynamic';

/**
 * GET /api/clubs/:id/agenda
 *
 * La agenda del Panel del Día: los partidos de TODA la familia del club —el
 * base y sus derivados (M15, femenino, otro deporte)— en el mismo contrato que
 * ya devuelve /api/teams para un club solo, así el panel los pinta con el mismo
 * `renderMatchItem` sin traducir nada.
 *
 * Existe aparte de /api/teams por dos motivos:
 *   · /api/teams resuelve UN club y encima trae plantel, familia y transferencias.
 *     Pedirlo una vez por filial son N respuestas pesadas para usar solo los
 *     partidos.
 *   · El panel se abre a demanda (pestaña "Hoy"), y no tiene por qué encarecer
 *     la carga inicial de la ficha.
 *
 * El deporte se filtra ACÁ y no en el cliente: una familia cruza deportes a
 * propósito (`derivative_type = 'other_sport'`), y la agenda de un club de rugby
 * no tiene por qué traer los partidos de hockey de la misma institución.
 */

type ReadClient = Awaited<ReturnType<typeof getReadClient>>;

const MISSING_RELATION_CODES = new Set(['PGRST204', 'PGRST205', '42P01']);

function isMissingRelationError(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) return false;
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && MISSING_RELATION_CODES.has(code);
}

// Mismo grafo que resuelve la ficha pública: subir al base si este club es
// filial, y bajar a todos los derivados de ese base.
async function resolveFamilyClubIds(db: ReadClient, clubId: string): Promise<string[]> {
    const ids = new Set<string>([clubId]);

    try {
        const [{ data: incoming }, { data: ownDerived }] = await Promise.all([
            (db as any).from('club_derivatives').select('base_club_id').eq('derived_club_id', clubId).maybeSingle(),
            (db as any).from('club_derivatives').select('derived_club_id').eq('base_club_id', clubId),
        ]);

        const baseId: string = incoming?.base_club_id || clubId;
        ids.add(baseId);
        for (const row of ownDerived ?? []) {
            if (row?.derived_club_id) ids.add(row.derived_club_id);
        }

        if (baseId !== clubId) {
            const { data: siblings } = await (db as any)
                .from('club_derivatives')
                .select('derived_club_id')
                .eq('base_club_id', baseId);
            for (const row of siblings ?? []) {
                if (row?.derived_club_id) ids.add(row.derived_club_id);
            }
        }
    } catch {
        // Sin `club_derivatives` el club es su propia familia: la agenda sigue
        // sirviendo, con un solo integrante.
    }

    return Array.from(ids);
}

const FINISHED_STATUSES = new Set(['final', 'finished', 'ft', 'aet', 'pen', 'completed', 'played']);
const SCHEDULED_STATUSES = new Set(['scheduled', 'ns', 'not started', 'postponed', 'cancelled', 'suspended']);

// `is_visible` y `review_status` NO son opcionales acá: `isMatchVisibleToPublic`
// falla ABIERTO si no llegan (un campo `undefined` no es `false`), así que sin
// pedirlas la compuerta no filtra nada y un partido pendiente de revisión se
// publicaría solo. Si la base todavía no las tiene, se reintenta con la variante
// corta y se deja dicho en el log — degradar es aceptable, mentir no.
// `created_by_club_id` decide quién puede BORRAR el partido: el dirigente solo
// da de baja lo que cargó su club. Si la base no tiene la columna, el select
// falla con 42703 y cae en el de abajo: ahí nadie más que un admin global borra,
// que es la degradación correcta.
// Los nombres de los dos clubes vienen POR JOIN y no en una consulta aparte.
// Medido contra esta base: el join no cuesta nada (470 ms con y sin él), y la
// consulta separada costaba una ida y vuelta entera —~250 ms fijos— porque no
// se podía lanzar hasta saber qué rivales aparecían.
//
// El `logo_url` NO se toca acá: son base64 de cientos de KB y por fila serían
// varios MB. El escudo lo resuelve el proxy por id.
const MATCH_SELECT = `
    id, date_time, status, score, sport_id, sport, round_label,
    home_club_id, away_club_id, tournament_id, is_visible, review_status,
    created_by_club_id,
    homeClub:home_club_id(id, name, short_name),
    awayClub:away_club_id(id, name, short_name),
    tournament:tournaments!matches_tournament_id_fkey(name, sport_id)
`;

const MATCH_SELECT_SIN_REVISION = `
    id, date_time, status, score, sport_id, sport, round_label,
    home_club_id, away_club_id, tournament_id,
    homeClub:home_club_id(id, name, short_name),
    awayClub:away_club_id(id, name, short_name),
    tournament:tournaments!matches_tournament_id_fkey(name, sport_id)
`;

function isMissingColumnError(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) return false;
    return (error as { code?: unknown }).code === '42703';
}

const MAX_ROWS_PER_SIDE = 500;

/**
 * Medio año para cada lado del día que se está mirando.
 *
 * El panel es un CALENDARIO alrededor de una fecha: se abre en hoy y se navega
 * de a un día, una semana o un mes. Traer todo el historial para dibujar un
 * sábado era el grueso del tiempo de esta ruta — Tala tiene 347 partidos de
 * local desde 1995 y solo 20 en los últimos doce meses, o sea que el 94% de lo
 * que viajaba no se miraba nunca.
 *
 * Una temporada entera entra holgada en la ventana, así que navegar de a un día
 * casi nunca la cruza. Cuando la cruza, el cliente vuelve a pedir con otro
 * ancla y `window` le dice qué rango tiene cargado.
 */
const WINDOW_DAYS = 180;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function shiftIsoDay(day: string, days: number): string {
    const base = Date.parse(`${day}T00:00:00Z`);
    if (!Number.isFinite(base)) return day;
    return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

type MatchRow = {
    id: string;
    date_time: string | null;
    status: string | null;
    score: { home?: number | null; away?: number | null; home_score?: number | null; away_score?: number | null } | null;
    sport_id: string | null;
    sport: string | null;
    round_label: string | null;
    home_club_id: string | null;
    away_club_id: string | null;
    tournament_id: string | null;
    tournament?: { name?: string | null; sport_id?: string | null } | Array<{ name?: string | null; sport_id?: string | null }> | null;
    is_visible?: boolean | null;
    review_status?: string | null;
    created_by_club_id?: string | null;
    homeClub?: ClubRef | ClubRef[] | null;
    awayClub?: ClubRef | ClubRef[] | null;
};

type ClubRef = { id?: string | null; name?: string | null; short_name?: string | null };

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const clubId = String(id || '').trim();

    if (!clubId) {
        return NextResponse.json({ ok: false, error: 'club id requerido' }, { status: 400 });
    }

    // Reparto del tiempo, visible en DevTools > Network > Timing. Esta ruta se
    // hace de idas y vueltas a la base (~250 ms fijas cada una) y sin el reparto
    // cualquier optimización es a ciegas: la primera vez el sospechoso era el
    // tamaño de la consulta y era la CANTIDAD de tandas.
    const t0 = Date.now();
    const marks: string[] = [];
    const mark = (name: string, from: number) => { marks.push(`${name};dur=${Date.now() - from}`); };

    try {
        const db = await getReadClient();

        // La ficha del club, la familia y el permiso salen en la MISMA tanda: las
        // tres arrancan de `clubId` y ninguna necesita el resultado de la otra.
        // Encadenarlas eran dos idas y vueltas de ~250 ms cada una antes de poder
        // pedir el primer partido.
        // `resolveCanManage` NO va en esta tanda: la autenticación es una ida y
        // vuelta a Supabase Auth que no necesita nada de acá, y metida antes de
        // los partidos los retrasaba. Se lanza ya y se espera recién al final,
        // solapada con la consulta pesada.
        const authStarted = Date.now();
        const accessPromise = resolveCanManage(clubId).then((value) => {
            mark('auth', authStarted);
            return value;
        });

        const wave1 = Date.now();
        const [clubResult, familyClubIds] = await Promise.all([
            (db as any).from('clubs').select('id, name, sport, sport_id').eq('id', clubId).maybeSingle(),
            resolveFamilyClubIds(db, clubId),
        ]);
        mark('club-familia', wave1);

        const club = clubResult?.data;
        const clubError = clubResult?.error;

        if (clubError && !isMissingRelationError(clubError)) throw clubError;
        if (!club) {
            return NextResponse.json({ ok: false, error: 'Club no encontrado' }, { status: 404 });
        }

        // El deporte del club elegido manda. El query param solo permite pedir
        // otro explícitamente; sin él, se usa el del club.
        const requestedSport = request.nextUrl.searchParams.get('sport');
        const targetSport = canonicalizeSportId(requestedSport || club.sport_id || club.sport);


        // El ancla la manda el panel: es el día que está mirando. Sin ella, hoy.
        const anchorParam = request.nextUrl.searchParams.get('day') || '';
        const anchor = DAY_RE.test(anchorParam) ? anchorParam : new Date().toISOString().slice(0, 10);
        const windowFrom = shiftIsoDay(anchor, -WINDOW_DAYS);
        const windowTo = shiftIsoDay(anchor, WINDOW_DAYS);

        const fetchSide = async (column: 'home_club_id' | 'away_club_id', select: string) => (db as any)
            .from('matches')
            .select(select)
            .in(column, familyClubIds)
            .gte('date_time', `${windowFrom}T00:00:00Z`)
            .lte('date_time', `${windowTo}T23:59:59Z`)
            .order('date_time', { ascending: false })
            .limit(MAX_ROWS_PER_SIDE);

        // Los dos vecinos FUERA de la ventana, para que el estado vacío siga
        // pudiendo decir "la jornada con partidos más cercana". Son una fila cada
        // uno y viajan en la misma tanda: no cuestan nada y sin ellos un club
        // dormido desde 2019 se queda sin la pista de dónde mirar.
        const fetchNeighbour = async (direction: 'before' | 'after') => (db as any)
            .from('matches')
            .select('date_time')
            .in('home_club_id', familyClubIds)
            .order('date_time', { ascending: direction === 'after' })
            [direction === 'before' ? 'lt' : 'gt']('date_time', `${direction === 'before' ? windowFrom : windowTo}T00:00:00Z`)
            .limit(1);

        // Las categorías propias viajan JUNTO con los partidos, no antes: no
        // dependen de ellos y las dos consultas solo necesitan `familyClubIds`.
        // Encadenarlas costaba una ida y vuelta entera, y contra esta base cada
        // una son ~250 ms fijos de latencia — el panel se hace de eso, no de
        // consultas lentas.
        const FAMILY_SELECT = 'id, name, short_name, category_level, category_variant';
        const FAMILY_SELECT_SIN_ESCALAFON = 'id, name, short_name';

        const wave2 = Date.now();
        let [familyResult, homeResult, awayResult, access, beforeResult, afterResult] = await Promise.all([
            (db as any).from('clubs').select(FAMILY_SELECT).in('id', familyClubIds),
            fetchSide('home_club_id', MATCH_SELECT),
            fetchSide('away_club_id', MATCH_SELECT),
            accessPromise,
            fetchNeighbour('before'),
            fetchNeighbour('after'),
        ]);
        mark('partidos', wave2);

        const neighbourDay = (result: { data?: Array<{ date_time?: string | null }> | null }) => {
            const value = result?.data?.[0]?.date_time;
            return typeof value === 'string' && value ? value.slice(0, 10) : null;
        };

        const { canManage, isGlobalAdmin } = access;

        // Sin la migración del escalafón el panel NO se cae: se queda con el
        // rango inferido del nombre, que es lo que hace igual para toda ficha que
        // nadie tocó. Ver 20260824180000_club_categoria_escalafon.sql.
        if (isMissingColumnError(familyResult?.error)) {
            console.warn('[clubs/agenda] clubs sin columnas de escalafón; el orden va por el nombre', { clubId });
            familyResult = await (db as any).from('clubs').select(FAMILY_SELECT_SIN_ESCALAFON).in('id', familyClubIds);
        }

        type FamilyRow = {
            id: string;
            name?: string | null;
            short_name?: string | null;
            category_level?: string | null;
            category_variant?: string | null;
        };

        const familyRows = (familyResult?.data ?? []) as FamilyRow[];

        // El escalafón de cada ficha propia: por acá se ordena la jornada.
        const levelByClubId = new Map<string, ResolvedCategoryLevel>();
        for (const row of familyRows) {
            levelByClubId.set(row.id, resolveCategoryLevel({
                name: row.short_name || row.name || row.id,
                storedLevel: row.category_level,
                storedVariant: row.category_variant,
            }));
        }

        const familyClubs = familyRows
            .map((row: FamilyRow) => {
                const level = levelByClubId.get(row.id);
                return {
                    id: row.id,
                    name: row.name || row.short_name || row.id,
                    isBase: row.id === club.id,
                    levelKey: level?.key ?? 'primera',
                    levelLabel: level?.label ?? '',
                    levelVariant: level?.variant ?? '',
                    // `false` = el rango salió del nombre, no de una elección. La
                    // pantalla de categorías lo muestra distinto para que se vea
                    // qué falta confirmar.
                    levelExplicit: level?.explicit ?? false,
                };
            })
            // La familia se lista por escalafón, igual que la jornada: la Primera
            // primero y los juveniles al final. Antes era alfabético, que ponía
            // "M15" arriba de "Intermedia".
            .sort((left, right) => {
                if (left.isBase !== right.isBase) return left.isBase ? -1 : 1;
                const byLevel = compareCategoryLevel(
                    { rank: categoryLevelRank(left.levelKey), variant: left.levelVariant },
                    { rank: categoryLevelRank(right.levelKey), variant: right.levelVariant },
                );
                return byLevel !== 0 ? byLevel : left.name.localeCompare(right.name);
            });

        if (isMissingColumnError(homeResult.error) || isMissingColumnError(awayResult.error)) {
            console.warn('[clubs/agenda] matches sin columnas de revisión; la agenda va sin ese filtro', { clubId });
            [homeResult, awayResult] = await Promise.all([
                fetchSide('home_club_id', MATCH_SELECT_SIN_REVISION),
                fetchSide('away_club_id', MATCH_SELECT_SIN_REVISION),
            ]);
        }

        if (homeResult.error) throw homeResult.error;
        if (awayResult.error) throw awayResult.error;

        // Ida y vuelta del mismo partido: si la familia juega contra sí misma la
        // fila viene por los dos lados y es una sola.
        const rowsById = new Map<string, MatchRow>();
        for (const row of [...(homeResult.data ?? []), ...(awayResult.data ?? [])] as MatchRow[]) {
            if (row?.id) rowsById.set(row.id, row);
        }
        const rows = Array.from(rowsById.values());

        // El escudo del panel va SIN token de versión, a propósito. El token hace
        // que el proxy sirva la imagen como inmutable por una semana, y acá no
        // hace falta: la jornada es una vista viva y `max-age=300` la refresca
        // sola. Pedirlo obligaba además a una consulta extra para averiguar qué
        // clubes tienen escudo propio —una categoría hereda el de su club madre y
        // su `updated_at` no versiona nada— que era una ida y vuelta entera.
        const clubRef = (value: ClubRef | ClubRef[] | null | undefined): ClubRef | null => (
            Array.isArray(value) ? (value[0] ?? null) : (value ?? null)
        );

        const teamOf = (ref: ClubRef | null, fallbackId: string | null) => {
            const id = String(ref?.id || fallbackId || '');
            const name = ref?.name || ref?.short_name || id;
            return {
                name,
                small_image_path: id ? buildTeamLogoProxyUrl({ key: id, name }) || '' : '',
                team_id: id,
                logo_updated_at: '',
            };
        };

        const familyIdSet = new Set(familyClubIds);
        const now = Date.now();
        const results: unknown[] = [];
        const fixtures: unknown[] = [];

        for (const row of rows) {
            if (!isMatchVisibleToPublic(row as never)) continue;

            const tournament = Array.isArray(row.tournament) ? row.tournament[0] : row.tournament;

            // El deporte de un partido sale del torneo; un amistoso no tiene, así
            // que cae al del propio partido y después al del club. Sin esta caída
            // el amistoso queda sin etiqueta y el filtro lo tira.
            const rawSport = tournament?.sport_id || row.sport_id || row.sport || club.sport_id || club.sport;
            const matchSport = canonicalizeSportId(rawSport);
            if (targetSport && matchSport && matchSport !== targetSport) continue;

            const parsed = row.date_time ? new Date(row.date_time).getTime() : NaN;

            const homeId = String(row.home_club_id || '');
            const awayId = String(row.away_club_id || '');
            const ownId = familyIdSet.has(homeId) ? homeId : awayId;
            const ownLevel = levelByClubId.get(ownId);

            const normalized = {
                match_id: row.id,
                home_team: teamOf(clubRef(row.homeClub), row.home_club_id),
                away_team: teamOf(clubRef(row.awayClub), row.away_club_id),
                scores: {
                    home: row.score?.home ?? row.score?.home_score ?? null,
                    away: row.score?.away ?? row.score?.away_score ?? null,
                },
                match_status: row.status || 'NS',
                timestamp: Number.isFinite(parsed) ? parsed / 1000 : 0,
                tournament_id: row.tournament_id || null,
                tournament_name: tournament?.name || row.round_label || '',
                sport_id: matchSport,
                // Solo para DIBUJAR el botón. La baja la revalida
                // `DELETE /api/clubs/:id/panel-matches` por su cuenta.
                can_delete: isGlobalAdmin
                    || (canManage && familyIdSet.has(String(row.created_by_club_id || ''))),
                // El escalafón de la ficha PROPIA del partido: por acá se ordena
                // la jornada. Un partido de la familia contra sí misma se cuenta
                // por el local, que es una sola vez.
                level_key: ownLevel?.key ?? '',
                level_label: ownLevel?.label ?? '',
                level_variant: ownLevel?.variant ?? '',
                level_rank: ownLevel?.rank ?? Number.MAX_SAFE_INTEGER,
            };

            const status = (row.status || '').toLowerCase();
            // `parsed > 0` no sirve: el epoch de un partido anterior a 1970 es
            // negativo y lo mandaría a "próximos". La pregunta es si la fecha es
            // válida, no si es positiva.
            const isPast = Number.isFinite(parsed) && parsed < now;
            const isFinished = FINISHED_STATUSES.has(status) || (isPast && !SCHEDULED_STATUSES.has(status));

            if (isFinished) results.push(normalized);
            else fixtures.push(normalized);
        }

        mark('total', t0);

        return NextResponse.json({
            ok: true,
            clubId: club.id,
            sportId: targetSport,
            canManage,
            familyClubIds,
            familyClubs,
            results,
            fixtures,
            // Qué rango trae esta respuesta. El panel lo usa para saber cuándo
            // tiene que volver a pedir: navegar dentro de la ventana no cuesta
            // nada, salirse sí.
            window: { from: windowFrom, to: windowTo, anchor },
            nearestOutside: {
                before: neighbourDay(beforeResult),
                after: neighbourDay(afterResult),
            },
        }, { headers: { 'Server-Timing': marks.join(', ') } });
    } catch (error) {
        console.error('[clubs/agenda] fallo al armar la agenda de la familia:', { clubId, error });
        return NextResponse.json({ ok: false, error: 'No se pudo cargar la agenda del club' }, { status: 500 });
    }
}
