import { notFound } from 'next/navigation';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import MatchCenterClient from './MatchCenterClient';
import type { MatchRow } from './MatchCenterClient';
import { fetchMatchCenterMatch } from '@/lib/services/matchCenterService';

// Use a plain Supabase client (no cookie management) for the public SELECT.
// This avoids the server-side session refresh that can corrupt browser cookies
// and cause the user to get logged out on page refresh.
function getReadOnlyClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function MatchCenterPage({ params }: PageProps) {
    const { id: matchId } = await params;
    const supabase = getReadOnlyClient();

    const { data, error } = await fetchMatchCenterMatch(supabase, matchId);

    if (error || !data) {
        notFound();
    }

    const match = data as unknown as MatchRow;

    return <MatchCenterClient initialMatch={match} matchId={matchId} />;
}
