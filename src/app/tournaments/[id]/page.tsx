import { notFound } from 'next/navigation';
import { fetchTournamentData } from '@/lib/server/fetchTournamentData';
import { APP_TIMEZONE, getTodayKey } from '@/lib/timezone';
import { isBlockedTournamentId } from '@/lib/utils/blockedTournaments';
import TournamentDetailPage from './TournamentDetailClient';

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
    const isExternalTournament =
        id.toLowerCase().startsWith('fs-') ||
        id.toLowerCase().startsWith('ras-league-') ||
        id.toLowerCase().startsWith('espn-league-') ||
        id.toLowerCase().startsWith('espn-soccer-league-') ||
        id.toLowerCase().startsWith('espn-racing-league-');
    const isDbTournament = !isExternalTournament;
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
