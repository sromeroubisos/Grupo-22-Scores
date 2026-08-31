import { cache } from 'react';
import type { Metadata } from 'next';
import { SPORTS } from '@/lib/data/sports';
import type { Sport } from '@/lib/types';
import { getPublicRankingDetail, listPublicRankings } from '@/lib/server/publicRankings';
import RankingsClient from './RankingsClient';

type SearchParams = Promise<{ sport?: string; ranking?: string; fecha?: string }>;

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
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const loadInitialData = cache(async (sportId: string, rankingId: string, fecha: string) => {
    try {
        const rankings = await listPublicRankings(sportId);

        const selectedId = rankings.some((ranking) => ranking.id === rankingId)
            ? rankingId
            : rankings[0]?.id;

        if (!selectedId) return { rankings, detail: null };

        const date = ISO_DATE_REGEX.test(fecha) ? fecha : null;

        return { rankings, detail: await getPublicRankingDetail(selectedId, { date }) };
    } catch {
        return { rankings: [], detail: null };
    }
});

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
    const { sport = 'rugby', ranking = '', fecha = '' } = await searchParams;
    const sportId = sport.trim().toLowerCase();
    const sportLabel = getSportLabel(sportId);

    const { rankings, detail } = await loadInitialData(sportId, ranking.trim(), fecha.trim());
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
    // Un ranking de selecciones no cuenta clubes: la descripcion tiene que decir
    // lo que hay en la tabla o miente en el resultado de busqueda.
    const unidad = active.entity === 'seleccion' ? 'uniones' : 'clubes';
    // Las descripciones cargadas a mano no siempre terminan en punto y despues se
    // pegan con la frase siguiente ("...Salida de 22 151 clubes").
    const headline = active.description?.trim() || `${active.name}: ranking de ${unidad} de ${sportLabel}`;
    const description = [
        /[.!?]$/.test(headline) ? headline : `${headline}.`,
        total ? `${total} ${unidad}, base ${active.season}.` : '',
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
    const { sport = 'rugby', ranking = '', fecha = '' } = await searchParams;
    const sportId = sport.trim().toLowerCase();
    const { rankings, detail } = await loadInitialData(sportId, ranking.trim(), fecha.trim());

    return (
        <RankingsClient
            initialSportId={sportId}
            initialRankings={rankings}
            initialDetail={detail}
        />
    );
}
