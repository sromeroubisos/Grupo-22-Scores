import { redirect } from 'next/navigation';
import { buildLegacyTournamentManageHref } from '../legacyRedirect';

interface TournamentLegacyOperatorsPageProps {
    params: Promise<{ id: string }>;
}

export default async function TournamentLegacyOperatorsPage({ params }: TournamentLegacyOperatorsPageProps) {
    const { id } = await params;
    redirect(buildLegacyTournamentManageHref(id, 'operadores'));
}
