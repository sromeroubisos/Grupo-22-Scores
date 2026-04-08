import { redirect } from 'next/navigation';
import { buildLegacyTournamentManageHref } from '../legacyRedirect';

interface TournamentLegacyResultsPageProps {
    params: Promise<{ id: string }>;
}

export default async function TournamentLegacyResultsPage({ params }: TournamentLegacyResultsPageProps) {
    const { id } = await params;
    redirect(buildLegacyTournamentManageHref(id, 'resultados'));
}
