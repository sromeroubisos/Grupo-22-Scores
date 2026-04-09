import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPrivateLeaguePlayView } from '@/lib/server/prodePlay';
import ProdePlayScreen from '@/components/prode/ProdePlayScreen';

export default async function ProdePrivateLeaguePage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const supabase = await createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user?.id) {
        redirect(`/login?returnTo=${encodeURIComponent(`/prode/ligas/${slug}`)}`);
    }

    const view = await getPrivateLeaguePlayView(
        slug,
        session.user.id,
        process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
    );

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
