import { redirect } from 'next/navigation';
import { buildLegacyTournamentManageHref } from './legacyRedirect';

interface TournamentLegacyPageProps {
    params: Promise<{ id: string }>;
}

export default async function TournamentLegacyInfoPage({ params }: TournamentLegacyPageProps) {
    const { id } = await params;
    redirect(buildLegacyTournamentManageHref(id, 'info'));
}
