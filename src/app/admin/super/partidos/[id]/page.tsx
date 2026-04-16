import { notFound, redirect } from 'next/navigation';
import MatchCenterClient from './MatchCenterClient';
import type { MatchRow } from './MatchCenterClient';
import { loadManagedMatchCenterMatch } from '@/lib/server/matchCenterAdmin';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function MatchCenterPage({ params }: PageProps) {
    const { id: matchId } = await params;
    let match: MatchRow | null = null;

    try {
        const result = await loadManagedMatchCenterMatch(matchId);
        match = result.match as unknown as MatchRow;
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            redirect(`/login?returnTo=${encodeURIComponent(`/admin/super/partidos/${matchId}`)}`);
        }
        notFound();
    }

    if (!match) {
        notFound();
    }

    return <MatchCenterClient initialMatch={match} matchId={matchId} />;
}
