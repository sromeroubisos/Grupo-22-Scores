/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
'use server';

import { createClient } from '@/lib/supabase/server';
import { parseClubBaseRosterId } from '@/lib/clubRoster';

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

export interface PersonIdentityClubLink {
    club_id: string;
    club_name: string;
    division_id?: string;
    division_name?: string;
    role?: string;
    status?: string;
}

export interface PersonIdentityMatch {
    person_id: string;
    first_name: string;
    last_name: string;
    full_name: string;
    birth_date?: string;
    id_number?: string;
    photo_url?: string;
    already_linked_to_club: boolean;
    club_links: PersonIdentityClubLink[];
}

export interface PersonClubInput {
    first_name: string;
    last_name: string;
    role: string;
    division_id?: string;
    status?: string;
    position?: string;
    birth_date?: string;
    id_number?: string;
    photo_url?: string;
    weight?: number;
    height?: number;
    jersey_number?: number;
    squad_role?: string;
    existing_person_id?: string;
    force_create_new?: boolean;
}

export type PersonMutationResult =
    | {
        success: true;
        data: any;
        reused_existing_person?: boolean;
        error?: undefined;
        code?: undefined;
        matches?: undefined;
    }
    | {
        success: false;
        error: string;
        code?: 'identity_confirmation_required';
        matches?: PersonIdentityMatch[];
    };

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

function normalizePersonText(value: string | null | undefined) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeOptionalText(value: string | null | undefined) {
    const normalized = normalizePersonText(value);
    return normalized || undefined;
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

async function resolveRosterScope(
    clubId: string,
    supabaseClient?: any,
    divisionId?: string,
) {
    const clubBaseRosterId = parseClubBaseRosterId(divisionId);
    if (clubBaseRosterId) {
        return {
            rosterOwnerClubId: clubBaseRosterId,
            rosterDivisionId: undefined,
        };
    }

    const familyDivision = parseFamilyDivisionId(divisionId);
    const sharedRosterOwnerClubId = await resolveSharedRosterOwnerClubId(clubId, supabaseClient);
    const rosterOwnerClubId = familyDivision?.rosterOwnerClubId ?? sharedRosterOwnerClubId;
    const rosterDivisionId = familyDivision || rosterOwnerClubId !== clubId
        ? undefined
        : divisionId;

    return {
        rosterOwnerClubId,
        rosterDivisionId,
    };
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

async function fetchPersonRowById(supabase: any, personId: string): Promise<PersonRow | null> {
    const rows = await fetchPersonRowsByIds(supabase, [personId]);
    return rows[0] ?? null;
}

function mergePersonRecord(person: PersonRow, personData: PersonClubInput) {
    return {
        first_name: normalizePersonText(personData.first_name) || person.first_name,
        last_name: normalizePersonText(personData.last_name) || person.last_name,
        birth_date: personData.birth_date || person.birth_date || undefined,
        id_number: normalizeOptionalText(personData.id_number) || person.id_number || undefined,
        photo_url: normalizeOptionalText(personData.photo_url) || person.photo_url || person.avatar_url || undefined,
        weight: typeof personData.weight === 'number' ? personData.weight : person.weight ?? undefined,
        height: typeof personData.height === 'number' ? personData.height : person.height ?? undefined,
        position: normalizeOptionalText(personData.position) || person.position || undefined,
        role: personData.role,
        status: personData.status || 'active',
    };
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

async function fetchClubDivisionIds(supabase: any, clubId: string) {
    const { data, error } = await supabase
        .from('club_divisions')
        .select('id')
        .eq('club_id', clubId);

    if (error) {
        if (isMissingTableError(error)) return [];
        throw error;
    }

    return ((data ?? []) as Array<{ id?: string | null }>)
        .map((row) => row.id)
        .filter((value): value is string => typeof value === 'string' && value.length > 0);
}

async function syncPlayerSquadMembership(supabase: any, clubId: string, personId: string, nextDivisionId?: string, position?: string) {
    const divisionIds = new Set<string>(await fetchClubDivisionIds(supabase, clubId));
    if (nextDivisionId) {
        divisionIds.add(nextDivisionId);
    }

    if (divisionIds.size === 0) {
        return { success: true as const };
    }

    const scopedDivisionIds = Array.from(divisionIds);
    const { data: existingRows, error: existingError } = await supabase
        .from('squad_members')
        .select('id, division_id, role, jersey_number, order, notes, status')
        .eq('person_id', personId)
        .in('division_id', scopedDivisionIds);

    if (existingError) {
        if (!isMissingTableError(existingError)) {
            return { success: false as const, error: existingError.message };
        }
        return { success: true as const };
    }

    const rows = (existingRows ?? []) as Array<{
        id: string;
        division_id: string | null;
        role: string | null;
        jersey_number: number | null;
        order: number | null;
        notes: string | null;
        status: string | null;
    }>;

    const rowsToDelete = rows.filter((row) => row.division_id && row.division_id !== nextDivisionId);
    if (rowsToDelete.length > 0) {
        const { error: deleteError } = await supabase
            .from('squad_members')
            .delete()
            .in('id', rowsToDelete.map((row) => row.id));

        if (deleteError && !isMissingTableError(deleteError)) {
            return { success: false as const, error: deleteError.message };
        }
    }

    if (!nextDivisionId) {
        return { success: true as const };
    }

    const targetRow = rows.find((row) => row.division_id === nextDivisionId);
    const nextPosition = position || 'Sin posicion';

    if (targetRow?.id) {
        const { error: updateError } = await supabase
            .from('squad_members')
            .update({
                position: nextPosition,
                role: targetRow.role || 'suplente',
                jersey_number: targetRow.jersey_number,
                status: targetRow.status || 'disponible',
                order: targetRow.order ?? 0,
                notes: targetRow.notes ?? null,
            })
            .eq('id', targetRow.id);

        if (updateError && !isMissingTableError(updateError)) {
            return { success: false as const, error: updateError.message };
        }

        return { success: true as const };
    }

    const { error: insertError } = await supabase
        .from('squad_members')
        .insert({
            division_id: nextDivisionId,
            person_id: personId,
            position: nextPosition,
            role: 'suplente',
            status: 'disponible',
            order: 0,
        });

    if (insertError && !isMissingTableError(insertError)) {
        return { success: false as const, error: insertError.message };
    }

    return { success: true as const };
}

type SquadSyncOptions = {
    nextDivisionId?: string;
    position?: string;
    jerseyNumber?: number;
    squadRole?: string;
    status?: string;
};

async function syncPlayerSquadMembershipWithOptions(
    supabase: any,
    clubId: string,
    personId: string,
    options: SquadSyncOptions,
) {
    const divisionIds = new Set<string>(await fetchClubDivisionIds(supabase, clubId));
    if (options.nextDivisionId) {
        divisionIds.add(options.nextDivisionId);
    }

    if (divisionIds.size === 0) {
        return { success: true as const };
    }

    const scopedDivisionIds = Array.from(divisionIds);
    const { data: existingRows, error: existingError } = await supabase
        .from('squad_members')
        .select('id, division_id, role, jersey_number, order, notes, status')
        .eq('person_id', personId)
        .in('division_id', scopedDivisionIds);

    if (existingError) {
        if (!isMissingTableError(existingError)) {
            return { success: false as const, error: existingError.message };
        }
        return { success: true as const };
    }

    const rows = (existingRows ?? []) as Array<{
        id: string;
        division_id: string | null;
        role: string | null;
        jersey_number: number | null;
        order: number | null;
        notes: string | null;
        status: string | null;
    }>;

    const rowsToDelete = rows.filter((row) => row.division_id && row.division_id !== options.nextDivisionId);
    if (rowsToDelete.length > 0) {
        const { error: deleteError } = await supabase
            .from('squad_members')
            .delete()
            .in('id', rowsToDelete.map((row) => row.id));

        if (deleteError && !isMissingTableError(deleteError)) {
            return { success: false as const, error: deleteError.message };
        }
    }

    if (!options.nextDivisionId) {
        return { success: true as const };
    }

    const targetRow = rows.find((row) => row.division_id === options.nextDivisionId);
    const nextPosition = options.position || 'Sin posicion';
    const nextRole = options.squadRole || targetRow?.role || 'suplente';
    const nextStatus = options.status || targetRow?.status || 'disponible';
    const nextJerseyNumber =
        typeof options.jerseyNumber === 'number' && Number.isFinite(options.jerseyNumber)
            ? options.jerseyNumber
            : targetRow?.jersey_number ?? null;

    if (targetRow?.id) {
        const { error: updateError } = await supabase
            .from('squad_members')
            .update({
                position: nextPosition,
                role: nextRole,
                jersey_number: nextJerseyNumber,
                status: nextStatus,
                order: targetRow.order ?? 0,
                notes: targetRow.notes ?? null,
            })
            .eq('id', targetRow.id);

        if (updateError && !isMissingTableError(updateError)) {
            return { success: false as const, error: updateError.message };
        }

        return { success: true as const };
    }

    const { error: insertError } = await supabase
        .from('squad_members')
        .insert({
            division_id: options.nextDivisionId,
            person_id: personId,
            position: nextPosition,
            role: nextRole,
            jersey_number: nextJerseyNumber,
            status: nextStatus,
            order: 0,
        });

    if (insertError && !isMissingTableError(insertError)) {
        return { success: false as const, error: insertError.message };
    }

    return { success: true as const };
}

async function clearPersonAssignmentsInClub(
    supabase: any,
    clubId: string,
    personId: string,
) {
    const { error: membershipsDeleteError } = await supabase
        .from('team_memberships')
        .delete()
        .match({ club_id: clubId, person_id: personId });

    if (membershipsDeleteError && !isMissingTableError(membershipsDeleteError)) {
        return { success: false as const, error: membershipsDeleteError.message };
    }

    const { error: rolesDeleteError } = await supabase
        .from('club_person_roles')
        .delete()
        .match({ club_id: clubId, person_id: personId });

    if (rolesDeleteError && !isMissingTableError(rolesDeleteError)) {
        return { success: false as const, error: rolesDeleteError.message };
    }

    return { success: true as const };
}

async function insertPersonAssignmentsInClub(
    supabase: any,
    params: {
        clubId: string;
        personId: string;
        role: string;
        status?: string;
        position?: string;
        legacyDivisionId?: string | null;
        teamId?: string | null;
        source?: string;
    }
) {
    const { error: roleError } = await supabase
        .from('club_person_roles')
        .insert({
            club_id: params.clubId,
            person_id: params.personId,
            role: params.role,
            division_id: params.legacyDivisionId || null,
            status: params.status || 'active',
            position: params.position || null,
        });

    if (roleError && !isMissingTableError(roleError)) {
        return { success: false as const, error: roleError.message };
    }

    const { error: membershipError } = await supabase
        .from('team_memberships')
        .insert({
            club_id: params.clubId,
            team_id: params.teamId || null,
            person_id: params.personId,
            role: params.role,
            status: params.status || 'active',
            position: params.position || null,
            source: params.source || 'manual',
        });

    if (membershipError && !isMissingTableError(membershipError)) {
        return { success: false as const, error: membershipError.message };
    }

    return { success: true as const };
}

async function isPersonLinkedToClub(
    supabase: any,
    clubId: string,
    personId: string,
) {
    const [rolesRes, membershipsRes] = await Promise.all([
        supabase
            .from('club_person_roles')
            .select('id')
            .match({ club_id: clubId, person_id: personId })
            .limit(1),
        supabase
            .from('team_memberships')
            .select('id')
            .match({ club_id: clubId, person_id: personId })
            .limit(1),
    ]);

    const hasRoles = !rolesRes.error && Array.isArray(rolesRes.data) && rolesRes.data.length > 0;
    const hasMemberships = !membershipsRes.error && Array.isArray(membershipsRes.data) && membershipsRes.data.length > 0;

    return hasRoles || hasMemberships;
}

export async function findPotentialPersonIdentityMatches(
    clubId: string,
    personData: Pick<PersonClubInput, 'first_name' | 'last_name'>,
    supabaseClient?: any,
): Promise<PersonIdentityMatch[]> {
    const supabase = supabaseClient ?? await createClient();
    const db = supabase as any;
    const firstName = normalizePersonText(personData.first_name);
    const lastName = normalizePersonText(personData.last_name);

    if (!firstName || !lastName) return [];

    const { data: candidates, error: candidatesError } = await db
        .from('people')
        .select('id, first_name, last_name, full_name, birth_date, id_number, photo_url, avatar_url')
        .ilike('first_name', firstName)
        .ilike('last_name', lastName)
        .limit(8);

    if (candidatesError) {
        if (!isMissingTableError(candidatesError)) {
            console.error('Error searching matching people:', candidatesError);
        }
        return [];
    }

    const people = (candidates ?? []) as Array<{
        id: string;
        first_name: string;
        last_name: string;
        full_name: string | null;
        birth_date: string | null;
        id_number: string | null;
        photo_url: string | null;
        avatar_url: string | null;
    }>;

    if (people.length === 0) return [];

    const personIds = people.map((person) => person.id);
    const { data: roleRows, error: roleRowsError } = await db
        .from('club_person_roles')
        .select('person_id, club_id, division_id, role, status')
        .in('person_id', personIds);

    if (roleRowsError && !isMissingTableError(roleRowsError)) {
        console.error('Error searching person club links:', roleRowsError);
    }

    const links = (roleRows ?? []) as Array<{
        person_id: string;
        club_id: string | null;
        division_id: string | null;
        role: string | null;
        status: string | null;
    }>;

    const clubIds = Array.from(new Set(links.map((row) => row.club_id).filter(Boolean))) as string[];
    const divisionIds = Array.from(new Set(links.map((row) => row.division_id).filter(Boolean))) as string[];

    const [{ data: clubs }, { data: divisions }] = await Promise.all([
        clubIds.length > 0
            ? db.from('clubs').select('id, name').in('id', clubIds)
            : Promise.resolve({ data: [] }),
        divisionIds.length > 0
            ? db.from('club_divisions').select('id, name').in('id', divisionIds)
            : Promise.resolve({ data: [] }),
    ]);

    const clubsById = new Map<string, string>(
        ((clubs ?? []) as Array<{ id: string; name: string | null }>)
            .map((club) => [club.id, club.name || club.id]),
    );
    const divisionsById = new Map<string, string>(
        ((divisions ?? []) as Array<{ id: string; name: string | null }>)
            .map((division) => [division.id, division.name || division.id]),
    );

    return people.map((person) => {
        const personLinks = links
            .filter((row) => row.person_id === person.id && row.club_id)
            .map((row) => ({
                club_id: String(row.club_id),
                club_name: clubsById.get(String(row.club_id)) || String(row.club_id),
                division_id: row.division_id || undefined,
                division_name: row.division_id ? divisionsById.get(String(row.division_id)) || String(row.division_id) : undefined,
                role: row.role || undefined,
                status: row.status || undefined,
            }))
            .filter((link, index, array) =>
                array.findIndex((candidate) =>
                    candidate.club_id === link.club_id
                    && candidate.division_id === link.division_id
                    && candidate.role === link.role
                ) === index
            );

        return {
            person_id: person.id,
            first_name: person.first_name,
            last_name: person.last_name,
            full_name: person.full_name || `${person.first_name} ${person.last_name}`.trim(),
            birth_date: person.birth_date || undefined,
            id_number: person.id_number || undefined,
            photo_url: person.photo_url || person.avatar_url || undefined,
            already_linked_to_club: personLinks.some((link) => link.club_id === clubId),
            club_links: personLinks,
        };
    });
}

async function fetchPeopleFromTeamMemberships(
    clubId: string,
    divisionId?: string,
    supabaseClient?: any
): Promise<PersonWithRole[] | null> {
    const supabase = supabaseClient ?? await createClient();
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

async function fetchPeopleFromLegacy(
    clubId: string,
    divisionId?: string,
    supabaseClient?: any
): Promise<PersonWithRole[]> {
    const supabase = supabaseClient ?? await createClient();
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

export async function fetchPeopleByClub(clubId: string, supabaseClient?: any): Promise<PersonWithRole[]> {
    const supabase = supabaseClient ?? await createClient();
    const rosterOwnerClubId = await resolveSharedRosterOwnerClubId(clubId, supabase as any);
    const newLayerPeople = await fetchPeopleFromTeamMemberships(rosterOwnerClubId, undefined, supabase);
    if (newLayerPeople && newLayerPeople.length > 0) return newLayerPeople;
    return fetchPeopleFromLegacy(rosterOwnerClubId, undefined, supabase);
}

export async function fetchPeopleByDivision(clubId: string, divisionId: string): Promise<PersonWithRole[]> {
    const clubBaseRosterId = parseClubBaseRosterId(divisionId);
    if (clubBaseRosterId) {
        const clubRosterPeople = await fetchPeopleByClub(clubBaseRosterId);
        return clubRosterPeople.filter((person) => !person.division_id);
    }

    const familyDivision = parseFamilyDivisionId(divisionId);
    const supabase = await createClient();
    const rosterScope = await resolveRosterScope(clubId, supabase as any, divisionId);
    const rosterClubId = familyDivision?.rosterOwnerClubId ?? rosterScope.rosterOwnerClubId;
    const effectiveDivisionId = familyDivision ? undefined : rosterScope.rosterDivisionId;
    const newLayerPeople = await fetchPeopleFromTeamMemberships(rosterClubId, effectiveDivisionId, supabase);
    if (newLayerPeople && newLayerPeople.length > 0) return newLayerPeople;

    const legacyPeople = await fetchPeopleFromLegacy(rosterClubId, effectiveDivisionId, supabase);
    if (legacyPeople.length > 0) return legacyPeople;

    if (familyDivision && rosterClubId !== clubId) {
        return fetchPeopleByClub(rosterClubId);
    }

    return [];
}

export async function addPersonToClub(clubId: string, personData: PersonClubInput): Promise<PersonMutationResult> {
    const supabase = await createClient();
    const db = supabase as any;
    const { rosterOwnerClubId: rosterClubId, rosterDivisionId } = await resolveRosterScope(
        clubId,
        db,
        personData.division_id,
    );

    const normalizedPayload: PersonClubInput = {
        ...personData,
        first_name: normalizePersonText(personData.first_name),
        last_name: normalizePersonText(personData.last_name),
        position: normalizeOptionalText(personData.position),
        id_number: normalizeOptionalText(personData.id_number),
        photo_url: normalizeOptionalText(personData.photo_url),
    };

    if (!normalizedPayload.existing_person_id && !normalizedPayload.force_create_new) {
        const matches = await findPotentialPersonIdentityMatches(rosterClubId, normalizedPayload, db);
        if (matches.length > 0) {
            return {
                success: false,
                code: 'identity_confirmation_required',
                error: 'Ya existe una ficha con el mismo nombre. Confirma si se trata del mismo jugador.',
                matches,
            };
        }
    }

    let person: any;
    let reusedExistingPerson = false;
    let replaceExistingClubAssignment = false;

    if (normalizedPayload.existing_person_id) {
        const existingPerson = await fetchPersonRowById(supabase, normalizedPayload.existing_person_id);
        if (!existingPerson) {
            return { success: false, error: 'No se encontro la ficha seleccionada para reutilizar.' };
        }

        const mergedPerson = mergePersonRecord(existingPerson, normalizedPayload);
        const { data: updatedPerson, error: personError } = await updatePersonRecord(
            supabase,
            normalizedPayload.existing_person_id,
            mergedPerson,
        );

        if (personError) {
            return { success: false, error: personError.message };
        }

        person = updatedPerson;
        reusedExistingPerson = true;
        replaceExistingClubAssignment = await isPersonLinkedToClub(db, rosterClubId, normalizedPayload.existing_person_id);
    } else {
        const { data: insertedPerson, error: personError } = await insertPersonRecord(supabase, {
            ...normalizedPayload,
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

        person = insertedPerson;
    }

    let teamReference;
    try {
        teamReference = await resolveTeamReference(db, rosterClubId, rosterDivisionId);
    } catch (error: any) {
        return { success: false, error: error.message };
    }

    if (replaceExistingClubAssignment) {
        const clearAssignments = await clearPersonAssignmentsInClub(db, rosterClubId, person.id);
        if (!clearAssignments.success) {
            return { success: false, error: clearAssignments.error };
        }
    }

    const assignments = await insertPersonAssignmentsInClub(db, {
        clubId: rosterClubId,
        personId: person.id,
        role: normalizedPayload.role,
        status: normalizedPayload.status,
        position: normalizedPayload.position,
        legacyDivisionId: teamReference.legacyDivisionId || null,
        teamId: teamReference.teamId || null,
        source: reusedExistingPerson ? 'linked_existing_person' : 'manual',
    });

    if (!assignments.success) {
        return { success: false, error: assignments.error };
    }

    if (normalizedPayload.role === 'player') {
        const squadSync = await syncPlayerSquadMembershipWithOptions(
            db,
            rosterClubId,
            person.id,
            {
                nextDivisionId: teamReference.legacyDivisionId || undefined,
                position: normalizedPayload.position,
                jerseyNumber: normalizedPayload.jersey_number,
                squadRole: normalizedPayload.squad_role,
            },
        );

        if (!squadSync.success) {
            return { success: false, error: squadSync.error };
        }
    }

    return { success: true, data: person, reused_existing_person: reusedExistingPerson };
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
    height?: number,
    jersey_number?: number,
    squad_role?: string
}) {
    const supabase = await createClient();
    const db = supabase as any;
    const { rosterOwnerClubId: rosterClubId, rosterDivisionId } = await resolveRosterScope(
        clubId,
        db,
        personData.division_id,
    );

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

    const clearAssignments = await clearPersonAssignmentsInClub(db, rosterClubId, personId);
    if (!clearAssignments.success) {
        return { success: false, error: clearAssignments.error };
    }

    const assignments = await insertPersonAssignmentsInClub(db, {
        clubId: rosterClubId,
        personId,
        role: personData.role,
        status: personData.status,
        position: personData.position,
        legacyDivisionId: teamReference.legacyDivisionId || null,
        teamId: teamReference.teamId || null,
        source: 'manual',
    });

    if (!assignments.success) {
        return { success: false, error: assignments.error };
    }

    if (personData.role === 'player') {
        const squadSync = await syncPlayerSquadMembershipWithOptions(
            db,
            rosterClubId,
            personId,
            {
                nextDivisionId: teamReference.legacyDivisionId || undefined,
                position: personData.position,
                jerseyNumber: personData.jersey_number,
                squadRole: personData.squad_role,
            },
        );

        if (!squadSync.success) {
            return { success: false, error: squadSync.error };
        }
    } else {
        const squadSync = await syncPlayerSquadMembershipWithOptions(db, rosterClubId, personId, {
            nextDivisionId: undefined,
            position: personData.position,
        });
        if (!squadSync.success) {
            return { success: false, error: squadSync.error };
        }
    }

    return { success: true, data: person };
}

export async function deletePersonFromClub(clubId: string, personId: string, divisionId?: string) {
    const supabase = await createClient();
    const db = supabase as any;
    const { rosterOwnerClubId: rosterClubId, rosterDivisionId } = await resolveRosterScope(
        clubId,
        db,
        divisionId,
    );

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
