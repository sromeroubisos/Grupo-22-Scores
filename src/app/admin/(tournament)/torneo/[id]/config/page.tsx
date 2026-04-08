import { redirect } from 'next/navigation';
import { buildLegacyTournamentManageHref } from '../legacyRedirect';

interface TournamentLegacyConfigPageProps {
    params: Promise<{ id: string }>;
}

export default async function TournamentLegacyConfigPage({ params }: TournamentLegacyConfigPageProps) {
    const { id } = await params;
    redirect(buildLegacyTournamentManageHref(id, 'config'));
}
