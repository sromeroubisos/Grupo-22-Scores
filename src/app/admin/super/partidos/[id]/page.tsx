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
        // 404 solo para lo que ES un 404 (partido inexistente o fuera del
        // scope del usuario). Cualquier otro fallo (lectura de DB, bug) se
        // relanza para que el error boundary lo muestre como error real en
        // vez de disfrazarlo de partido inexistente.
        if (error instanceof Error && (error.message === 'Forbidden' || error.message === 'Match not found')) {
            notFound();
        }
        throw error;
    }

    if (!match) {
        notFound();
    }

    return <MatchCenterClient initialMatch={match} matchId={matchId} />;
}
