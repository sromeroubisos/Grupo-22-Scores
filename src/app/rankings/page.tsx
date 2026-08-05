import { cache } from 'react';
import type { Metadata } from 'next';
import { SPORTS } from '@/lib/data/sports';
import type { Sport } from '@/lib/types';
import { buildTeamLogoProxyUrl } from '@/lib/utils/logoUrl';
import { normalizeRankingPositionLabels } from '@/lib/rankings/rankingTable';
import { getClubRankingDetail, listClubRankings } from '@/lib/server/clubRankings';
import RankingsClient from './RankingsClient';

type SearchParams = Promise<{ sport?: string; ranking?: string }>;

function getSportLabel(sportId: string) {
    // El id llega de la URL: no es un SportId validado, asi que se indexa como
    // string y se cae al rotulo generico si no existe.
    const sport = (SPORTS as Record<string, Sport>)[sportId];
    return sport?.nameEs || sport?.name || 'clubes';
}

/**
 * Resuelve lista y detalle igual que las rutas de API, pero en proceso: esta
 * pagina se pinta en el servidor y no tiene sentido que se pegue un HTTP a si
 * misma. Si algo falla devolvemos vacio y el cliente reintenta por fetch — la
 * vista publica nunca deberia romperse por un problema de datos.
 *
 * Envuelto en `cache()` porque `generateMetadata` y el componente de pagina lo
 * piden con los mismos argumentos en el mismo request: sin esto, cada visita
 * pagaba la consulta dos veces.
 */
const loadInitialData = cache(async (sportId: string, rankingId: string) => {
    try {
        const all = await listClubRankings();
        const rankings = all
            .filter((ranking) => String(ranking.sport || '').trim().toLowerCase() === sportId)
            .map((ranking) => ({
                ...ranking,
                metadata: {
                    positionLabels: normalizeRankingPositionLabels(ranking.metadata?.positionLabels),
                },
            }));

        const selectedId = rankings.some((ranking) => ranking.id === rankingId)
            ? rankingId
            : rankings[0]?.id;

        if (!selectedId) return { rankings, detail: null };

        const detail = await getClubRankingDetail(selectedId, { includeClubLogos: false, includeActivity: false });

        return {
            rankings,
            detail: {
                ranking: {
                    ...detail.ranking,
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
                                logo_url: buildTeamLogoProxyUrl({
                                    key: entry.club_id,
                                    name: club.name ?? entry.source_name,
                                }),
                            }
                            : null,
                    };
                }),
            },
        };
    } catch {
        return { rankings: [], detail: null };
    }
});

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
    const { sport = 'rugby', ranking = '' } = await searchParams;
    const sportId = sport.trim().toLowerCase();
    const sportLabel = getSportLabel(sportId);

    const { rankings, detail } = await loadInitialData(sportId, ranking.trim());
    const active = detail?.ranking ?? rankings[0];

    if (!active) {
        return {
            title: `Rankings de ${sportLabel} | G22 Scores`,
            description: `Ranking de clubes de ${sportLabel} en G22 Scores.`,
        };
    }

    const leaders = (detail?.entries ?? []).slice(0, 3).map((entry) => (
        entry.clubs?.short_name || entry.clubs?.name || entry.source_name
    ));
    const total = detail?.entries.length ?? 0;
    // Las descripciones cargadas a mano no siempre terminan en punto y despues se
    // pegan con la frase siguiente ("...Salida de 22 151 clubes").
    const headline = active.description?.trim() || `${active.name}: ranking de clubes de ${sportLabel}`;
    const description = [
        /[.!?]$/.test(headline) ? headline : `${headline}.`,
        total ? `${total} clubes, base ${active.season}.` : '',
        leaders.length ? `Lideran ${leaders.join(', ')}.` : '',
    ].filter(Boolean).join(' ');

    return {
        title: `${active.name} | G22 Scores`,
        description,
        openGraph: {
            title: `${active.name} | G22 Scores`,
            description,
            type: 'website',
        },
    };
}

export default async function RankingsPage({ searchParams }: { searchParams: SearchParams }) {
    const { sport = 'rugby', ranking = '' } = await searchParams;
    const sportId = sport.trim().toLowerCase();
    const { rankings, detail } = await loadInitialData(sportId, ranking.trim());

    return (
        <RankingsClient
            initialSportId={sportId}
            initialRankings={rankings}
            initialDetail={detail}
        />
    );
}
