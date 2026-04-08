'use server';

import { createClient } from '@/lib/supabase/server';

export interface PersonWithRole {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    avatar_url?: string;
    photo_url?: string;
    birth_date?: string;
    role: string;
    status: string;
    division_id?: string;
    division_name?: string;
    position?: string;
    id_number?: string;
    weight?: number;
    height?: number;
}

type TeamLookupRow = {
    id: string;
    legacy_division_id: string | null;
    name: string | null;
};

type TeamMembershipRow = {
    person_id: string;
    team_id: string | null;
    role: string;
    status: string | null;
    position: string | null;
};

type LegacyRoleRow = {
    person_id: string;
    role: string;
    status: string | null;
    division_id: string | null;
    position: string | null;
};

type PersonRow = {
    id: string;
    first_name: string;
    last_name: string;
    full_name: string | null;
    avatar_url: string | null;
    photo_url: string | null;
    birth_date: string | null;
    id_number: string | null;
    position: string | null;
    weight: number | null;
    height: number | null;
};

type DivisionLookupRow = {
    id: string;
    name: string | null;
};

const MISSING_TABLE_CODES = new Set(['PGRST204', 'PGRST205', '42P01']);
const FAMILY_DIVISION_ID_PREFIX = 'family-division';

function isMissingTableError(error: any) {
    return Boolean(error && typeof error.code === 'string' && MISSING_TABLE_CODES.has(error.code));
}

function parseFamilyDivisionId(divisionId?: string) {
    if (!divisionId?.startsWith(`${FAMILY_DIVISION_ID_PREFIX}|`)) return null;
    const [, rosterOwnerClubId, encodedName] = divisionId.split('|');
    if (!rosterOwnerClubId) return null;

    return {
        rosterOwnerClubId,
        groupName: encodedName ? decodeURIComponent(encodedName) : null,
    };
}

async function resolveSharedRosterOwnerClubId(clubId: string, supabaseClient?: any): Promise<string> {
    const supabase = supabaseClient ?? await createClient();
    const db = supabase as any;

    const { data: familyDivisionLink, error: familyDivisionError } = await db
        .from('club_family_divisions')
        .select('roster_owner_club_id')
        .eq('division_club_id', clubId)
        .limit(1)
        .maybeSingle();

    if (familyDivisionError && !isMissingTableError(familyDivisionError)) {
        console.error('Error resolving family division roster owner:', familyDivisionError);
    }

    const rosterOwnerClubId = typeof familyDivisionLink?.roster_owner_club_id === 'string'
        ? familyDivisionLink.roster_owner_club_id
        : null;

    if (rosterOwnerClubId && rosterOwnerClubId !== clubId) {
        return rosterOwnerClubId;
    }

    return clubId;
}

function mapPersonRecord(person: any, membership: any, divisionName?: string, divisionId?: string): PersonWithRole {
    return {
        id: person.id,
        first_name: person.first_name,
        last_name: person.last_name,
        full_name: person.full_name || `${person.first_name} ${person.last_name}`.trim(),
        avatar_url: person.avatar_url || person.photo_url || undefined,
        photo_url: person.photo_url || person.avatar_url || undefined,
        birth_date: person.birth_date || undefined,
        id_number: person.id_number || undefined,
        role: membership.role,
        status: membership.status || 'active',
        division_id: divisionId,
        division_name: divisionName,
        position: membership.position || person.position || undefined,
        weight: person.weight || undefined,
        height: person.height || undefined,
    };
}

async function fetchPersonRowsByIds(supabase: any, personIds: string[]): Promise<PersonRow[]> {
    if (personIds.length === 0) return [];

    const richSelect = 'id, first_name, last_name, full_name, avatar_url, photo_url, birth_date, id_number, position, weight, height';
    const safeSelect = 'id, first_name, last_name, full_name, avatar_url, birth_date, id_number';

    const { data, error } = await supabase
        .from('people')
        .select(richSelect)
        .in('id', personIds);

    if (!error) {
        return (data ?? []) as PersonRow[];
    }

    const { data: safeData, error: safeError } = await supabase
        .from('people')
        .select(safeSelect)
        .in('id', personIds);

    if (safeError) {
        console.error('Error fetching people:', safeError);
        return [];
    }

    return ((safeData ?? []) as any[]).map((person) => ({
        ...person,
        photo_url: null,
        position: null,
        weight: null,
        height: null,
    })) as PersonRow[];
}

async function insertPersonRecord(supabase: any, personData: {
    first_name: string,
    last_name: string,
    birth_date?: string,
    id_number?: string,
    photo_url?: string,
    weight?: number,
    height?: number,
    position?: string,
    role?: string,
    status?: string,
    club_id?: string,
}) {
    const fullName = `${personData.first_name} ${personData.last_name}`.trim();
    const richPayload = {
        club_id: personData.club_id,
        first_name: personData.first_name,
        last_name: personData.last_name,
        full_name: fullName,
        name: fullName,
        birth_date: personData.birth_date || null,
        id_number: personData.id_number || null,
        photo_url: personData.photo_url || null,
        avatar_url: personData.photo_url || null,
        weight: personData.weight || null,
        height: personData.height || null,
        position: personData.position || null,
        role: personData.role || null,
        status: personData.status || 'active',
    };

    const { data, error } = await supabase
        .from('people')
        .insert(richPayload)
        .select()
        .single();

    if (!error) return { data, error: null };

    const safePayload = {
        first_name: personData.first_name,
        last_name: personData.last_name,
        birth_date: personData.birth_date || null,
        id_number: personData.id_number || null,
        avatar_url: personData.photo_url || null,
    };

    return supabase
        .from('people')
        .insert(safePayload)
        .select()
        .single();
}

async function updatePersonRecord(supabase: any, personId: string, personData: {
    first_name: string,
    last_name: string,
    birth_date?: string,
    id_number?: string,
    photo_url?: string,
    weight?: number,
    height?: number,
    position?: string,
    role?: string,
    status?: string,
}) {
    const fullName = `${personData.first_name} ${personData.last_name}`.trim();
    const richPayload = {
        first_name: personData.first_name,
        last_name: personData.last_name,
        full_name: fullName,
        name: fullName,
        birth_date: personData.birth_date || null,
        id_number: personData.id_number || null,
        photo_url: personData.photo_url || null,
        avatar_url: personData.photo_url || null,
        weight: personData.weight || null,
        height: personData.height || null,
        position: personData.position || null,
        role: personData.role || null,
        status: personData.status || 'active',
    };

    const { data, error } = await supabase
        .from('people')
        .update(richPayload)
        .eq('id', personId)
        .select()
        .single();

    if (!error) return { data, error: null };

    const safePayload = {
        first_name: personData.first_name,
        last_name: personData.last_name,
        birth_date: personData.birth_date || null,
        id_number: personData.id_number || null,
        avatar_url: personData.photo_url || null,
    };

    return supabase
        .from('people')
        .update(safePayload)
        .eq('id', personId)
        .select()
        .single();
}

async function resolveTeamReference(supabase: any, clubId: string, divisionId?: string) {
    if (!divisionId) {
        return {
            teamId: null as string | null,
            legacyDivisionId: null as string | null,
            divisionName: null as string | null,
        };
    }

    const { data: teams, error: teamsError } = await supabase
        .from('club_teams')
        .select('id, legacy_division_id, name')
        .eq('club_id', clubId);

    if (teamsError && !isMissingTableError(teamsError)) {
        throw teamsError;
    }

    const team = (teams ?? []).find(
        (candidate: any) => candidate.id === divisionId || candidate.legacy_division_id === divisionId
    );

    if (team) {
        return {
            teamId: team.id,
            legacyDivisionId: team.legacy_division_id || divisionId,
            divisionName: team.name || null,
        };
    }

    const { data: division, error: divisionError } = await supabase
        .from('club_divisions')
        .select('id, name')
        .eq('club_id', clubId)
        .eq('id', divisionId)
        .maybeSingle();

    if (divisionError && !isMissingTableError(divisionError)) {
        throw divisionError;
    }

    return {
        teamId: null,
        legacyDivisionId: division?.id || divisionId,
        divisionName: division?.name || null,
    };
}

async function fetchPeopleFromTeamMemberships(clubId: string, divisionId?: string): Promise<PersonWithRole[] | null> {
    const supabase = await createClient();
    const db = supabase as any;

    const { data: memberships, error: membershipsError } = await db
        .from('team_memberships')
        .select('person_id, team_id, role, status, position')
        .eq('club_id', clubId);

    if (membershipsError) {
        if (isMissingTableError(membershipsError)) return null;
        console.error('Error fetching team memberships:', membershipsError);
        return [];
    }

    if (!memberships || memberships.length === 0) return [];

    const { data: teams, error: teamsError } = await db
        .from('club_teams')
        .select('id, legacy_division_id, name')
        .eq('club_id', clubId);

    if (teamsError) {
        if (isMissingTableError(teamsError)) return [];
        console.error('Error fetching club teams:', teamsError);
        return [];
    }

    const teamRows = (teams ?? []) as TeamLookupRow[];
    const membershipRows = memberships as TeamMembershipRow[];
    const teamsById = new Map<string, TeamLookupRow>(teamRows.map((team) => [team.id, team]));
    const filteredMemberships = divisionId
        ? membershipRows.filter((membership) => {
            const team = membership.team_id ? teamsById.get(membership.team_id) : undefined;
            return team && (team.id === divisionId || team.legacy_division_id === divisionId);
        })
        : membershipRows;

    if (filteredMemberships.length === 0) return [];

    const personIds = Array.from(new Set(filteredMemberships.map((membership: any) => membership.person_id)));
    const people = await fetchPersonRowsByIds(supabase, personIds);
    const peopleById = new Map<string, PersonRow>(((people ?? []) as PersonRow[]).map((person) => [person.id, person]));

    return filteredMemberships
        .map((membership) => {
            const person = peopleById.get(membership.person_id);
            if (!person) return null;

            const team = membership.team_id ? teamsById.get(membership.team_id) : undefined;
            return mapPersonRecord(
                person,
                membership,
                team?.name || undefined,
                team?.legacy_division_id || team?.id || undefined
            );
        })
        .filter(Boolean) as PersonWithRole[];
}

async function fetchPeopleFromLegacy(clubId: string, divisionId?: string): Promise<PersonWithRole[]> {
    const supabase = await createClient();
    const db = supabase as any;

    let rolesQuery = db
        .from('club_person_roles')
        .select('person_id, role, status, division_id, position')
        .eq('club_id', clubId);

    if (divisionId) {
        rolesQuery = rolesQuery.eq('division_id', divisionId);
    }

    const { data: roles, error: rolesError } = await rolesQuery;

    if (rolesError) {
        if (!isMissingTableError(rolesError)) {
            console.error('Error fetching legacy club roles:', rolesError);
        }
        return [];
    }

    if (!roles || roles.length === 0) return [];

    const roleRows = roles as LegacyRoleRow[];
    const personIds = Array.from(new Set(roleRows.map((role) => role.person_id)));
    const divisionIds = Array.from(new Set(roleRows.map((role) => role.division_id).filter(Boolean))) as string[];

    const [people, { data: divisions, error: divisionsError }] = await Promise.all([
        fetchPersonRowsByIds(supabase, personIds),
        divisionIds.length > 0
            ? db.from('club_divisions').select('id, name').in('id', divisionIds)
            : Promise.resolve({ data: [], error: null }),
    ]);

    if (divisionsError && !isMissingTableError(divisionsError)) {
        console.error('Error fetching divisions from legacy roles:', divisionsError);
    }

    const peopleById = new Map<string, PersonRow>(((people ?? []) as PersonRow[]).map((person) => [person.id, person]));
    const divisionsById = new Map<string, string | null>(((divisions ?? []) as DivisionLookupRow[]).map((division) => [division.id, division.name]));

    return roleRows
        .map((role) => {
            const person = peopleById.get(role.person_id);
            if (!person) return null;

            return mapPersonRecord(
                person,
                role,
                role.division_id ? divisionsById.get(role.division_id) || undefined : undefined,
                role.division_id || undefined
            );
        })
        .filter(Boolean) as PersonWithRole[];
}

export async function fetchPeopleByClub(clubId: string): Promise<PersonWithRole[]> {
    const rosterClubId = await resolveSharedRosterOwnerClubId(clubId);
    const newLayerPeople = await fetchPeopleFromTeamMemberships(rosterClubId);
    if (newLayerPeople && newLayerPeople.length > 0) return newLayerPeople;
    return fetchPeopleFromLegacy(rosterClubId);
}

export async function fetchPeopleByDivision(clubId: string, divisionId: string): Promise<PersonWithRole[]> {
    const rosterClubId = await resolveSharedRosterOwnerClubId(clubId);
    const newLayerPeople = await fetchPeopleFromTeamMemberships(rosterClubId, divisionId);
    if (newLayerPeople && newLayerPeople.length > 0) return newLayerPeople;

    const legacyPeople = await fetchPeopleFromLegacy(rosterClubId, divisionId);
    if (legacyPeople.length > 0) return legacyPeople;

    if (rosterClubId !== clubId) {
        return fetchPeopleByClub(rosterClubId);
    }

    return [];
}

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
    const db = supabase as any;
    const familyDivision = parseFamilyDivisionId(personData.division_id);
    const rosterClubId = familyDivision?.rosterOwnerClubId ?? await resolveSharedRosterOwnerClubId(clubId, db);
    const rosterDivisionId = familyDivision ? undefined : rosterClubId === clubId ? personData.division_id : undefined;

    const { data: person, error: personError } = await insertPersonRecord(supabase, {
        ...personData,
        club_id: rosterClubId,
    });

    if (personError) {
        const missingPeopleTable = isMissingTableError(personError) || personError.message?.includes("public.people");
        return {
            success: false,
            error: missingPeopleTable
                ? 'Falta la tabla public.people. Ejecuta la migracion 20260407190000_restore_people_for_club_rosters.sql y recarga el schema cache de Supabase.'
                : personError.message,
        };
    }

    let teamReference;
    try {
        teamReference = await resolveTeamReference(db, rosterClubId, rosterDivisionId);
    } catch (error: any) {
        return { success: false, error: error.message };
    }

    const { error: roleError } = await db
        .from('club_person_roles')
        .insert({
            club_id: rosterClubId,
            person_id: person.id,
            role: personData.role,
            division_id: teamReference.legacyDivisionId || null,
            status: personData.status || 'active',
            position: personData.position || null,
        });

    if (roleError && !isMissingTableError(roleError)) {
        return { success: false, error: roleError.message };
    }

    const { error: membershipError } = await db
        .from('team_memberships')
        .insert({
            club_id: rosterClubId,
            team_id: teamReference.teamId || null,
            person_id: person.id,
            role: personData.role,
            status: personData.status || 'active',
            position: personData.position || null,
            source: 'manual',
        });

    if (membershipError && !isMissingTableError(membershipError)) {
        return { success: false, error: membershipError.message };
    }

    if (personData.role === 'player' && teamReference.legacyDivisionId) {
        const { error: squadMemberError } = await db
            .from('squad_members')
            .insert({
                division_id: teamReference.legacyDivisionId,
                person_id: person.id,
                position: personData.position || 'Sin posicion',
                role: 'suplente',
                status: 'disponible',
                order: 0,
            });

        if (squadMemberError && !isMissingTableError(squadMemberError)) {
            return { success: false, error: squadMemberError.message };
        }
    }

    return { success: true, data: person };
}

export async function updatePersonInClub(clubId: string, personId: string, personData: {
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
    const db = supabase as any;
    const familyDivision = parseFamilyDivisionId(personData.division_id);
    const rosterClubId = familyDivision?.rosterOwnerClubId ?? await resolveSharedRosterOwnerClubId(clubId, db);
    const rosterDivisionId = familyDivision ? undefined : rosterClubId === clubId ? personData.division_id : undefined;

    const { data: person, error: personError } = await updatePersonRecord(supabase, personId, personData);
    if (personError) {
        return { success: false, error: personError.message };
    }

    let teamReference;
    try {
        teamReference = await resolveTeamReference(db, rosterClubId, rosterDivisionId);
    } catch (error: any) {
        return { success: false, error: error.message };
    }

    const { error: membershipsDeleteError } = await db
        .from('team_memberships')
        .delete()
        .match({ club_id: rosterClubId, person_id: personId });

    if (membershipsDeleteError && !isMissingTableError(membershipsDeleteError)) {
        return { success: false, error: membershipsDeleteError.message };
    }

    const { error: membershipError } = await db
        .from('team_memberships')
        .insert({
            club_id: rosterClubId,
            team_id: teamReference.teamId || null,
            person_id: personId,
            role: personData.role,
            status: personData.status || 'active',
            position: personData.position || null,
            source: 'manual',
        });

    if (membershipError && !isMissingTableError(membershipError)) {
        return { success: false, error: membershipError.message };
    }

    const { error: rolesDeleteError } = await db
        .from('club_person_roles')
        .delete()
        .match({ club_id: rosterClubId, person_id: personId });

    if (rolesDeleteError && !isMissingTableError(rolesDeleteError)) {
        return { success: false, error: rolesDeleteError.message };
    }

    const { error: roleError } = await db
        .from('club_person_roles')
        .insert({
            club_id: rosterClubId,
            person_id: personId,
            role: personData.role,
            division_id: teamReference.legacyDivisionId || null,
            status: personData.status || 'active',
            position: personData.position || null,
        });

    if (roleError && !isMissingTableError(roleError)) {
        return { success: false, error: roleError.message };
    }

    return { success: true, data: person };
}

export async function deletePersonFromClub(clubId: string, personId: string, divisionId?: string) {
    const supabase = await createClient();
    const db = supabase as any;
    const rosterClubId = await resolveSharedRosterOwnerClubId(clubId, db);
    const rosterDivisionId = rosterClubId === clubId ? divisionId : undefined;

    let teamReference;
    try {
        teamReference = await resolveTeamReference(db, rosterClubId, rosterDivisionId);
    } catch (error: any) {
        return { success: false, error: error.message };
    }

    let membershipsQuery = db
        .from('team_memberships')
        .delete()
        .match({ person_id: personId, club_id: rosterClubId });

    if (teamReference.teamId) {
        membershipsQuery = membershipsQuery.eq('team_id', teamReference.teamId);
    }

    const { error: membershipsError } = await membershipsQuery;
    if (membershipsError && !isMissingTableError(membershipsError)) {
        return { success: false, error: membershipsError.message };
    }

    if (!divisionId || teamReference.legacyDivisionId) {
        let squadMembersQuery = db
            .from('squad_members')
            .delete()
            .eq('person_id', personId);

        if (teamReference.legacyDivisionId) {
            squadMembersQuery = squadMembersQuery.eq('division_id', teamReference.legacyDivisionId);
        }

        const { error: squadMembersError } = await squadMembersQuery;
        if (squadMembersError && !isMissingTableError(squadMembersError)) {
            return { success: false, error: squadMembersError.message };
        }
    }

    let rolesQuery = db
        .from('club_person_roles')
        .delete()
        .match({ person_id: personId, club_id: rosterClubId });

    if (teamReference.legacyDivisionId) {
        rolesQuery = rolesQuery.eq('division_id', teamReference.legacyDivisionId);
    }

    const { error: rolesError } = await rolesQuery;
    if (rolesError && !isMissingTableError(rolesError)) {
        return { success: false, error: rolesError.message };
    }

    return { success: true };
}

export async function removePersonFromClub(clubId: string, personId: string) {
    return deletePersonFromClub(clubId, personId);
}
