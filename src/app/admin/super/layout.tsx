import { redirect } from 'next/navigation';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { resolveAdminGuardRedirect } from '@/lib/auth/adminGuardRedirect';
import { createClient } from '@/lib/supabase/server';
import SuperAdminClientLayout from './SuperAdminClientLayout';

export default async function GlobalAdminLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient();

    try {
        await requireGlobalAdminContext(supabase);
    } catch (error) {
        redirect(await resolveAdminGuardRedirect(error));
    }

    return (
        <SuperAdminClientLayout>
            {children}
        </SuperAdminClientLayout>
    );
}
