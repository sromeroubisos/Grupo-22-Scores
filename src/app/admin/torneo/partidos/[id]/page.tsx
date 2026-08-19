import { notFound, redirect } from 'next/navigation';
import MatchCenterClient from '@/app/admin/super/partidos/[id]/MatchCenterClient';
import type { MatchRow } from '@/app/admin/super/partidos/[id]/MatchCenterClient';
import { loadManagedMatchCenterMatch } from '@/lib/server/matchCenterAdmin';

interface PageProps {
    params: Promise<{ id: string }>;
}

/**
 * Gestor-facing match center. Renders the exact same MatchCenterClient the
 * super admin uses at /admin/super/partidos/[id], but reachable from the
 * tournament-admin panel: the /admin/torneo layout already guards for
 * gestor_torneos, and loadManagedMatchCenterMatch (→ ensureMatchManagementAccess)
 * enforces per-match tournament scope, so a gestor can only open matches that
 * belong to their own tournaments.
 */
export default async function GestorMatchCenterPage({ params }: PageProps) {
    const { id: matchId } = await params;
    let match: MatchRow | null = null;

    try {
        const result = await loadManagedMatchCenterMatch(matchId);
        match = result.match as unknown as MatchRow;
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            redirect(
                `/login?returnTo=${encodeURIComponent(`/admin/torneo/partidos/${matchId}`)}`,
            );
        }
        // 404 solo para lo que ES un 404; un fallo de lectura se relanza al
        // error boundary en vez de disfrazarse de partido inexistente.
        if (error instanceof Error && (error.message === 'Forbidden' || error.message === 'Match not found')) {
            notFound();
        }
        throw error;
    }

    if (!match) {
        notFound();
    }

    return (
        <MatchCenterClient
            initialMatch={match}
            matchId={matchId}
            backHref="/admin/torneo/partidos"
        />
    );
}
