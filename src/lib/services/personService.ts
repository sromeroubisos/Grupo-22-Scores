'use server';

import { createClient } from '@/lib/supabase/server';

export interface PersonWithRole {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    avatar_url?: string;
    photo_url?: string; // Alias for UI consistency
    birth_date?: string;
    role: string;
    status: string;
    division_id?: string;
    division_name?: string;
    position?: string;
    id_number?: string;
}

/**
 * Obtiene todas las personas vinculadas a un club, filtrando opcionalmente por división.
 */
export async function fetchPeopleByClub(clubId: string): Promise<PersonWithRole[]> {
    const supabase = await createClient();

    const { data, error } = await supabase.from('club_person_roles').select(`
        id, role, status, division_id, position,
        people ( id, first_name, last_name, full_name, avatar_url, birth_date, id_number ),
        club_divisions ( name )
    `).eq('club_id', clubId);

    if (error) {
        console.error('Error fetching people:', error);
        return [];
    }

    return (data as any[]).map(r => ({
        id: r.people.id,
        first_name: r.people.first_name,
        last_name: r.people.last_name,
        full_name: r.people.full_name,
        avatar_url: r.people.avatar_url,
        photo_url: r.people.avatar_url,
        birth_date: r.people.birth_date,
        id_number: r.people.id_number,
        role: r.role,
        status: r.status,
        division_id: r.division_id,
        division_name: r.club_divisions?.name,
        position: r.position
    }));
}

/**
 * Obtiene las personas de una división específica.
 */
export async function fetchPeopleByDivision(clubId: string, divisionId: string): Promise<PersonWithRole[]> {
    const supabase = await createClient();

    const { data, error } = await supabase.from('club_person_roles').select(`
        id, role, status, division_id, position,
        people ( id, first_name, last_name, full_name, avatar_url, birth_date, id_number ),
        club_divisions ( name )
    `).match({ club_id: clubId, division_id: divisionId });

    if (error) {
        console.error('Error fetching division people:', error);
        return [];
    }

    return (data as any[]).map(r => ({
        id: r.people.id,
        first_name: r.people.first_name,
        last_name: r.people.last_name,
        full_name: r.people.full_name,
        avatar_url: r.people.avatar_url,
        photo_url: r.people.avatar_url,
        birth_date: r.people.birth_date,
        id_number: r.people.id_number,
        role: r.role,
        status: r.status,
        division_id: r.division_id,
        division_name: r.club_divisions?.name,
        position: r.position
    }));
}

/**
 * Registra una nueva persona y le asigna un rol en el club.
 */
export async function addPersonToClub(clubId: string, personData: {
    first_name: string,
    last_name: string,
    role: string,
    division_id?: string,
    status?: string,
    position?: string,
    birth_date?: string,
    id_number?: string,
    photo_url?: string,
    weight?: number,
    height?: number
}) {
    const supabase = await createClient();

    // 1. Crear persona en la tabla people
    const { data: person, error: perError } = await supabase
        .from('people')
        .insert({
            first_name: personData.first_name,
            last_name: personData.last_name,
            full_name: `${personData.first_name} ${personData.last_name}`,
            birth_date: personData.birth_date || null,
            id_number: personData.id_number || null,
            photo_url: personData.photo_url || null,
            weight: personData.weight || null,
            height: personData.height || null,
            status: 'active'
        })
        .select()
        .single();

    if (perError) return { success: false, error: perError.message };

    // 2. Asignar el rol en el club y (opcionalmente) división
    const { error: roleError } = await supabase
        .from('club_person_roles')
        .insert({
            club_id: clubId,
            person_id: person.id,
            role: personData.role,
            division_id: personData.division_id || null,
            status: personData.status || 'active',
            position: personData.position || null
        });

    return { success: !roleError, error: roleError?.message };
}

/**
 * Elimina el vínculo de una persona con el club (o división).
 */
export async function deletePersonFromClub(clubId: string, personId: string, divisionId?: string) {
    const supabase = await createClient();

    let query = supabase.from('club_person_roles').delete().match({ person_id: personId, club_id: clubId });

    if (divisionId) {
        query = query.eq('division_id', divisionId);
    }

    const { error } = await query;
    return { success: !error, error: error?.message };
}

// Deprecated alias for backward compatibility if needed, but we prefer deletePersonFromClub
export async function removePersonFromClub(clubId: string, personId: string) {
    return deletePersonFromClub(clubId, personId);
}
