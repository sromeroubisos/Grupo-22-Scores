import type { Metadata } from 'next';

import { clipDescription, finalScore, loadMatchSeo, openGraphFor, type MatchSeo } from '@/lib/seo/entityMeta';
import { missingMetadata } from '@/lib/seo/sectionMeta';
import { absoluteUrl } from '@/lib/seo/siteUrl';
import { serializeJsonLd } from '@/lib/utils/jsonLd';

import MatchDetailClientPage from './MatchDetailClientPage';

function matchTitle(match: MatchSeo): string {
    const score = finalScore(match);
    return score
        ? `${match.home} ${match.homeScore} - ${match.awayScore} ${match.away}`
        : `${match.home} vs ${match.away}`;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const id = decodeURIComponent((await params).id).trim();
    const lookup = await loadMatchSeo(id);

    if (lookup.missing) return missingMetadata('Partido');
    const match = lookup.value;
    if (!match) return { title: 'Partido | G22 Scores' };
    const title = matchTitle(match);
    const score = finalScore(match);
    const context = [match.tournament, match.dateLabel].filter(Boolean).join(', ');
    const description = clipDescription(
        score
            ? `Resultado de ${match.home} vs ${match.away}${context ? ` (${context})` : ''}: formaciones, tries y estadísticas del partido.`
            : `${match.home} vs ${match.away}${context ? ` (${context})` : ''}: horario, formaciones y resultado en vivo.`,
    );
    const canonical = `/matches/${match.id}`;

    // Google corta el título cerca de los 60 caracteres: el torneo entra solo
    // si cabe; si no, ya está en la descripción.
    const withTournament = match.tournament ? `${title} | ${match.tournament}` : title;
    return {
        title: `${withTournament.length <= 60 ? withTournament : title} | G22 Scores`,
        description,
        alternates: { canonical },
        ...(match.hidden ? { robots: { index: false, follow: false } } : {}),
        openGraph: openGraphFor({ title, description, url: canonical }),
    };
}

export default async function PartidoDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const match = (await loadMatchSeo(decodeURIComponent(id).trim())).value;

    // Un SportsEvent para que el buscador sepa quiénes, cuándo y dónde. Solo
    // con datos de la base: los partidos de proveedor siguen sin él.
    const jsonLd = match && !match.hidden
        ? {
            '@context': 'https://schema.org',
            '@type': 'SportsEvent',
            name: `${match.home} vs ${match.away}`,
            url: absoluteUrl(`/matches/${match.id}`),
            ...(match.isoDate ? { startDate: match.isoDate } : {}),
            eventStatus: match.status === 'postponed'
                ? 'https://schema.org/EventPostponed'
                : 'https://schema.org/EventScheduled',
            homeTeam: { '@type': 'SportsTeam', name: match.home },
            awayTeam: { '@type': 'SportsTeam', name: match.away },
            ...(match.venue ? { location: { '@type': 'Place', name: match.venue } } : {}),
            ...(match.tournament ? { superEvent: { '@type': 'SportsEvent', name: match.tournament } } : {}),
        }
        : null;

    return (
        <>
            {jsonLd && (
                <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} />
            )}
            <MatchDetailClientPage id={id} />
        </>
    );
}
