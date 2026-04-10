import { notFound, redirect } from 'next/navigation';
import MatchCenterClient from '@/app/admin/super/partidos/[id]/MatchCenterClient';
import type { MatchRow } from '@/app/admin/super/partidos/[id]/MatchCenterClient';
import { loadManagedMatchCenterMatch } from '@/lib/server/matchCenterAdmin';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function MatchManagementPage({ params }: PageProps) {
    const { id: matchId } = await params;
    let match: MatchRow | null = null;

    try {
        const result = await loadManagedMatchCenterMatch(matchId);
        match = result.match as unknown as MatchRow;
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            redirect(`/login?returnTo=${encodeURIComponent(`/admin/matches/${matchId}/manage`)}`);
        }
        notFound();
    }

    if (!match) {
        notFound();
    }

    return <MatchCenterClient initialMatch={match} matchId={matchId} />;
}
