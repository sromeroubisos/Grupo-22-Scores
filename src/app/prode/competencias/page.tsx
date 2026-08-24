import type { Metadata } from 'next';
import ProdeCompetitionBrowser from '@/components/prode/ProdeCompetitionBrowser';
import { createClient } from '@/lib/supabase/server';
import { listPublicProdeCompetitions } from '@/lib/server/prodeCompetitions';

export const metadata: Metadata = {
    title: 'Competencias | Prode | G22 Scores',
    description: 'Todas las ligas publicas del prode de G22 Scores.',
};

export default async function ProdeCompetitionsPage() {
    // La sesión solo se usa para marcar en qué competencias ya juega el usuario.
    const supabase = await createClient();
    const {
        data: { user: authUser },
    } = await supabase.auth.getUser();

    const { data: competitions } = await listPublicProdeCompetitions(authUser?.id ?? null);

    return <ProdeCompetitionBrowser competitions={competitions} />;
}
