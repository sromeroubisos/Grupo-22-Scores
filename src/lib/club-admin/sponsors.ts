import { createAdminClient } from '@/lib/supabase/admin';

export interface ClubSponsorItem {
    id: string;
    name: string;
    tier: string | null;
    status: string | null;
    placement: string | null;
    logo_url: string | null;
    website: string | null;
    notes: string | null;
}

const MISSING_TABLE_CODES = new Set(['PGRST204', 'PGRST205', '42P01']);

function isMissingTableError(error: unknown) {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return false;
    }

    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' && MISSING_TABLE_CODES.has(code);
}

export async function getClubSponsors(clubId: string): Promise<ClubSponsorItem[]> {
    if (!clubId) {
        return [];
    }

    const admin = createAdminClient() as never;
    const { data, error } = await admin
        .from('club_sponsors')
        .select('id, name, tier, status, placement, logo_url, website, notes')
        .eq('club_id', clubId)
        .order('created_at', { ascending: false });

    if (error) {
        if (isMissingTableError(error)) {
            return [];
        }

        throw error;
    }

    return (data ?? []) as ClubSponsorItem[];
}
