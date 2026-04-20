import { redirect } from 'next/navigation';
import { ClubAccessHub } from '@/components/admin/entities/club/ClubAccessHub';
import { ClubManageShell } from '@/components/admin/entities/club/ClubManageShell';
import type { Database } from '@/lib/database.types';
import { requireUserAccessContext } from '@/lib/auth/permissions';
import { getManagedClubSummaries } from '@/lib/club-admin/managedClubFamily';
import { createClient } from '@/lib/supabase/server';

type ClubRow = Database['public']['Tables']['clubs']['Row'];

interface ClubAdminPageProps {
    searchParams: Promise<{ club?: string }>;
}

export default async function ClubAdminPage({ searchParams }: ClubAdminPageProps) {
    const { club: requestedClubId } = await searchParams;
    const supabase = await createClient();

    const context = await requireUserAccessContext(supabase).catch(() => null);
    if (!context) {
        redirect('/login');
    }

    const managed = await getManagedClubSummaries(supabase as never, context.memberships);
    const availableClubIds = new Set(managed.clubs.map((club) => club.id));
    const targetClubId = requestedClubId && availableClubIds.has(requestedClubId)
        ? requestedClubId
        : null;

    if (!managed.clubs.length) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
                <div className="max-w-xl w-full rounded-[28px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8 shadow-[var(--shadow-card)]">
                    <p className="text-xs uppercase tracking-[0.24em] text-[#00ff88] font-black">Club Admin</p>
                    <h1 className="mt-4 text-3xl font-black tracking-tight">No hay clubes asignados</h1>
                    <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                        Esta cuenta todavia no tiene memberships de club o familia de club con permisos operativos.
                    </p>
                </div>
            </div>
        );
    }

    if (!targetClubId) {
        return <ClubAccessHub clubs={managed.clubs} />;
    }

    const [{ data: clubData }, { data: unionsData }] = await Promise.all([
        supabase
            .from('clubs')
            .select('*')
            .eq('id', targetClubId)
            .maybeSingle(),
        supabase
            .from('unions')
            .select('id, name')
            .order('name'),
    ]);

    if (!clubData) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
                <div className="max-w-xl w-full rounded-[28px] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8 shadow-[var(--shadow-card)]">
                    <p className="text-xs uppercase tracking-[0.24em] text-[#00ff88] font-black">Club Admin</p>
                    <h1 className="mt-4 text-3xl font-black tracking-tight">No pudimos abrir el club</h1>
                    <p className="mt-4 text-sm text-[var(--color-text-secondary)]">
                        El club seleccionado ya no existe o no esta disponible para esta cuenta.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <ClubManageShell
            id={targetClubId}
            data={clubData as ClubRow}
            unions={unionsData ?? []}
            managedClubs={managed.clubs}
            navigationMode="club-admin"
        />
    );
}
