import type { ComponentProps } from 'react';
import NewClubForm from '@/app/admin/super/clubes/crear/NewClubForm';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type UnionOption = NonNullable<ComponentProps<typeof NewClubForm>['unions']>[number];

async function loadUnions(): Promise<UnionOption[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('unions')
        .select('id, name, country')
        .order('name');

    if (error) {
        console.warn('[torneo/clubes/crear] No se pudieron cargar las uniones:', error.message);
        return [];
    }

    return (data ?? []).map((union) => ({
        id: union.id,
        name: union.name,
        country: union.country ?? null,
    }));
}

export default async function TournamentAdminCreateClubPage() {
    const unions = await loadUnions();
    return <NewClubForm unions={unions} navigationMode="tournament-admin" />;
}
