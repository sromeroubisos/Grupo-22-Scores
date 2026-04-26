/* eslint-disable @typescript-eslint/no-explicit-any */
'use server';

import { createClient } from '@/lib/supabase/server';
import {
    isMissingColumnError as isMissingSupabaseColumnError,
    isMissingTableError as isMissingSupabaseTableError,
} from '@/lib/utils/supabaseSchema';

export interface Division {
    id: string;
    club_id: string;
    name: string;
    season: string;
    status: 'active' | 'draft' | 'archived';
    sport: string;
    gender: string;
    category: string;
    slug?: string;
    featured?: boolean;
    format?: string | null;
    regulation?: string | null;
    players_count?: number;
    staff_count?: number;
    management_id?: string;
    legacy_division_id?: string | null;
    is_family_division?: boolean;
    roster_owner_club_id?: string | null;
    linked_clubs?: Array<{ id: string; name: string }>;
}

export interface DivisionInput {
    name: string;
    slug?: string | null;
    sport?: string | null;
    gender?: string | null;
    category?: string | null;
    status?: 'active' | 'draft' | 'archived' | string | null;
    featured?: boolean;
    season?: string | null;
    format?: string | null;
    regulation?: string | null;
}

interface DivisionMutationResult {
    success: boolean;
    data?: Division;
    error?: string;
    code?: 'duplicate' | 'not_found';
}

const DEFAULT_SEASON = String(new Date().getFullYear());
const MISSING_TABLE_CODES = new Set(['PGRST204', 'PGRST205', '42P01']);
const FAMILY_DIVISION_ID_PREFIX = 'family-division';
const OPTIONAL_TEAM_COLUMNS = [
    'legacy_division_id',
    'slug',
    'sport',
    'gender',
    'category',
    'status',
    'featured',
    'season',
    'format',
    'regulation',
] as const;

function isMissingTableError(error: any, tableName?: string) {
    if (tableName) {
        return isMissingSupabaseTableError(error, tableName);
    }

    return Boolean(error && typeof error.code === 'string' && MISSING_TABLE_CODES.has(error.code));
}

function isMissingColumnError(error: any, column: string) {
    return isMissingSupabaseColumnError(error, column);
}

function isRecoverableDivisionFetchError(error: any) {
    return (
        isMissingTableError(error)
        || isMissingTableError(error, 'club_family_divisions')
        || isMissingColumnError(error, 'group_name')
        || OPTIONAL_TEAM_COLUMNS.some((column) => isMissingColumnError(error, column))
    );
}

function toNullableText(value: unknown) {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function slugify(value: string) {
    return value
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function normalizeDivisionInput(input: string | DivisionInput): DivisionInput {
    if (typeof input === 'string') {
        const name = input.trim();
        return {
            name,
            slug: slugify(name),
            status: 'active',
            season: DEFAULT_SEASON,
        };
    }

    const name = input.name.trim();

    return {
        name,
        slug: toNullableText(input.slug) ?? slugify(name),
        sport: toNullableText(input.sport),
        gender: toNullableText(input.gender),
        category: toNullableText(input.category),
        status: (toNullableText(input.status) as Division['status'] | null) ?? 'active',
        featured: Boolean(input.featured),
        season: toNullableText(input.season) ?? DEFAULT_SEASON,
        format: toNullableText(input.format),
        regulation: toNullableText(input.regulation),
    };
}

function mapTeamToDivision(team: any, teamMemberships: any[]): Division {
    const memberships = teamMemberships.filter((membership) => membership.team_id === team.id);

    return {
        id: team.legacy_division_id || team.id,
        management_id: team.id,
        legacy_division_id: team.legacy_division_id || null,
        club_id: team.club_id,
        name: team.name,
        slug: team.slug || undefined,
        sport: team.sport || 'rugby',
        gender: team.gender || 'Masculino',
        category: team.category || team.name,
        status: (team.status || 'draft') as Division['status'],
        featured: Boolean(team.featured),
        season: team.season || DEFAULT_SEASON,
        format: team.format || null,
        regulation: team.regulation || null,
        players_count: memberships.filter((membership) => membership.role === 'player').length,
        staff_count: memberships.filter((membership) => membership.role !== 'player').length,
    };
}

function mapLegacyDivision(division: any, roles: any[]): Division {
    const scopedRoles = roles.filter((role) => role.division_id === division.id);

    return {
        id: division.id,
        management_id: division.id,
        legacy_division_id: division.id,
        club_id: division.club_id,
        name: division.name,
        slug: division.slug || undefined,
        sport: division.sport || 'rugby',
        gender: division.gender || 'Masculino',
        category: division.category || division.name,
        status: (division.status || 'draft') as Division['status'],
        featured: Boolean(division.featured),
        season: division.season || DEFAULT_SEASON,
        format: division.format || null,
        regulation: division.regulation || null,
        players_count: scopedRoles.filter((role) => role.role === 'player').length,
        staff_count: scopedRoles.filter((role) => role.role !== 'player').length,
    };
}

function sortDivisions(left: Division, right: Division) {
    const featuredDelta = Number(Boolean(right.featured)) - Number(Boolean(left.featured));
    if (featuredDelta !== 0) return featuredDelta;
    return left.name.localeCompare(right.name);
}

function mergeDivisions(teamDivisions: Division[], legacyDivisions: Division[]) {
    const merged = new Map<string, Division>();

    for (const division of legacyDivisions) {
        merged.set(division.name.trim().toLowerCase(), division);
    }

    for (const division of teamDivisions) {
        const key = division.name.trim().toLowerCase();
        const existing = merged.get(key);
        merged.set(key, existing ? { ...existing, ...division } : division);
    }

    return Array.from(merged.values()).sort(sortDivisions);
}

function toFamilyDivisionId(rosterOwnerClubId: string, groupName: string | null) {
    return `${FAMILY_DIVISION_ID_PREFIX}|${rosterOwnerClubId}|${encodeURIComponent(groupName || 'division')}`;
}

async function fetchFamilyDivisions(supabase: any, clubId: string): Promise<Division[]> {
    let supportsGroupName = true;
    let seedLinks: any[] = [];

    const seedQuery = await supabase
        .from('club_family_divisions')
        .select('family_base_club_id, roster_owner_club_id, division_club_id, group_name')
        .or(`roster_owner_club_id.eq.${clubId},division_club_id.eq.${clubId}`);

    if (seedQuery.error) {
        if (isMissingTableError(seedQuery.error, 'club_family_divisions')) return [];

        if (isMissingColumnError(seedQuery.error, 'group_name')) {
            supportsGroupName = false;

            const fallbackQuery = await supabase
                .from('club_family_divisions')
                .select('family_base_club_id, roster_owner_club_id, division_club_id')
                .or(`roster_owner_club_id.eq.${clubId},division_club_id.eq.${clubId}`);

            if (fallbackQuery.error) {
                if (isMissingTableError(fallbackQuery.error, 'club_family_divisions')) return [];
                throw fallbackQuery.error;
            }

            seedLinks = (fallbackQuery.data ?? []).map((link: any) => ({
                ...link,
                group_name: null,
            }));
        } else {
            throw seedQuery.error;
        }
    } else {
        seedLinks = seedQuery.data ?? [];
    }

    const seedGroupKeys = new Set(
        (seedLinks ?? []).map((link: any) => `${link.roster_owner_club_id}::${link.group_name || ''}`)
    );
    const rosterOwnerIds = Array.from(new Set((seedLinks ?? []).map((link: any) => link.roster_owner_club_id).filter(Boolean)));

    let allLinks = seedLinks ?? [];
    if (rosterOwnerIds.length > 0) {
        const { data: ownerLinks, error: ownerLinksError } = await supabase
            .from('club_family_divisions')
            .select(
                supportsGroupName
                    ? 'family_base_club_id, roster_owner_club_id, division_club_id, group_name'
                    : 'family_base_club_id, roster_owner_club_id, division_club_id'
            )
            .in('roster_owner_club_id', rosterOwnerIds);

        if (ownerLinksError) {
            if (!isMissingTableError(ownerLinksError, 'club_family_divisions')) throw ownerLinksError;
        } else {
            const normalizedOwnerLinks = supportsGroupName
                ? (ownerLinks ?? [])
                : (ownerLinks ?? []).map((link: any) => ({ ...link, group_name: null }));

            allLinks = normalizedOwnerLinks.filter((link: any) =>
                seedGroupKeys.has(`${link.roster_owner_club_id}::${link.group_name || ''}`)
            );
        }
    }

    const clubIds = Array.from(new Set(
        allLinks.flatMap((link: any) => [link.roster_owner_club_id, link.division_club_id]).filter(Boolean)
    ));
    const clubNames = new Map<string, string>();

    if (clubIds.length > 0) {
        const { data: clubs, error: clubsError } = await supabase
            .from('clubs')
            .select('id, name')
            .in('id', clubIds);

        if (clubsError) {
            if (!isMissingTableError(clubsError)) throw clubsError;
        } else {
            for (const club of clubs ?? []) {
                clubNames.set(String(club.id), String(club.name || club.id));
            }
        }
    }

    const groupedLinks = new Map<string, any[]>();
    for (const link of allLinks) {
        const rosterOwnerClubId = String(link.roster_owner_club_id || '');
        if (!rosterOwnerClubId) continue;
        const groupName = typeof link.group_name === 'string' && link.group_name.trim()
            ? link.group_name.trim()
            : 'Division compartida';
        const key = `${rosterOwnerClubId}::${groupName}`;
        groupedLinks.set(key, [...(groupedLinks.get(key) ?? []), link]);
    }

    const groups = new Map<string, Division>();

    for (const [key, links] of groupedLinks.entries()) {
        const [rosterOwnerClubId, groupName] = key.split('::');
        if (!rosterOwnerClubId) continue;

        const id = toFamilyDivisionId(rosterOwnerClubId, groupName);
        const linkedClubIds = Array.from(new Set([rosterOwnerClubId, ...links.map((link: any) => link.division_club_id).filter(Boolean)]));

        groups.set(id, {
            id,
            club_id: rosterOwnerClubId,
            name: groupName,
            sport: 'rugby',
            gender: 'Masculino',
            category: groupName,
            season: DEFAULT_SEASON,
            status: 'active',
            players_count: 0,
            staff_count: 0,
            is_family_division: true,
            roster_owner_club_id: rosterOwnerClubId,
            linked_clubs: linkedClubIds.map((linkedClubId) => ({
                id: linkedClubId,
                name: clubNames.get(linkedClubId) ?? linkedClubId,
            })),
        });
    }

    return Array.from(groups.values()).sort(sortDivisions);
}

async function listClubTeams(supabase: any, clubId: string): Promise<any[] | null> {
    const { data, error } = await supabase
        .from('club_teams')
        .select('id, club_id, legacy_division_id, name, slug, sport, gender, category, status, featured, season, format, regulation')
        .eq('club_id', clubId)
        .order('featured', { ascending: false })
        .order('name');

    if (error) {
        if (isMissingTableError(error, 'club_teams')) return null;
        if (!OPTIONAL_TEAM_COLUMNS.some((column) => isMissingColumnError(error, column))) {
            throw error;
        }

        const fallbackQuery = await supabase
            .from('club_teams')
            .select('id, club_id, name')
            .eq('club_id', clubId)
            .order('name');

        if (fallbackQuery.error) {
            if (isMissingTableError(fallbackQuery.error, 'club_teams')) return null;
            throw fallbackQuery.error;
        }

        return fallbackQuery.data ?? [];
    }

    return data ?? [];
}

async function listLegacyDivisions(supabase: any, clubId: string): Promise<any[] | null> {
    const { data, error } = await supabase
        .from('club_divisions')
        .select('*')
        .eq('club_id', clubId)
        .order('featured', { ascending: false })
        .order('name');

    if (error) {
        if (isMissingTableError(error)) return null;
        throw error;
    }

    return data ?? [];
}

async function fetchDivisionsFromTeams(supabase: any, clubId: string): Promise<Division[] | null> {
    const teams = await listClubTeams(supabase, clubId);
    if (teams === null) return null;
    if (teams.length === 0) return [];

    const { data: memberships, error: membershipsError } = await supabase
        .from('team_memberships')
        .select('team_id, role')
        .eq('club_id', clubId);

    if (membershipsError && !isMissingTableError(membershipsError)) {
        throw membershipsError;
    }

    return teams.map((team) => mapTeamToDivision(team, memberships ?? []));
}

async function fetchDivisionsFromLegacy(supabase: any, clubId: string): Promise<Division[] | null> {
    const divisions = await listLegacyDivisions(supabase, clubId);
    if (divisions === null) return null;
    if (divisions.length === 0) return [];

    const { data: roles, error: rolesError } = await supabase
        .from('club_person_roles')
        .select('division_id, role')
        .eq('club_id', clubId);

    if (rolesError && !isMissingTableError(rolesError)) {
        throw rolesError;
    }

    return divisions.map((division) => mapLegacyDivision(division, roles ?? []));
}

async function syncClubCategories(
    supabase: any,
    clubId: string,
    action: 'add' | 'rename' | 'remove',
    nextName: string,
    previousName?: string
) {
    const { data: club, error } = await supabase
        .from('clubs')
        .select('categories')
        .eq('id', clubId)
        .single();

    if (error || !club) return;

    const currentCategories = Array.isArray(club.categories) ? [...club.categories] : [];
    let nextCategories = currentCategories;

    if (action === 'add') {
        if (!currentCategories.some((category) => category.toLowerCase() === nextName.toLowerCase())) {
            nextCategories = [...currentCategories, nextName];
        }
    }

    if (action === 'rename' && previousName) {
        nextCategories = currentCategories.map((category) =>
            category.toLowerCase() === previousName.toLowerCase() ? nextName : category
        );
    }

    if (action === 'remove') {
        const legacyIndex = nextName.startsWith('legacy-')
            ? Number.parseInt(nextName.replace('legacy-', ''), 10)
            : Number.NaN;

        nextCategories = currentCategories.filter((category, index) => {
            if (previousName) {
                return category.toLowerCase() !== previousName.toLowerCase();
            }

            if (Number.isInteger(legacyIndex)) {
                return index !== legacyIndex;
            }

            return category.toLowerCase() !== nextName.toLowerCase();
        });
    }

    if (JSON.stringify(currentCategories) === JSON.stringify(nextCategories)) return;

    await supabase.from('clubs').update({ categories: nextCategories }).eq('id', clubId);
}

async function fetchDivisionsFallback(clubId: string): Promise<Division[]> {
    const supabase = await createClient();
    const { data: club } = await supabase
        .from('clubs')
        .select('categories, is_visible')
        .eq('id', clubId)
        .single();

    if (!club || !Array.isArray(club.categories)) return [];

    const baseStatus = club.is_visible ? 'active' : 'draft';

    return club.categories.map((category: string, index: number) => ({
        id: `legacy-${index}`,
        management_id: `legacy-${index}`,
        legacy_division_id: null,
        club_id: clubId,
        name: category,
        season: DEFAULT_SEASON,
        status: baseStatus as Division['status'],
        sport: 'rugby',
        gender: 'Masculino',
        category,
        players_count: 0,
        staff_count: 0,
    }));
}

async function resolveDivisionRecord(supabase: any, clubId: string, divisionId: string) {
    const [teams, legacyDivisions] = await Promise.all([
        listClubTeams(supabase, clubId),
        listLegacyDivisions(supabase, clubId),
    ]);

    const matchingTeam = (teams ?? []).find(
        (team) => team.id === divisionId || team.legacy_division_id === divisionId
    ) ?? null;

    const matchingLegacy = (legacyDivisions ?? []).find(
        (division) =>
            division.id === divisionId
            || (matchingTeam?.legacy_division_id && division.id === matchingTeam.legacy_division_id)
            || (matchingTeam?.name && division.name.toLowerCase() === matchingTeam.name.toLowerCase())
    ) ?? null;

    return {
        team: matchingTeam,
        legacyDivision: matchingLegacy,
        teams: teams ?? [],
        legacyDivisions: legacyDivisions ?? [],
    };
}

function buildDivisionResponse(team: any | null, legacyDivision: any | null): Division | undefined {
    if (team) return mapTeamToDivision(team, []);
    if (legacyDivision) return mapLegacyDivision(legacyDivision, []);
    return undefined;
}

export async function fetchDivisions(clubId: string, supabaseClient?: any): Promise<Division[]> {
    const supabase = supabaseClient ?? await createClient();
    const db = supabase as any;

    try {
        const [teamDivisions, legacyDivisions, familyDivisions] = await Promise.all([
            fetchDivisionsFromTeams(db, clubId),
            fetchDivisionsFromLegacy(db, clubId),
            fetchFamilyDivisions(db, clubId),
        ]);

        const hasTeamRows = Boolean(teamDivisions && teamDivisions.length > 0);
        const hasLegacyRows = Boolean(legacyDivisions && legacyDivisions.length > 0);

        if (hasTeamRows && hasLegacyRows) {
            return [...mergeDivisions(teamDivisions!, legacyDivisions!), ...familyDivisions].sort(sortDivisions);
        }

        if (hasTeamRows) return [...teamDivisions!, ...familyDivisions].sort(sortDivisions);
        if (hasLegacyRows) return [...legacyDivisions!, ...familyDivisions].sort(sortDivisions);
        if (familyDivisions.length > 0) return familyDivisions;

        return fetchDivisionsFallback(clubId);
    } catch (error) {
        if (!isRecoverableDivisionFetchError(error)) {
            console.error('Error fetching divisions, falling back to club categories:', error);
        }
        return fetchDivisionsFallback(clubId);
    }
}

export async function createDivision(
    clubId: string,
    input: string | DivisionInput
): Promise<DivisionMutationResult> {
    const normalized = normalizeDivisionInput(input);
    const supabase = await createClient();
    const db = supabase as any;

    try {
        const [teams, legacyDivisions] = await Promise.all([
            listClubTeams(db, clubId),
            listLegacyDivisions(db, clubId),
        ]);

        const duplicateTeam = (teams ?? []).find(
            (team) => team.name.toLowerCase() === normalized.name.toLowerCase()
        );
        const duplicateLegacy = (legacyDivisions ?? []).find(
            (division) => division.name.toLowerCase() === normalized.name.toLowerCase()
        );

        if (duplicateTeam || duplicateLegacy) {
            return {
                success: false,
                code: 'duplicate',
                error: 'Ya existe una division con ese nombre en este club',
                data: buildDivisionResponse(duplicateTeam ?? null, duplicateLegacy ?? null),
            };
        }

        let legacyDivision: any | null = null;
        if (legacyDivisions !== null) {
            const { data, error } = await db
                .from('club_divisions')
                .insert({
                    club_id: clubId,
                    name: normalized.name,
                    slug: normalized.slug,
                    sport: normalized.sport,
                    gender: normalized.gender,
                    category: normalized.category,
                    status: normalized.status,
                    featured: normalized.featured ?? false,
                    season: normalized.season,
                    format: normalized.format,
                    regulation: normalized.regulation,
                })
                .select('*')
                .single();

            if (error && !isMissingTableError(error)) {
                return { success: false, error: error.message };
            }

            legacyDivision = data ?? null;
        }

        let team: any | null = null;
        if (teams !== null) {
            const { data, error } = await db
                .from('club_teams')
                .insert({
                    club_id: clubId,
                    legacy_division_id: legacyDivision?.id ?? null,
                    name: normalized.name,
                    slug: normalized.slug,
                    sport: normalized.sport,
                    gender: normalized.gender,
                    category: normalized.category,
                    status: normalized.status,
                    featured: normalized.featured ?? false,
                    season: normalized.season,
                    format: normalized.format,
                    regulation: normalized.regulation,
                    source: legacyDivision ? 'dual_write' : 'manual',
                })
                .select('*')
                .single();

            if (error && !isMissingTableError(error)) {
                if (legacyDivision) {
                    console.warn('Division created in legacy table but club_teams insert failed:', error);
                } else {
                    return { success: false, error: error.message };
                }
            } else {
                team = data ?? null;
            }
        }

        await syncClubCategories(supabase, clubId, 'add', normalized.name);

        const data = buildDivisionResponse(team, legacyDivision);
        if (data) return { success: true, data };

        return createDivisionFallback(clubId, normalized.name);
    } catch (error: any) {
        console.error('Error creating division, falling back to club categories:', error);
        return createDivisionFallback(clubId, normalized.name);
    }
}

async function createDivisionFallback(clubId: string, name: string): Promise<DivisionMutationResult> {
    const supabase = await createClient();
    const { data: club } = await supabase
        .from('clubs')
        .select('categories, is_visible')
        .eq('id', clubId)
        .single();

    if (!club) return { success: false, error: 'Club not found', code: 'not_found' };

    const categories = Array.isArray(club.categories) ? club.categories : [];
    if (categories.some((category) => category.toLowerCase() === name.toLowerCase())) {
        return {
            success: false,
            code: 'duplicate',
            error: 'Ya existe una division con ese nombre en este club',
        };
    }

    const nextCategories = [...categories, name];
    const { error } = await supabase.from('clubs').update({ categories: nextCategories }).eq('id', clubId);

    if (error) return { success: false, error: error.message };

    return {
        success: true,
        data: {
            id: `legacy-${nextCategories.length - 1}`,
            management_id: `legacy-${nextCategories.length - 1}`,
            legacy_division_id: null,
            club_id: clubId,
            name,
            season: DEFAULT_SEASON,
            status: club.is_visible ? 'active' : 'draft',
            sport: 'rugby',
            gender: 'Masculino',
            category: name,
            players_count: 0,
            staff_count: 0,
        },
    };
}

export async function updateDivision(
    clubId: string,
    divisionId: string,
    input: DivisionInput
): Promise<DivisionMutationResult> {
    const normalized = normalizeDivisionInput(input);
    const supabase = await createClient();
    const db = supabase as any;

    if (divisionId.startsWith('legacy-')) {
        const fallback = await fetchDivisionsFallback(clubId);
        const current = fallback.find((division) => division.id === divisionId);
        if (!current) return { success: false, code: 'not_found', error: 'Division not found' };

        await syncClubCategories(supabase, clubId, 'rename', normalized.name, current.name);
        return {
            success: true,
            data: {
                ...current,
                name: normalized.name,
                category: normalized.category || normalized.name,
                sport: normalized.sport || current.sport,
                gender: normalized.gender || current.gender,
                status: (normalized.status as Division['status']) || current.status,
                season: normalized.season || current.season,
                slug: normalized.slug || current.slug,
            },
        };
    }

    try {
        const { team, legacyDivision, teams, legacyDivisions } = await resolveDivisionRecord(db, clubId, divisionId);

        if (!team && !legacyDivision) {
            return { success: false, code: 'not_found', error: 'Division not found' };
        }

        const duplicateTeam = teams.find(
            (candidate) => candidate.id !== team?.id && candidate.name.toLowerCase() === normalized.name.toLowerCase()
        );
        const duplicateLegacy = legacyDivisions.find(
            (candidate) => candidate.id !== legacyDivision?.id && candidate.name.toLowerCase() === normalized.name.toLowerCase()
        );

        if (duplicateTeam || duplicateLegacy) {
            return {
                success: false,
                code: 'duplicate',
                error: 'Ya existe una division con ese nombre en este club',
                data: buildDivisionResponse(duplicateTeam ?? null, duplicateLegacy ?? null),
            };
        }

        let nextLegacyDivision = legacyDivision;
        if (legacyDivision) {
            const { data, error } = await db
                .from('club_divisions')
                .update({
                    name: normalized.name,
                    slug: normalized.slug,
                    sport: normalized.sport,
                    gender: normalized.gender,
                    category: normalized.category,
                    status: normalized.status,
                    featured: normalized.featured ?? false,
                    season: normalized.season,
                    format: normalized.format,
                    regulation: normalized.regulation,
                })
                .eq('id', legacyDivision.id)
                .eq('club_id', clubId)
                .select('*')
                .single();

            if (error && !isMissingTableError(error)) {
                return { success: false, error: error.message };
            }

            nextLegacyDivision = data ?? legacyDivision;
        }

        let nextTeam = team;
        if (team) {
            const { data, error } = await db
                .from('club_teams')
                .update({
                    name: normalized.name,
                    slug: normalized.slug,
                    sport: normalized.sport,
                    gender: normalized.gender,
                    category: normalized.category,
                    status: normalized.status,
                    featured: normalized.featured ?? false,
                    season: normalized.season,
                    format: normalized.format,
                    regulation: normalized.regulation,
                    legacy_division_id: nextLegacyDivision?.id ?? team.legacy_division_id ?? null,
                })
                .eq('id', team.id)
                .eq('club_id', clubId)
                .select('*')
                .single();

            if (error && !isMissingTableError(error)) {
                return { success: false, error: error.message };
            }

            nextTeam = data ?? team;
        }

        const previousName = legacyDivision?.name || team?.name;
        if (previousName) {
            await syncClubCategories(supabase, clubId, 'rename', normalized.name, previousName);
        }

        const data = buildDivisionResponse(nextTeam, nextLegacyDivision);
        return data
            ? { success: true, data }
            : { success: false, code: 'not_found', error: 'Division not found' };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function deleteDivision(
    clubId: string,
    divisionId: string,
    name?: string
): Promise<{ success: boolean; error?: string; code?: 'not_found' }> {
    const supabase = await createClient();
    const db = supabase as any;

    if (divisionId.startsWith('legacy-')) {
        await syncClubCategories(supabase, clubId, 'remove', divisionId, name);
        return { success: true };
    }

    try {
        const { team, legacyDivision } = await resolveDivisionRecord(db, clubId, divisionId);
        if (!team && !legacyDivision) {
            return { success: false, code: 'not_found', error: 'Division not found' };
        }

        if (legacyDivision) {
            const { error } = await db
                .from('club_divisions')
                .delete()
                .eq('id', legacyDivision.id)
                .eq('club_id', clubId);

            if (error && !isMissingTableError(error)) {
                return { success: false, error: error.message };
            }
        }

        if (team) {
            const { error } = await db
                .from('club_teams')
                .delete()
                .eq('id', team.id)
                .eq('club_id', clubId);

            if (error && !isMissingTableError(error)) {
                return { success: false, error: error.message };
            }
        }

        await syncClubCategories(
            supabase,
            clubId,
            'remove',
            divisionId,
            name || legacyDivision?.name || team?.name
        );

        return { success: true };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}

export async function saveSquadAndPlayers(
    clubId: string,
    squadName: string,
    playerIds: string[]
): Promise<DivisionMutationResult> {
    const createResult = await createDivision(clubId, {
        name: squadName,
        status: 'active',
        season: DEFAULT_SEASON,
    });

    const division = createResult.success ? createResult.data : createResult.code === 'duplicate' ? createResult.data : undefined;
    if (!division) return createResult;

    if (playerIds.length === 0) {
        return { success: true, data: division };
    }

    const supabase = await createClient();
    const db = supabase as any;
        const legacyDivisionId = division.legacy_division_id || division.id;
        const managementTeamId = division.management_id || null;

    try {
        const { data: people, error: peopleError } = await supabase
            .from('people')
            .select('id, position')
            .in('id', playerIds);

        if (peopleError) {
            console.error('Error loading people for squad sync:', peopleError);
        }

        const peopleById = new Map((people ?? []).map((person: any) => [person.id, person]));

        const { error: rolesError } = await db
            .from('club_person_roles')
            .update({ division_id: legacyDivisionId })
            .in('person_id', playerIds)
            .eq('club_id', clubId);

        if (rolesError && !isMissingTableError(rolesError)) {
            console.error('Error linking players to legacy division:', rolesError);
        }

        if (managementTeamId) {
            const { data: existingMemberships, error: membershipsError } = await db
                .from('team_memberships')
                .select('person_id')
                .eq('club_id', clubId)
                .eq('team_id', managementTeamId);

            if (membershipsError && !isMissingTableError(membershipsError)) {
                console.error('Error checking existing team memberships:', membershipsError);
            } else {
                const existingIds = new Set((existingMemberships ?? []).map((membership: any) => membership.person_id));
                const inserts = playerIds
                    .filter((playerId) => !existingIds.has(playerId))
                    .map((playerId) => ({
                        club_id: clubId,
                        team_id: managementTeamId,
                        person_id: playerId,
                        role: 'player',
                        status: 'active',
                        position: peopleById.get(playerId)?.position || null,
                        source: 'squad_builder',
                    }));

                if (inserts.length > 0) {
                    const { error } = await db.from('team_memberships').insert(inserts);
                    if (error && !isMissingTableError(error)) {
                        console.error('Error inserting team memberships:', error);
                    }
                }
            }
        }

        const { data: existingSquadMembers, error: squadMembersError } = await db
            .from('squad_members')
            .select('person_id')
            .eq('division_id', legacyDivisionId);

        if (squadMembersError && !isMissingTableError(squadMembersError)) {
            console.error('Error checking existing squad members:', squadMembersError);
        } else {
            const existingIds = new Set((existingSquadMembers ?? []).map((member: any) => member.person_id));
            const inserts = playerIds
                .filter((playerId) => !existingIds.has(playerId))
                .map((playerId, index) => ({
                    division_id: legacyDivisionId,
                    person_id: playerId,
                    position: peopleById.get(playerId)?.position || 'Sin posicion',
                    role: 'suplente',
                    status: 'disponible',
                    order: index,
                }));

            if (inserts.length > 0) {
                const { error } = await db.from('squad_members').insert(inserts);
                if (error && !isMissingTableError(error)) {
                    console.error('Error inserting squad members:', error);
                }
            }
        }

        return { success: true, data: division };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
}
