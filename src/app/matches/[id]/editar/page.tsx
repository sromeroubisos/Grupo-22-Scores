import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import MatchCenterClient from '@/app/admin/super/partidos/[id]/MatchCenterClient';
import type { MatchRow } from '@/app/admin/super/partidos/[id]/MatchCenterClient';
import { loadManagedMatchCenterMatch } from '@/lib/server/matchCenterAdmin';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
    title: 'Editar partido | G22 Scores',
    robots: { index: false, follow: false },
};

interface PageProps {
    params: Promise<{ id: string }>;
}

/**
 * El editor de partido para quien no tiene una consola de `/admin`: el admin de
 * club que cargó el partido desde su panel, o el que tiene membresía en el
 * torneo sin el rol de gestor. Es el mismo MatchCenterClient que usan
 * `/admin/super` y `/admin/torneo`; la guarda es la del partido
 * (`ensureMatchManagementAccess`), igual que en cada API que el editor llama.
 */
export default async function MatchEditorPage({ params }: PageProps) {
    const { id: matchId } = await params;
    let match: MatchRow | null = null;

    try {
        const result = await loadManagedMatchCenterMatch(matchId);
        match = result.match as unknown as MatchRow;
    } catch (error: unknown) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            redirect(`/login?returnTo=${encodeURIComponent(`/matches/${matchId}/editar`)}`);
        }
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
            backHref={`/matches/${encodeURIComponent(matchId)}`}
        />
    );
}
