import { redirect } from 'next/navigation';
import { SquadManagementPage } from '@/components/admin/entities/club/SquadManagementPage';
import { getManagedClubSummaries } from '@/lib/club-admin/managedClubFamily';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';

interface ClubAdminSquadPageProps {
    params: Promise<{ id: string; squadId: string }>;
}

export default async function ClubAdminSquadPage({ params }: ClubAdminSquadPageProps) {
    const { id } = await params;
    const supabase = await createClient();

    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) {
        redirect('/login');
    }

    const managed = await getManagedClubSummaries(supabase as never, context.memberships);
    if (!managed.clubs.some((club) => club.id === id)) {
        redirect('/club-admin');
    }

    return <SquadManagementPage />;
}
