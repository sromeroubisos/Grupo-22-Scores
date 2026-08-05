import { NextResponse } from 'next/server';
import { normalizeRankingPositionLabels } from '@/lib/rankings/rankingTable';
import { getClubRankingDetail } from '@/lib/server/clubRankings';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';

// El ranking lo recalcula el cron de rankings, no el request: no hay motivo para
// que cada visita pague la consulta entera. El navegador revalida al minuto y el
// CDN sirve una copia tibia mientras refresca por detras.
const PUBLIC_RANKING_CACHE_CONTROL = 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600';

function jsonError(message: string, status = 500, details?: unknown) {
    return NextResponse.json({ error: message, details: details ?? null }, { status });
}

function getStatusCode(error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (message.includes('schema cache')) return 503;
    if (message.includes('No se encontro')) return 404;
    return 500;
}

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        // Sin logos: la vista publica no usa el data-URI guardado (TeamLogo lo
        // descarta y pide el proxy igual), asi que traerlo solo suma ~25 MB de
        // trafico contra Supabase por request.
        const detail = await getClubRankingDetail(id, { includeClubLogos: false, includeActivity: false });
        return NextResponse.json({
            data: {
                ranking: {
                    id: detail.ranking.id,
                    name: detail.ranking.name,
                    sport: detail.ranking.sport,
                    season: detail.ranking.season,
                    results_season: detail.ranking.results_season,
                    scope: detail.ranking.scope,
                    description: detail.ranking.description,
                    stale_from_match_id: detail.ranking.stale_from_match_id,
                    stale_reason: detail.ranking.stale_reason,
                    initial_imported_at: detail.ranking.initial_imported_at,
                    backfill_completed_at: detail.ranking.backfill_completed_at,
                    last_incremental_match_id: detail.ranking.last_incremental_match_id,
                    created_at: detail.ranking.created_at,
                    updated_at: detail.ranking.updated_at,
                    metadata: {
                        positionLabels: normalizeRankingPositionLabels(detail.ranking.metadata?.positionLabels),
                    },
                },
                entries: detail.entries.map((entry) => {
                    const club = Array.isArray(entry.clubs) ? entry.clubs[0] : entry.clubs;
                    return {
                        id: entry.id,
                        club_id: entry.club_id,
                        source_name: entry.source_name,
                        source_region: entry.source_region,
                        current_position: entry.current_position,
                        source_previous_position: entry.source_previous_position,
                        current_rating: entry.current_rating,
                        previous_rating: entry.previous_rating,
                        initial_rating: entry.initial_rating,
                        clubs: club
                            ? {
                                name: club.name,
                                short_name: club.short_name,
                                // El escudo viaja como URL del proxy, no como data-URI:
                                // es lo que el navegador termina pidiendo igual (ver
                                // resolveTeamLogo) y lo que el export necesita para
                                // dibujar el escudo real en el poster.
                                logo_url: buildTeamLogoProxyUrl({
                                    key: entry.club_id,
                                    name: club.name ?? entry.source_name,
                                }),
                            }
                            : null,
                    };
                }),
            },
        }, {
            headers: { 'Cache-Control': PUBLIC_RANKING_CACHE_CONTROL },
        });
    } catch (error) {
        return jsonError(
            error instanceof Error ? error.message : 'No se pudo cargar el ranking publico.',
            getStatusCode(error),
        );
    }
}
