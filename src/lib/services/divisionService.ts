'use server';

import { createClient } from '@/lib/supabase/server';

export interface Division {
    id: string;
    club_id: string;
    name: string;
    season: string;
    status: 'active' | 'draft' | 'archived';
    sport: string;
    gender: string;
    category: string;
    players_count?: number;
    staff_count?: number;
}

/**
 * Servicio para gestionar divisiones (planteles) en Supabase.
 * Implementa fetch de conteos reales desde la tabla 'club_person_roles'.
 */
export async function fetchDivisions(clubId: string): Promise<Division[]> {
    const supabase = await createClient();

    try {
        // 1. Intentar fetch de la tabla profesional
        const { data: divisions, error } = await supabase
            .from('club_divisions')
            .select(`
                *,
                club_person_roles(role)
            `)
            .eq('club_id', clubId)
            .order('name');

        if (error) {
            if (error.code === 'PGRST204' || error.code === '42P01') {
                return fetchDivisionsFallback(clubId);
            }
            throw error;
        }

        // 2. Procesar conteos reales si existen roles asociados
        return (divisions as any[]).map(d => ({
            ...d,
            players_count: d.club_person_roles?.filter((r: any) => r.role === 'player').length || 0,
            staff_count: d.club_person_roles?.filter((r: any) => r.role !== 'player').length || 0
        })) as Division[];

    } catch (err) {
        console.error('Error fetching divisions, falling back to club categories:', err);
        return fetchDivisionsFallback(clubId);
    }
}

async function fetchDivisionsFallback(clubId: string): Promise<Division[]> {
    const supabase = await createClient();
    const { data: club } = await supabase
        .from('clubs')
        .select('categories, is_visible')
        .eq('id', clubId)
        .single();

    if (!club || !club.categories) return [];

    // En el fallback (legacy), intentamos contar personas que tengan division_id NULL 
    // pero pertenezcan al club, o mapear por nombre si fuera necesario.
    // Por simplicidad en fallback, devolvemos 0 a menos que consultemos club_person_roles
    const { data: roles } = await supabase
        .from('club_person_roles')
        .select('role')
        .eq('club_id', clubId);

    const baseStatus = club.is_visible ? 'active' : 'draft';

    return club.categories.map((cat: string, i: number) => ({
        id: `legacy-${i}`,
        club_id: clubId,
        name: cat,
        season: String(new Date().getFullYear()),
        status: baseStatus as any,
        sport: 'rugby',
        gender: 'Masculino',
        category: cat,
        // En legacy no hay división linkeada, así que el conteo real es difícil por división
        players_count: 0,
        staff_count: 0
    }));
}

export async function createDivision(clubId: string, name: string): Promise<{ success: boolean; data?: any; error?: string }> {
    const supabase = await createClient();

    try {
        const { data, error } = await supabase
            .from('club_divisions')
            .insert({
                club_id: clubId,
                name,
                season: String(new Date().getFullYear()),
                status: 'active'
            })
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST204' || error.code === '42P01') {
                return createDivisionFallback(clubId, name);
            }
            return { success: false, error: error.message };
        }

        return { success: true, data };
    } catch (err) {
        return createDivisionFallback(clubId, name);
    }
}

async function createDivisionFallback(clubId: string, name: string) {
    const supabase = await createClient();
    const { data: club } = await supabase.from('clubs').select('categories').eq('id', clubId).single();
    if (!club) return { success: false, error: 'Club not found' };

    const newCategories = [...(club.categories || []), name];
    const { error } = await supabase.from('clubs').update({ categories: newCategories }).eq('id', clubId);

    return { success: !error, error: error?.message };
}

export async function deleteDivision(clubId: string, divisionId: string, name: string): Promise<{ success: boolean; error?: string }> {
    const supabase = await createClient();

    if (divisionId.startsWith('legacy-')) {
        const { data: club } = await supabase.from('clubs').select('categories').eq('id', clubId).single();
        if (!club) return { success: false, error: 'Club not found' };
        const newCategories = (club.categories || []).filter((c: string) => c !== name);
        const { error } = await supabase.from('clubs').update({ categories: newCategories }).eq('id', clubId);
        return { success: !error, error: error?.message };
    }

    const { error } = await supabase.from('club_divisions').delete().eq('id', divisionId);
    return { success: !error, error: error?.message };
}

export async function saveSquadAndPlayers(
    clubId: string,
    squadName: string,
    playerIds: string[]
): Promise<{ success: boolean; data?: any; error?: string }> {
    const supabase = await createClient();

    try {
        // 1. Create division
        const { data: divData, error: divError } = await supabase
            .from('club_divisions')
            .insert({
                club_id: clubId,
                name: squadName,
                season: String(new Date().getFullYear()),
                status: 'active'
            })
            .select()
            .single();

        if (divError) {
            return { success: false, error: divError.message };
        }

        const newDivisionId = divData.id;

        // 2. Set division_id for all these players in club_person_roles
        if (playerIds.length > 0) {
            const { error: rolesError } = await supabase
                .from('club_person_roles')
                .update({ division_id: newDivisionId })
                .in('person_id', playerIds)
                .eq('club_id', clubId);

            if (rolesError) {
                console.error("Error linking players to squad:", rolesError);
            }
        }

        return { success: true, data: divData };
    } catch (err: any) {
        return { success: false, error: err.message };
    }
}
