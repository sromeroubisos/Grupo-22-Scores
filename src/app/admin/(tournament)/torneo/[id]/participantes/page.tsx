import { redirect } from 'next/navigation';
import { buildLegacyTournamentManageHref } from '../legacyRedirect';

interface TournamentLegacyParticipantsPageProps {
    params: Promise<{ id: string }>;
}

export default async function TournamentLegacyParticipantsPage({ params }: TournamentLegacyParticipantsPageProps) {
    const { id } = await params;
    redirect(buildLegacyTournamentManageHref(id, 'participantes'));
}
