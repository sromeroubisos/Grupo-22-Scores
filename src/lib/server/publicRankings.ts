/**
 * Lo que ve el visitante en /rankings, venga de donde venga.
 *
 * Hay dos clases de ranking y no comparten motor:
 *
 *  - El de CLUBES lo calcula esta casa a partir de los partidos cargados
 *    (`clubRankings.ts`), y se mueve cuando corre el cron semanal.
 *  - El de SELECCIONES lo publica World Rugby y nosotros solo lo mostramos. No
 *    se recalcula, no se le aplican partidos, no tiene ajustes manuales.
 *
 * Meter el segundo dentro de `club_rankings` habria significado inventarle una
 * fila en `clubs` a 114 uniones y dejar que el reconstructor de rankings le
 * pisara los puntos con nuestra formula. Por eso viaja como ranking VIRTUAL:
 * mismo contrato de salida, otra fuente. La pantalla no distingue mas que por
 * `entity`, que es lo unico que necesita para decir "seleccion" en vez de
 * "club".
 *
 * Los tres consumidores (la pagina y las dos rutas de API) montaban el mismo
 * mapeo copiado; ahora vive una sola vez, aca.
 */
import { normalizeRankingPositionLabels } from '@/lib/rankings/rankingTable';
import { readWeeklyBaselineMark } from '@/lib/rankings/rankingWeek';
import { getClubRankingDetail, listClubRankings } from '@/lib/server/clubRankings';
import { getWorldRugbySnapshot } from '@/lib/server/worldRugbyRankings';
import {
    getOdesurDisciplineMedalTable,
    getOdesurMedalTable,
    getOdesurMedalTablesByDiscipline,
    odesurFlagUrl,
    type OdesurMedalTable,
} from '@/lib/services/odesur2026';
import {
    ODESUR_DISCIPLINES,
    odesurDisciplineName,
    odesurDisciplinesForSport,
    type OdesurDisciplineCode,
} from '@/lib/services/odesur2026Parser';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import {
    WORLD_RUGBY_CATEGORIES,
    WORLD_RUGBY_FIRST_RANKING_DATE,
    type WorldRugbyCategory,
    type WorldRugbySnapshot,
} from '@/lib/integrations/worldrugby/rankings';

/**
 * Que se esta rankeando. La pantalla lo usa para los rotulos y, en el caso de
 * `delegacion` (el medallero de los Juegos), para cambiar las columnas: un
 * medallero no tiene puntos ni variacion, tiene tres metales.
 */
export type RankingEntity = 'club' | 'seleccion' | 'delegacion';

export type PublicRankingSummary = {
    id: string;
    name: string;
    sport: string | null;
    season: string;
    results_season: number;
    scope: string | null;
    description: string | null;
    entity: RankingEntity;
    /**
     * Solo en los rankings importados: que semana esta mostrando y desde cuando
     * hay historico. Con estos dos la pantalla dibuja el selector de fecha; sin
     * ellos (los rankings de clubes) no hay nada que elegir.
     */
    snapshot_date: string | null;
    history_from: string | null;
    /**
     * Solo en los rankings de clubes: la semana (martes, ISO corto) contra la que
     * se miden las flechas y la variacion de la tabla. Null hasta la primera
     * corrida semanal, y siempre en los de selecciones, que traen su propio
     * "anterior" de World Rugby.
     */
    movement_baseline_week: string | null;
    stale_from_match_id: string | null;
    stale_reason: string | null;
    initial_imported_at: string | null;
    backfill_completed_at: string | null;
    last_incremental_match_id: string | null;
    created_at: string | null;
    updated_at: string | null;
    metadata: { positionLabels: ReturnType<typeof normalizeRankingPositionLabels> };
};

export type PublicRankingEntry = {
    id: string;
    club_id: string | null;
    source_name: string;
    source_region: string | null;
    current_position: number | null;
    source_previous_position: number | null;
    current_rating: number | string | null;
    previous_rating: number | string | null;
    initial_rating: number | string | null;
    clubs: {
        name: string | null;
        short_name: string | null;
        logo_url: string | null;
    } | null;
    /** Solo en el medallero de los Juegos: los tres metales y el total. */
    medals?: MedalCount | null;
};

export type MedalCount = { gold: number; silver: number; bronze: number; total: number };

/** Un deporte del desglose del medallero general. */
export type PublicMedalBreakdown = {
    discipline: string;
    name: string;
    entries: PublicRankingEntry[];
};

export type PublicRankingDetail = {
    ranking: PublicRankingSummary;
    entries: PublicRankingEntry[];
    /** Solo en el medallero general de los Juegos: el medallero de cada deporte. */
    breakdown?: PublicMedalBreakdown[];
};

const WORLD_RUGBY_SPORT = 'rugby';
const WORLD_RUGBY_ID_PREFIX = 'world-rugby-';

const WORLD_RUGBY_META: Record<WorldRugbyCategory, { name: string; description: string }> = {
    mru: {
        name: 'World Rugby: uniones masculinas',
        description:
            'El ranking oficial de selecciones mayores masculinas que publica World Rugby. Se mueve todos los lunes, con los partidos del fin de semana ya computados',
    },
    wru: {
        name: 'World Rugby: uniones femeninas',
        description:
            'El ranking oficial de selecciones mayores femeninas que publica World Rugby. Se mueve todos los lunes, con los partidos del fin de semana ya computados',
    },
};

export function isWorldRugbyRankingId(id: string): boolean {
    return WORLD_RUGBY_CATEGORIES.some((category) => id === `${WORLD_RUGBY_ID_PREFIX}${category}`);
}

function categoryFromRankingId(id: string): WorldRugbyCategory | null {
    return WORLD_RUGBY_CATEGORIES.find((category) => id === `${WORLD_RUGBY_ID_PREFIX}${category}`) ?? null;
}

function snapshotToSummary(snapshot: WorldRugbySnapshot): PublicRankingSummary {
    const season = snapshot.effectiveDate.slice(0, 4);

    return {
        id: `${WORLD_RUGBY_ID_PREFIX}${snapshot.category}`,
        name: WORLD_RUGBY_META[snapshot.category].name,
        sport: WORLD_RUGBY_SPORT,
        season,
        results_season: Number(season),
        scope: 'Internacional',
        description: `${WORLD_RUGBY_META[snapshot.category].description}. Foto del ${snapshot.effectiveDate}.`,
        entity: 'seleccion',
        snapshot_date: snapshot.effectiveDate,
        history_from: WORLD_RUGBY_FIRST_RANKING_DATE,
        movement_baseline_week: null,
        // Un ranking importado no espera recalculo ni backfill: esos campos
        // describen nuestro motor, y este ranking no pasa por el.
        stale_from_match_id: null,
        stale_reason: null,
        initial_imported_at: snapshot.fetchedAt,
        backfill_completed_at: null,
        last_incremental_match_id: null,
        created_at: snapshot.fetchedAt,
        updated_at: snapshot.fetchedAt,
        metadata: { positionLabels: normalizeRankingPositionLabels(null) },
    };
}

function snapshotToEntries(snapshot: WorldRugbySnapshot): PublicRankingEntry[] {
    return snapshot.entries.map((entry) => ({
        id: `${snapshot.category}-${entry.teamId}`,
        // No hay club: una union no es una fila de `clubs`. Va null a proposito,
        // y por eso la bandera viaja resuelta en `logo_url` y no por el proxy.
        club_id: null,
        source_name: entry.nameEs,
        source_region: entry.region,
        current_position: entry.position,
        source_previous_position: entry.previousPosition,
        current_rating: entry.points,
        previous_rating: entry.previousPoints,
        initial_rating: entry.previousPoints ?? entry.points,
        clubs: {
            name: entry.nameEs,
            short_name: entry.code,
            logo_url: entry.flagUrl,
        },
    }));
}

/**
 * Las fotos de World Rugby para el selector. Si la API esta caida Y la tabla
 * vacia, devuelve lista vacia y lo grita en el log: que se caiga world.rugby no
 * puede tumbar el ranking de clubes, que es dato propio y no depende de nadie.
 */
async function listWorldRugbySummaries(): Promise<PublicRankingSummary[]> {
    const summaries: PublicRankingSummary[] = [];

    for (const category of WORLD_RUGBY_CATEGORIES) {
        try {
            const { snapshot } = await getWorldRugbySnapshot(category);
            summaries.push(snapshotToSummary(snapshot));
        } catch (error) {
            console.error(`[rankings] no se pudo resolver el ranking de World Rugby (${category}):`, error);
        }
    }

    return summaries;
}

function clubRowToSummary(ranking: Awaited<ReturnType<typeof listClubRankings>>[number]): PublicRankingSummary {
    return {
        id: ranking.id,
        name: ranking.name,
        sport: ranking.sport,
        season: ranking.season,
        results_season: ranking.results_season,
        scope: ranking.scope,
        description: ranking.description,
        entity: 'club',
        // El ranking de clubes no tiene fotos semanales: lo que hay es el estado
        // actual, y mirar "la tabla de hace un mes" pediria guardar historico.
        snapshot_date: null,
        history_from: null,
        // Lo que si tiene es la referencia de la semana: contra que martes se
        // miden las flechas. Es lo que la pantalla rotula debajo de la tabla.
        movement_baseline_week: readWeeklyBaselineMark(ranking.metadata)?.weekKey ?? null,
        stale_from_match_id: ranking.stale_from_match_id,
        stale_reason: ranking.stale_reason,
        initial_imported_at: ranking.initial_imported_at,
        backfill_completed_at: ranking.backfill_completed_at,
        last_incremental_match_id: ranking.last_incremental_match_id,
        created_at: ranking.created_at,
        updated_at: ranking.updated_at,
        metadata: { positionLabels: normalizeRankingPositionLabels(ranking.metadata?.positionLabels) },
    };
}

// --------------------------------------------------------------------------
// Medallero de los Juegos Suramericanos Santa Fe 2026
// --------------------------------------------------------------------------
//
// Otro ranking VIRTUAL, como el de World Rugby: lo publica la organizacion de
// los Juegos (Bornan) y aca solo se muestra. Rankea delegaciones, no clubes,
// y no tiene puntos ni semana anterior: tiene oros, platas y bronces, en el
// orden del medallero oficial.
//
// Entra en los siete deportes de G22 que tienen disciplina en los Juegos, con
// dos tablas cada uno: el medallero general (con el desglose de los 60
// deportes adentro) y el de ese deporte. Listarlos no cuesta un request: el
// resumen es fijo y la tabla se pide recien al abrirla.

const ODESUR_RANKING_ID = 'odesur-2026-medallero';
const ODESUR_RANKING_PREFIX = `${ODESUR_RANKING_ID}-`;
const ODESUR_SEASON = '2026';

function isOdesurRankingId(id: string): boolean {
    return id === ODESUR_RANKING_ID || id.startsWith(ODESUR_RANKING_PREFIX);
}

/** `odesur-2026-medallero-hoc` -> `HOC`; el general no tiene disciplina. */
function odesurDisciplineFromRankingId(id: string): OdesurDisciplineCode | null {
    if (!id.startsWith(ODESUR_RANKING_PREFIX)) return null;
    const code = id.slice(ODESUR_RANKING_PREFIX.length).toUpperCase() as OdesurDisciplineCode;
    return ODESUR_DISCIPLINES[code] ? code : null;
}

function odesurSummary(discipline: OdesurDisciplineCode | null, updatedAt: string | null): PublicRankingSummary {
    const disciplineName = discipline ? odesurDisciplineName(discipline).toLowerCase() : null;

    return {
        id: discipline ? `${ODESUR_RANKING_PREFIX}${discipline.toLowerCase()}` : ODESUR_RANKING_ID,
        name: discipline ? `Suramericanos 2026: medallero de ${disciplineName}` : 'Suramericanos 2026: medallero',
        sport: discipline ? ODESUR_DISCIPLINES[discipline].sportId : null,
        season: ODESUR_SEASON,
        results_season: Number(ODESUR_SEASON),
        scope: 'Juegos Suramericanos Santa Fe 2026',
        description: discipline
            ? `Las medallas de ${disciplineName} en los Juegos Suramericanos Santa Fe 2026`
            : 'El medallero de los Juegos Suramericanos Santa Fe 2026, con el de cada deporte debajo',
        entity: 'delegacion',
        // Sin fotos semanales ni semana de referencia: el medallero es el de hoy.
        snapshot_date: null,
        history_from: null,
        movement_baseline_week: null,
        stale_from_match_id: null,
        stale_reason: null,
        initial_imported_at: updatedAt,
        backfill_completed_at: null,
        last_incremental_match_id: null,
        created_at: updatedAt,
        updated_at: updatedAt,
        metadata: { positionLabels: normalizeRankingPositionLabels(null) },
    };
}

function odesurEntries(table: OdesurMedalTable): PublicRankingEntry[] {
    return table.rows.map((row) => ({
        id: `${table.discipline}-${row.code}`,
        // Una delegacion no es una fila de `clubs`: va null a proposito, y la
        // bandera viaja resuelta en `logo_url`, como en World Rugby.
        club_id: null,
        source_name: row.name,
        source_region: null,
        current_position: row.position,
        source_previous_position: null,
        current_rating: row.total,
        previous_rating: null,
        initial_rating: row.total,
        clubs: {
            name: row.name,
            short_name: row.code,
            logo_url: odesurFlagUrl(row.code, row.name) || null,
        },
        medals: { gold: row.gold, silver: row.silver, bronze: row.bronze, total: row.total },
    }));
}

/** Los medalleros que van en el catalogo de un deporte: el general y el suyo. */
function listOdesurSummaries(sportId: string): PublicRankingSummary[] {
    const disciplines = odesurDisciplinesForSport(sportId);
    if (disciplines.length === 0) return [];
    return [
        { ...odesurSummary(null, null), sport: sportId },
        ...disciplines.map((discipline) => odesurSummary(discipline.code, null)),
    ];
}

async function getOdesurRankingDetail(rankingId: string): Promise<PublicRankingDetail> {
    const discipline = odesurDisciplineFromRankingId(rankingId);

    if (discipline) {
        const table = await getOdesurDisciplineMedalTable(discipline);
        return { ranking: odesurSummary(discipline, table.fetchedAt), entries: odesurEntries(table) };
    }

    // El desglose va por su cuenta: si un deporte no contesta, el medallero
    // general aparece igual y ese deporte falta del desglose.
    const [table, breakdown] = await Promise.all([
        getOdesurMedalTable(),
        getOdesurMedalTablesByDiscipline().catch((error) => {
            console.error('[rankings] no se pudo armar el desglose del medallero de los Juegos:', error);
            return [] as OdesurMedalTable[];
        }),
    ]);

    return {
        ranking: odesurSummary(null, table.fetchedAt),
        entries: odesurEntries(table),
        breakdown: breakdown.map((item) => ({
            discipline: item.discipline,
            name: item.disciplineName,
            entries: odesurEntries(item),
        })),
    };
}

/**
 * El catalogo publico. Con `sportId` filtra por deporte igual que antes; las
 * selecciones solo entran cuando el deporte es rugby, y los medalleros de los
 * Juegos en los siete deportes que tienen disciplina ahi. Los virtuales van
 * DESPUES de los rankings de clubes para no cambiarle el ranking por omision a
 * nadie.
 */
export async function listPublicRankings(sportId?: string | null): Promise<PublicRankingSummary[]> {
    const normalizedSport = String(sportId || '').trim().toLowerCase();
    const clubRankings = (await listClubRankings())
        .filter((ranking) => (
            !normalizedSport || String(ranking.sport || '').trim().toLowerCase() === normalizedSport
        ))
        .map(clubRowToSummary);

    const odesur = normalizedSport ? listOdesurSummaries(normalizedSport) : [];

    if (normalizedSport && normalizedSport !== WORLD_RUGBY_SPORT) {
        return [...clubRankings, ...odesur];
    }

    return [...clubRankings, ...(await listWorldRugbySummaries()), ...odesur];
}

function clubEntryToPublic(
    entry: Awaited<ReturnType<typeof getClubRankingDetail>>['entries'][number],
): PublicRankingEntry {
    const club = Array.isArray(entry.clubs) ? entry.clubs[0] : entry.clubs;

    return {
        id: entry.id,
        club_id: entry.club_id,
        source_name: entry.source_name,
        source_region: entry.source_region,
        current_position: entry.current_position,
        source_previous_position: entry.source_previous_position,
        current_rating: entry.current_rating,
        previous_rating: entry.previous_rating ?? null,
        initial_rating: entry.initial_rating,
        clubs: club
            ? {
                name: club.name,
                short_name: club.short_name ?? null,
                // El escudo viaja como URL del proxy, no como data-URI: es lo que
                // el navegador termina pidiendo igual (ver resolveTeamLogo) y lo
                // que el export necesita para dibujar el escudo real en el poster.
                logo_url: buildTeamLogoProxyUrl({
                    key: entry.club_id,
                    name: club.name ?? entry.source_name,
                }),
            }
            : null,
    };
}

export type PublicRankingDetailOptions = {
    /**
     * Semana a mostrar, en ISO corto. Solo la miran los rankings importados; un
     * ranking de clubes la ignora porque no guarda fotos.
     */
    date?: string | null;
};

/** El detalle publico de un ranking, sea de clubes o de selecciones. */
export async function getPublicRankingDetail(
    rankingId: string,
    options: PublicRankingDetailOptions = {},
): Promise<PublicRankingDetail> {
    if (isOdesurRankingId(rankingId)) {
        return getOdesurRankingDetail(rankingId);
    }

    const category = categoryFromRankingId(rankingId);

    if (category) {
        const { snapshot } = await getWorldRugbySnapshot(category, options.date);
        return {
            ranking: snapshotToSummary(snapshot),
            entries: snapshotToEntries(snapshot),
        };
    }

    // Sin logos: la vista publica no usa el data-URI guardado (TeamLogo lo
    // descarta y pide el proxy igual), asi que traerlo solo suma ~25 MB de
    // trafico contra Supabase por request.
    const detail = await getClubRankingDetail(rankingId, { includeClubLogos: false, includeActivity: false });

    return {
        ranking: clubRowToSummary(detail.ranking),
        entries: detail.entries.map(clubEntryToPublic),
    };
}
