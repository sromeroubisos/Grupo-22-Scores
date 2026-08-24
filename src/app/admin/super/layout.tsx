import { redirect } from 'next/navigation';
import { requireRequestGlobalAdminContext } from '@/lib/auth/permissions';
import { resolveAdminGuardRedirect } from '@/lib/auth/adminGuardRedirect';
import SuperAdminClientLayout from './SuperAdminClientLayout';

export default async function GlobalAdminLayout({ children }: { children: React.ReactNode }) {
    try {
        // Memoizado: /admin/layout.tsx ya resolvio el contexto en este mismo render.
        await requireRequestGlobalAdminContext();
    } catch (error) {
        redirect(await resolveAdminGuardRedirect(error));
    }

    return (
        <SuperAdminClientLayout>
            {children}
        </SuperAdminClientLayout>
    );
}
