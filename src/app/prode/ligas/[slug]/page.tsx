import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getPrivateLeaguePlayView } from '@/lib/server/prodePlay';
import { getPublicShareOriginFromHeaders } from '@/lib/auth/requestOrigin';
import ProdePlayScreen from '@/components/prode/ProdePlayScreen';

export default async function ProdePrivateLeaguePage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const supabase = await createClient();
    const {
        data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser?.id) {
        redirect(`/login?returnTo=${encodeURIComponent(`/prode/ligas/${slug}`)}`);
    }

    const requestHeaders = await headers();
    const view = await getPrivateLeaguePlayView(
        slug,
        authUser.id,
        getPublicShareOriginFromHeaders(requestHeaders),
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
