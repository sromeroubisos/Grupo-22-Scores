import { redirect } from 'next/navigation';

interface SuperadminTournamentRedirectProps {
    params: Promise<{ id: string }>;
}

export default async function SuperadminTournamentRedirect({
    params,
}: SuperadminTournamentRedirectProps) {
    const { id } = await params;

    redirect(`/admin/entities/${encodeURIComponent(id)}/manage?type=tournament`);
}
