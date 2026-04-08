import { redirect } from 'next/navigation';
import { buildLegacyTournamentManageHref } from '../legacyRedirect';

interface TournamentLegacyStructurePageProps {
    params: Promise<{ id: string }>;
}

export default async function TournamentLegacyStructurePage({ params }: TournamentLegacyStructurePageProps) {
    const { id } = await params;
    redirect(buildLegacyTournamentManageHref(id, 'fases'));
}
