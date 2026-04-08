import { redirect } from 'next/navigation';
import { buildLegacyTournamentManageHref } from '../legacyRedirect';

interface TournamentLegacyFixturePageProps {
    params: Promise<{ id: string }>;
}

export default async function TournamentLegacyFixturePage({ params }: TournamentLegacyFixturePageProps) {
    const { id } = await params;
    redirect(buildLegacyTournamentManageHref(id, 'fixture'));
}
