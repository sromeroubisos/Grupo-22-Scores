import { Suspense } from 'react';
import SuperCreateTournament from '@/app/admin/super/torneos/crear/page';

export const dynamic = 'force-dynamic';

export default function TournamentAdminCreateTournamentPage() {
    return (
        <Suspense fallback={null}>
            <SuperCreateTournament navigationMode="tournament-admin" />
        </Suspense>
    );
}
