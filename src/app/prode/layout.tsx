import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
    title: 'Prode | G22 Scores',
    description: 'Espacio jugable de pronosticos deportivos conectado a torneos API y torneos locales.',
};

export default async function ProdeLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
        redirect('/');
    }

    const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

    if (profile?.role !== 'super_admin') {
        redirect('/');
    }

    return children;
}
