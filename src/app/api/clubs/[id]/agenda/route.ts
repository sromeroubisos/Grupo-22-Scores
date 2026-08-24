import { NextRequest, NextResponse } from 'next/server';
import { getReadClient } from '@/lib/supabase/read';
import { createClient } from '@/lib/supabase/server';
import { canManageClubContext, getClubManagementTarget, requireUserAccessContext } from '@/lib/auth/permissions';
import { MANAGEMENT_MEMBERSHIP_ROLES } from '@/lib/auth/roles';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
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
async function resolveCanManage(clubId: string): Promise<boolean> {
    try {
        const supabase = await createClient();
        const context = await requireUserAccessContext(supabase).catch(() => null);
        if (!context) return false;

        const target = await getClubManagementTarget(supabase, clubId);
        return Boolean(target && canManageClubContext(context, target, MANAGEMENT_MEMBERSHIP_ROLES));
    } catch {
        return false;
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
const MATCH_SELECT = `
    id, date_time, status, score, sport_id, sport, round_label,
    home_club_id, away_club_id, tournament_id, is_visible, review_status,
    tournament:tournaments!matches_tournament_id_fkey(name, sport_id)
`;

const MATCH_SELECT_SIN_REVISION = `
    id, date_time, status, score, sport_id, sport, round_label,
    home_club_id, away_club_id, tournament_id,
    tournament:tournaments!matches_tournament_id_fkey(name, sport_id)
`;

function isMissingColumnError(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) return false;
    return (error as { code?: unknown }).code === '42703';
}

const MAX_ROWS_PER_SIDE = 500;

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
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const clubId = String(id || '').trim();

    if (!clubId) {
        return NextResponse.json({ ok: false, error: 'club id requerido' }, { status: 400 });
    }

    try {
        const db = await getReadClient();

        const { data: club, error: clubError } = await (db as any)
            .from('clubs')
            .select('id, name, sport, sport_id')
            .eq('id', clubId)
            .maybeSingle();

        if (clubError && !isMissingRelationError(clubError)) throw clubError;
        if (!club) {
            return NextResponse.json({ ok: false, error: 'Club no encontrado' }, { status: 404 });
        }

        // El deporte del club elegido manda. El query param solo permite pedir
        // otro explícitamente; sin él, se usa el del club.
        const requestedSport = request.nextUrl.searchParams.get('sport');
        const targetSport = canonicalizeSportId(requestedSport || club.sport_id || club.sport);

        const [familyClubIds, canManage] = await Promise.all([
            resolveFamilyClubIds(db, club.id),
            resolveCanManage(club.id),
        ]);

        // Las categorías propias, con nombre: son las opciones de "quién juega"
        // cuando el club carga un partido desde el panel.
        const { data: familyRows } = await (db as any)
            .from('clubs')
            .select('id, name, short_name')
            .in('id', familyClubIds);

        const familyClubs = ((familyRows ?? []) as Array<{ id: string; name?: string | null; short_name?: string | null }>)
            .map(row => ({
                id: row.id,
                name: row.name || row.short_name || row.id,
                isBase: row.id === club.id,
            }))
            .sort((left, right) => {
                if (left.isBase !== right.isBase) return left.isBase ? -1 : 1;
                return left.name.localeCompare(right.name);
            });

        const fetchSide = async (column: 'home_club_id' | 'away_club_id', select: string) => (db as any)
            .from('matches')
            .select(select)
            .in(column, familyClubIds)
            .order('date_time', { ascending: false })
            .limit(MAX_ROWS_PER_SIDE);

        let [homeResult, awayResult] = await Promise.all([
            fetchSide('home_club_id', MATCH_SELECT),
            fetchSide('away_club_id', MATCH_SELECT),
        ]);

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

        // Los escudos NO viajan crudos: un `logo_url` puede ser un base64 de
        // cientos de KB y multiplicado por los rivales de una familia entera mata
        // la respuesta. El proxy los resuelve por id — mismo criterio que
        // /api/teams y /api/clubs/[id]/history.
        const clubIdsInPlay = Array.from(new Set(
            rows.flatMap(row => [row.home_club_id, row.away_club_id])
                .filter((value): value is string => Boolean(value))
        ));

        const clubsById = new Map<string, { name: string; logo: string; updatedAt: string }>();
        if (clubIdsInPlay.length > 0) {
            const { data: clubRows } = await (db as any)
                .from('clubs')
                .select('id, name, updated_at')
                .in('id', clubIdsInPlay);

            for (const row of (clubRows ?? []) as Array<{ id: string; name?: string | null; updated_at?: string | null }>) {
                clubsById.set(row.id, {
                    name: row.name || '',
                    logo: buildTeamLogoProxyUrl({ key: row.id, name: row.name || 'Club', version: row.updated_at ?? null }),
                    updatedAt: row.updated_at || '',
                });
            }
        }

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

            const home = row.home_club_id ? clubsById.get(row.home_club_id) : null;
            const away = row.away_club_id ? clubsById.get(row.away_club_id) : null;
            const parsed = row.date_time ? new Date(row.date_time).getTime() : NaN;

            const normalized = {
                match_id: row.id,
                home_team: {
                    name: home?.name || row.home_club_id || '',
                    small_image_path: home?.logo || '',
                    team_id: row.home_club_id || '',
                    logo_updated_at: home?.updatedAt || '',
                },
                away_team: {
                    name: away?.name || row.away_club_id || '',
                    small_image_path: away?.logo || '',
                    team_id: row.away_club_id || '',
                    logo_updated_at: away?.updatedAt || '',
                },
                scores: {
                    home: row.score?.home ?? row.score?.home_score ?? null,
                    away: row.score?.away ?? row.score?.away_score ?? null,
                },
                match_status: row.status || 'NS',
                timestamp: Number.isFinite(parsed) ? parsed / 1000 : 0,
                tournament_id: row.tournament_id || null,
                tournament_name: tournament?.name || row.round_label || '',
                sport_id: matchSport,
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

        return NextResponse.json({
            ok: true,
            clubId: club.id,
            sportId: targetSport,
            canManage,
            familyClubIds,
            familyClubs,
            results,
            fixtures,
        });
    } catch (error) {
        console.error('[clubs/agenda] fallo al armar la agenda de la familia:', { clubId, error });
        return NextResponse.json({ ok: false, error: 'No se pudo cargar la agenda del club' }, { status: 500 });
    }
}
