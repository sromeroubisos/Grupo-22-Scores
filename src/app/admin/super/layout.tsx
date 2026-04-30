import { redirect } from 'next/navigation';
import { requireGlobalAdminContext } from '@/lib/auth/permissions';
import { createClient } from '@/lib/supabase/server';
import SuperAdminClientLayout from './SuperAdminClientLayout';

export default async function GlobalAdminLayout({ children }: { children: React.ReactNode }) {
    const supabase = await createClient();

    try {
        await requireGlobalAdminContext(supabase);
    } catch {
        redirect('/');
    }

    return (
        <SuperAdminClientLayout>
            {children}
        </SuperAdminClientLayout>
    );
}
