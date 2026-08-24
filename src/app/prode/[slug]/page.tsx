import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPublicCompetitionPlayView } from '@/lib/server/prodePlay';
import ProdePlayScreen from '@/components/prode/ProdePlayScreen';

export default async function ProdeCompetitionPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const supabase = await createClient();
    const {
        data: { user: authUser },
    } = await supabase.auth.getUser();

    const view = await getPublicCompetitionPlayView(slug, authUser?.id ?? null);

    if (!view) {
        notFound();
    }

    return (
        <ProdePlayScreen
            view={view}
            backHref="/prode"
            backLabel="← Volver al hub"
        />
    );
}
