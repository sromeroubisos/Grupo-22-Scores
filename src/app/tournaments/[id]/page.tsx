import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTournamentById } from '@/lib/data/tournaments';
import { clipDescription, loadTournamentSeo, openGraphFor } from '@/lib/seo/entityMeta';
import { missingMetadata } from '@/lib/seo/sectionMeta';
import { fetchTournamentData } from '@/lib/server/fetchTournamentData';
import { APP_TIMEZONE, getTodayKey } from '@/lib/timezone';
import { isBlockedTournamentId } from '@/lib/utils/blockedTournaments';
import TournamentDetailPage from './TournamentDetailClient';

const EXTERNAL_PREFIXES = [
    'fs-', 'ras-league-', 'espn-league-', 'espn-soccer-league-', 'espn-racing-league-',
    'fih-wc-', 'fisu-', 'odesur-', 'wr-', 'dakar-',
];

function isExternalTournamentId(id: string): boolean {
    const lower = id.toLowerCase();
    return EXTERNAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
    const id = decodeURIComponent((await params).id).trim();

    // Sin `notFound()` acá: la página ya lo llama en el render (ver
    // `missingMetadata`). Lo que no existe sale con noindex.
    if (isBlockedTournamentId(id)) return missingMetadata('Torneo');

    const catalog = getTournamentById(id);
    const external = isExternalTournamentId(id);
    const lookup = external ? null : await loadTournamentSeo(id);

    if (lookup?.missing && !catalog) return missingMetadata('Torneo');
    const db = lookup?.value ?? null;

    const name = db ? db.name : catalog?.name;
    if (!name) return { title: 'Torneo | G22 Scores' };

    const sport = db ? db.sport : catalog?.sportId;
    const country = db ? db.country : null;
    const where = [sport, country].filter(Boolean).join(', ');
    const description = clipDescription(
        `${name}: fixture, resultados, tabla de posiciones y estadísticas${where ? ` (${where})` : ''}, actualizados en vivo en G22 Scores.`,
    );
    // Un torneo se ve por UUID y por slug: el canonical es uno solo, el slug
    // si lo tiene (es el que se lee y se comparte).
    const canonical = db ? `/tournaments/${encodeURIComponent(db.slug || db.id)}` : undefined;
    const logo = db ? db.logoUrl : null;

    return {
        title: `${name} | G22 Scores`,
        description,
        alternates: canonical ? { canonical } : undefined,
        openGraph: openGraphFor({ title: name, description, url: canonical, image: logo }),
    };
}

export default async function TournamentPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ seasonId?: string; season_id?: string; season?: string }>;
}) {
    const resolvedParams = await params;
    const resolvedSearchParams = await searchParams;
    const { id } = resolvedParams;
    const requestedSeasonId =
        resolvedSearchParams.seasonId ||
        resolvedSearchParams.season_id ||
        resolvedSearchParams.season ||
        null;

    if (isBlockedTournamentId(id)) {
        notFound();
    }

    const renderTodayKey = getTodayKey(APP_TIMEZONE);
    const renderYear = Number(renderTodayKey.slice(0, 4));

    // Only prefetch for DB tournaments (UUID or slug, not external provider ids)
    const isDbTournament = !isExternalTournamentId(id);
    let initialData = undefined;

    if (isDbTournament) {
        try {
            const data = await fetchTournamentData(id, { seasonId: requestedSeasonId });
            if (data?.error === 'Tournament not found') {
                notFound();
            }

            // Use any successful snapshot, even if partial, and let the client refresh it.
            if (data?.ok) {
                initialData = data;
            }
        } catch {
            // Fallback: client component will fetch on its own
        }
    }

    return (
        <TournamentDetailPage
            id={id}
            initialData={initialData}
            renderTodayKey={renderTodayKey}
            renderYear={renderYear}
        />
    );
}
