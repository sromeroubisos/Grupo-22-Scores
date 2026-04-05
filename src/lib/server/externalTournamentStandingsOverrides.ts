import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildExternalTournamentOverrideCandidates } from '@/lib/server/externalTournamentOverrides';
import { getReadClient } from '@/lib/supabase/read';

export type ExternalTournamentStandingsGroup = {
    id: string;
    name: string;
    order_index?: number | null;
};

export type ExternalTournamentStandingsAssignment = {
    id: string;
    team_id?: string | null;
    team_name?: string | null;
    team_url?: string | null;
    group_id?: string | null;
    points?: number | null;
};

export type ExternalTournamentStandingsLabel = {
    id: string;
    name: string;
    color: string;
    position: number;
    group_id?: string | null;
};

export type ExternalTournamentStandingsOverrideRecord = {
    id: string;
    source?: string | null;
    groups?: ExternalTournamentStandingsGroup[];
    assignments?: ExternalTournamentStandingsAssignment[];
    labels?: ExternalTournamentStandingsLabel[];
    updated_at?: string | null;
};

type ExternalTournamentStandingsOverrideStore = Record<string, ExternalTournamentStandingsOverrideRecord>;
type MinimalReadClient = {
    from: (table: string) => {
        select: (columns: string) => {
            in: (
                column: string,
                values: string[],
            ) => Promise<{ data: Record<string, unknown>[] | null; error: { message?: string | null } | null }>;
        };
    };
};

const STORE_DIR = path.join(process.cwd(), 'storage');
const STORE_PATH = path.join(STORE_DIR, 'external-tournament-standings-overrides.json');
const UNGROUPED_GROUP_ID = '__external_ungrouped__';
const STANDINGS_OVERRIDE_SELECT = 'id, source, groups, assignments, labels, updated_at';

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function normalizeInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return Math.trunc(value);
    }

    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function slugify(value: string): string {
    return value
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function deriveId(value: string, prefix: string) {
    const slug = slugify(value);
    return slug ? `${prefix}-${slug}` : `${prefix}-${Date.now()}`;
}

function getGroupIdFromContainer(group: any, index: number): string {
    return (
        normalizeString(group?.group_id) ||
        normalizeString(group?.id) ||
        normalizeString(group?.group_name && `ext-group-${slugify(String(group.group_name))}`) ||
        `ext-group-${index + 1}`
    );
}

function normalizeTeamUrl(value: unknown): string | null {
    const raw = normalizeString(value);
    if (!raw) return null;

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
        try {
            return new URL(raw).pathname || raw;
        } catch {
            return raw;
        }
    }

    return raw;
}

function extractTeamIdFromUrl(value: unknown): string | null {
    const pathname = normalizeTeamUrl(value);
    if (!pathname) return null;

    const segments = pathname
        .split('/')
        .map((segment) => segment.trim())
        .filter(Boolean);

    if (segments.length < 2) return null;
    if (segments[0].toLowerCase() !== 'team') return null;

    const last = segments[segments.length - 1];
    return last || null;
}

function buildTeamIdentityKeys(source: {
    team_id?: unknown;
    team_name?: unknown;
    team_url?: unknown;
}): string[] {
    const keys = new Set<string>();
    const teamId = normalizeString(source.team_id);
    const teamName = normalizeString(source.team_name);
    const teamUrl = normalizeTeamUrl(source.team_url);
    const teamUrlId = extractTeamIdFromUrl(source.team_url);

    if (teamId) {
        keys.add(`id:${teamId.toLowerCase()}`);
        if (teamId.toLowerCase().startsWith('fs-team-')) {
            keys.add(`id:${teamId.slice(8).toLowerCase()}`);
        }
        if (teamId.toLowerCase().startsWith('fs-')) {
            keys.add(`id:${teamId.slice(3).toLowerCase()}`);
        }
    }
    if (teamUrlId) keys.add(`id:${teamUrlId.toLowerCase()}`);
    if (teamName) keys.add(`name:${teamName.toLowerCase()}`);
    if (teamUrl) keys.add(`url:${teamUrl.toLowerCase()}`);

    return [...keys];
}

function getStandingsTeamName(row: any) {
    return row?.team?.name || row?.participant?.name || row?.team_name || row?.name || null;
}

function getStandingsTeamId(row: any) {
    return row?.team?.id || row?.team?.team_id || row?.participant?.id || row?.team_id || null;
}

function getStandingsTeamUrl(row: any) {
    return row?.team?.team_url || row?.participant?.team_url || row?.team_url || null;
}

function isGroupedStandings(rows: any[]): boolean {
    return Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0]?.rows);
}

function flattenPreparedStandings(rows: any[]): any[] {
    if (!isGroupedStandings(rows)) return rows.map((row: any) => ({ ...row }));

    return rows.flatMap((group: any, groupIndex: number) => {
        const groupId = getGroupIdFromContainer(group, groupIndex);
        const groupName = normalizeString(group?.group_name) || `Grupo ${groupIndex + 1}`;

        return Array.isArray(group?.rows)
            ? group.rows.map((row: any, rowIndex: number) => ({
                ...row,
                group_id: normalizeString(row?.group_id) || groupId,
                __original_group_name: groupName,
                __original_position: normalizeInteger(row?.position) ?? rowIndex + 1,
            }))
            : [];
    });
}

function ensureStandingsGroupMetadata(rows: any[]): any[] {
    if (!Array.isArray(rows)) return [];

    if (!isGroupedStandings(rows)) {
        return rows.map((row: any, index: number) => ({
            ...row,
            position: normalizeInteger(row?.position) ?? index + 1,
            group_id: normalizeString(row?.group_id),
        }));
    }

    return rows.map((group: any, index: number) => {
        const groupId = getGroupIdFromContainer(group, index);
        const groupName = normalizeString(group?.group_name) || `Grupo ${index + 1}`;

        return {
            ...group,
            group_id: groupId,
            group_name: groupName,
            rows: Array.isArray(group?.rows)
                ? group.rows.map((row: any, rowIndex: number) => ({
                    ...row,
                    position: normalizeInteger(row?.position) ?? rowIndex + 1,
                    group_id: normalizeString(row?.group_id) || groupId,
                }))
                : [],
        };
    });
}

async function ensureStoreDir() {
    await mkdir(STORE_DIR, { recursive: true });
}

async function readStore(): Promise<ExternalTournamentStandingsOverrideStore> {
    try {
        const raw = await readFile(STORE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as ExternalTournamentStandingsOverrideStore : {};
    } catch {
        return {};
    }
}

async function writeStore(store: ExternalTournamentStandingsOverrideStore) {
    await ensureStoreDir();
    await writeFile(STORE_PATH, JSON.stringify(store, null, 2), 'utf-8');
}

function normalizeGroups(rawGroups: unknown): ExternalTournamentStandingsGroup[] {
    if (!Array.isArray(rawGroups)) return [];

    const seen = new Set<string>();
    const normalized: ExternalTournamentStandingsGroup[] = [];

    rawGroups.forEach((rawGroup, index) => {
        if (!rawGroup || typeof rawGroup !== 'object') return;

        const name = normalizeString((rawGroup as any).name) || `Grupo ${index + 1}`;
        const id = normalizeString((rawGroup as any).id) || deriveId(name, 'ext-group');
        if (seen.has(id)) return;

        seen.add(id);
        normalized.push({
            id,
            name,
            order_index: normalizeInteger((rawGroup as any).order_index ?? index),
        });
    });

    return normalized.sort((left, right) => (left.order_index ?? 0) - (right.order_index ?? 0));
}

function normalizeAssignments(
    rawAssignments: unknown,
    validGroupIds: Set<string>,
): ExternalTournamentStandingsAssignment[] {
    if (!Array.isArray(rawAssignments)) return [];

    const normalized: ExternalTournamentStandingsAssignment[] = [];

    rawAssignments.forEach((rawAssignment, index) => {
        if (!rawAssignment || typeof rawAssignment !== 'object') return;

        const rawGroupId = normalizeString((rawAssignment as any).group_id);
        const groupId = rawGroupId && validGroupIds.has(rawGroupId) ? rawGroupId : null;
        const points = normalizeInteger((rawAssignment as any).points);

        const teamId = normalizeString((rawAssignment as any).team_id);
        const teamName = normalizeString((rawAssignment as any).team_name);
        const teamUrl = normalizeTeamUrl((rawAssignment as any).team_url);
        if (!teamId && !teamName && !teamUrl) return;
        if (!groupId && points === null) return;

        normalized.push({
            id: normalizeString((rawAssignment as any).id) || `assignment-${index + 1}`,
            team_id: teamId,
            team_name: teamName,
            team_url: teamUrl,
            group_id: groupId,
            points,
        });
    });

    return normalized;
}

function normalizeLabels(
    rawLabels: unknown,
    validGroupIds: Set<string>,
): ExternalTournamentStandingsLabel[] {
    if (!Array.isArray(rawLabels)) return [];

    const normalized: ExternalTournamentStandingsLabel[] = [];

    rawLabels.forEach((rawLabel, index) => {
        if (!rawLabel || typeof rawLabel !== 'object') return;

        const name = normalizeString((rawLabel as any).name);
        const color = normalizeString((rawLabel as any).color);
        const position = normalizeInteger((rawLabel as any).position);
        const groupId = normalizeString((rawLabel as any).group_id);

        if (!name || !color || !position || position <= 0) return;
        if (groupId && !validGroupIds.has(groupId)) return;

        normalized.push({
            id: normalizeString((rawLabel as any).id) || `label-${index + 1}`,
            name,
            color,
            position,
            group_id: groupId,
        });
    });

    return normalized;
}

export function normalizeExternalTournamentStandingsOverrideRecord(
    record: ExternalTournamentStandingsOverrideRecord,
): ExternalTournamentStandingsOverrideRecord {
    const id = normalizeString(record.id);
    if (!id) {
        throw new Error('Tournament id is required');
    }

    const groups = normalizeGroups(record.groups);
    const validGroupIds = new Set(groups.map((group) => group.id));
    const assignments = normalizeAssignments(record.assignments, validGroupIds);
    const labels = normalizeLabels(record.labels, validGroupIds);

    return {
        id,
        source: normalizeString(record.source) || 'external-api',
        groups,
        assignments,
        labels,
        updated_at: new Date().toISOString(),
    };
}

function mapDatabaseStandingsOverride(
    row: Record<string, unknown> | null | undefined,
): ExternalTournamentStandingsOverrideRecord | null {
    if (!row) return null;

    const id = normalizeString(row.id);
    if (!id) return null;

    const groups = normalizeGroups(row.groups);
    const validGroupIds = new Set(groups.map((group) => group.id));

    return {
        id,
        source: normalizeString(row.source) || 'external-api',
        groups,
        assignments: normalizeAssignments(row.assignments, validGroupIds),
        labels: normalizeLabels(row.labels, validGroupIds),
        updated_at: normalizeString(row.updated_at),
    };
}

function buildDatabaseOverrideLookup(
    records: ExternalTournamentStandingsOverrideRecord[],
): Map<string, ExternalTournamentStandingsOverrideRecord> {
    const lookup = new Map<string, ExternalTournamentStandingsOverrideRecord>();

    records.forEach((record) => {
        buildExternalTournamentOverrideCandidates(record.id).forEach((candidate) => {
            const key = candidate.toLowerCase();
            if (!lookup.has(key)) {
                lookup.set(key, record);
            }
        });
    });

    return lookup;
}

function findDatabaseOverrideByCandidates(
    lookup: Map<string, ExternalTournamentStandingsOverrideRecord>,
    candidates: string[],
): ExternalTournamentStandingsOverrideRecord | null {
    for (const candidate of candidates) {
        const record = lookup.get(candidate.toLowerCase());
        if (record) return record;
    }

    return null;
}

function findStoredOverrideByCandidates(
    store: ExternalTournamentStandingsOverrideStore,
    candidates: string[],
): ExternalTournamentStandingsOverrideRecord | null {
    for (const candidate of candidates) {
        const direct = store[candidate];
        if (direct) return direct;
    }

    const entries = Object.entries(store);
    for (const candidate of candidates) {
        const lowered = candidate.toLowerCase();
        const found = entries.find(([key]) => key.toLowerCase() === lowered);
        if (found) return found[1];
    }

    return null;
}

async function getDatabaseExternalTournamentStandingsOverrides(
    candidateIds: string[],
): Promise<ExternalTournamentStandingsOverrideRecord[]> {
    if (candidateIds.length === 0) return [];

    try {
        const readClient = await getReadClient();
        const client = readClient as unknown as MinimalReadClient;
        const { data, error } = await client
            .from('external_tournament_standings_overrides')
            .select(STANDINGS_OVERRIDE_SELECT)
            .in('id', candidateIds);

        if (error || !Array.isArray(data)) return [];

        return data
            .map((row: Record<string, unknown>) => mapDatabaseStandingsOverride(row))
            .filter((record: ExternalTournamentStandingsOverrideRecord | null): record is ExternalTournamentStandingsOverrideRecord => record !== null);
    } catch {
        return [];
    }
}

export async function getExternalTournamentStandingsOverride(
    id: string,
): Promise<ExternalTournamentStandingsOverrideRecord | null> {
    const candidates = buildExternalTournamentOverrideCandidates(id);
    if (candidates.length === 0) return null;

    const [store, databaseOverrides] = await Promise.all([
        readStore(),
        getDatabaseExternalTournamentStandingsOverrides(candidates),
    ]);

    const databaseLookup = buildDatabaseOverrideLookup(databaseOverrides);

    return (
        findDatabaseOverrideByCandidates(databaseLookup, candidates) ||
        findStoredOverrideByCandidates(store, candidates)
    );
}

export async function upsertExternalTournamentStandingsOverride(
    record: ExternalTournamentStandingsOverrideRecord,
): Promise<ExternalTournamentStandingsOverrideRecord> {
    const normalized = normalizeExternalTournamentStandingsOverrideRecord(record);
    const store = await readStore();

    for (const candidate of buildExternalTournamentOverrideCandidates(normalized.id)) {
        if (store[candidate]) delete store[candidate];
    }

    store[normalized.id] = normalized;
    await writeStore(store);

    return normalized;
}

function buildAssignmentLookup(
    assignments: ExternalTournamentStandingsAssignment[],
): Map<string, ExternalTournamentStandingsAssignment> {
    const lookup = new Map<string, ExternalTournamentStandingsAssignment>();

    assignments.forEach((assignment) => {
        buildTeamIdentityKeys(assignment).forEach((key) => {
            if (!lookup.has(key)) {
                lookup.set(key, assignment);
            }
        });
    });

    return lookup;
}

function resolveAssignmentForRow(
    row: any,
    assignmentLookup: Map<string, ExternalTournamentStandingsAssignment>,
): ExternalTournamentStandingsAssignment | null {
    const keys = buildTeamIdentityKeys({
        team_id: getStandingsTeamId(row),
        team_name: getStandingsTeamName(row),
        team_url: getStandingsTeamUrl(row),
    });

    for (const key of keys) {
        const assignment = assignmentLookup.get(key);
        if (assignment) return assignment;
    }

    return null;
}

function resolveAssignedGroupId(
    row: any,
    assignmentLookup: Map<string, ExternalTournamentStandingsAssignment>,
    validGroupIds: Set<string>,
): string | null {
    const assignment = resolveAssignmentForRow(row, assignmentLookup);
    const groupId = normalizeString(assignment?.group_id);
    if (groupId && validGroupIds.has(groupId)) return groupId;

    const existingGroupId = normalizeString(row?.group_id);
    if (existingGroupId && validGroupIds.has(existingGroupId)) return existingGroupId;

    return null;
}

function applyRowAssignmentOverrides(
    row: any,
    assignmentLookup: Map<string, ExternalTournamentStandingsAssignment>,
) {
    const assignment = resolveAssignmentForRow(row, assignmentLookup);
    const pointsAdjustment = normalizeInteger(assignment?.points);

    if (pointsAdjustment === null) return row;

    const basePoints =
        normalizeInteger(row?.points_total ?? row?.total_points ?? row?.points ?? row?.pts) ?? 0;
    const nextPoints = basePoints + pointsAdjustment;

    return {
        ...row,
        points: nextPoints,
        pts: nextPoints,
        points_total: nextPoints,
        total_points: nextPoints,
        points_adjustment: pointsAdjustment,
        points_delta: pointsAdjustment,
        points_original: basePoints,
    };
}

function applyAssignmentsToPreparedStandings(
    rows: any[],
    assignmentLookup: Map<string, ExternalTournamentStandingsAssignment>,
): any[] {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    if (!isGroupedStandings(rows)) {
        return rankStandingsRows(
            rows.map((row: any, index: number) => ({
                ...applyRowAssignmentOverrides(row, assignmentLookup),
                __original_position: normalizeInteger(row?.__original_position ?? row?.position) ?? index + 1,
            })),
        );
    }

    return rows.map((group: any) => ({
        ...group,
        rows: rankStandingsRows(
            Array.isArray(group?.rows)
                ? group.rows.map((row: any, rowIndex: number) => ({
                    ...applyRowAssignmentOverrides(row, assignmentLookup),
                    __original_position: normalizeInteger(row?.__original_position ?? row?.position) ?? rowIndex + 1,
                }))
                : [],
        ),
    }));
}

function parseGoalsPair(value: unknown) {
    const raw = normalizeString(value);
    if (!raw) return null;

    const match = raw.match(/(-?\d+)\s*[:\-]\s*(-?\d+)/);
    if (!match) return null;

    return {
        scored: Number(match[1]),
        conceded: Number(match[2]),
    };
}

function getRowPoints(row: any) {
    return normalizeInteger(row?.points_total ?? row?.total_points ?? row?.points ?? row?.pts) ?? 0;
}

function getRowGoalsFor(row: any) {
    const direct =
        normalizeInteger(row?.goals_for ?? row?.scored ?? row?.for) ??
        parseGoalsPair(row?.goals)?.scored;

    return direct ?? 0;
}

function getRowGoalsAgainst(row: any) {
    const direct =
        normalizeInteger(row?.goals_against ?? row?.conceded ?? row?.against) ??
        parseGoalsPair(row?.goals)?.conceded;

    return direct ?? 0;
}

function getRowGoalDifference(row: any) {
    const direct = normalizeInteger(row?.goal_difference ?? row?.difference ?? row?.goalDiff);
    if (direct !== null) return direct;

    return getRowGoalsFor(row) - getRowGoalsAgainst(row);
}

function rankStandingsRows(rows: any[]) {
    return [...rows]
        .sort((left, right) => {
            const pointsDiff = getRowPoints(right) - getRowPoints(left);
            if (pointsDiff !== 0) return pointsDiff;

            const goalDifferenceDiff = getRowGoalDifference(right) - getRowGoalDifference(left);
            if (goalDifferenceDiff !== 0) return goalDifferenceDiff;

            const goalsForDiff = getRowGoalsFor(right) - getRowGoalsFor(left);
            if (goalsForDiff !== 0) return goalsForDiff;

            return (left.__original_position || 0) - (right.__original_position || 0);
        })
        .map((row, index) => ({
            ...row,
            position: index + 1,
        }));
}

function buildSyntheticTeamLabels(
    tournamentId: string,
    labels: ExternalTournamentStandingsLabel[],
    updatedAt: string | null | undefined,
) {
    return labels.map((label) => ({
        id: `${tournamentId}:${label.id}`,
        label_id: label.id,
        club_id: null,
        position: label.position,
        tournament_id: tournamentId,
        phase_id: null,
        group_id: label.group_id ?? null,
        created_at: updatedAt ?? null,
        label: {
            id: label.id,
            name: label.name,
            color: label.color,
            scope: 'standings',
        },
    }));
}

export function applyExternalTournamentStandingsOverride(
    standings: any,
    override: ExternalTournamentStandingsOverrideRecord | null | undefined,
): { standings: any[]; teamLabels: any[] } {
    const preparedStandings = ensureStandingsGroupMetadata(Array.isArray(standings) ? standings : []);
    if (!override) {
        return {
            standings: preparedStandings,
            teamLabels: [],
        };
    }

    const groups = Array.isArray(override.groups) ? override.groups : [];
    const labels = Array.isArray(override.labels) ? override.labels : [];
    const assignments = Array.isArray(override.assignments) ? override.assignments : [];
    const teamLabels = buildSyntheticTeamLabels(override.id, labels, override.updated_at);
    const assignmentLookup = buildAssignmentLookup(assignments);

    if (groups.length === 0) {
        return {
            standings: applyAssignmentsToPreparedStandings(preparedStandings, assignmentLookup),
            teamLabels,
        };
    }

    const validGroupIds = new Set(groups.map((group) => group.id));
    const flatRows = flattenPreparedStandings(preparedStandings);
    if (flatRows.length === 0) {
        return {
            standings: preparedStandings,
            teamLabels,
        };
    }

    const groupedRows = new Map<string, any[]>();
    groups.forEach((group) => {
        groupedRows.set(group.id, []);
    });

    const leftovers: any[] = [];

    flatRows.forEach((row: any, index: number) => {
        const groupId = resolveAssignedGroupId(row, assignmentLookup, validGroupIds);
        const normalizedRow = {
            ...applyRowAssignmentOverrides(row, assignmentLookup),
            __original_position: normalizeInteger(row?.__original_position ?? row?.position) ?? index + 1,
            group_id: groupId,
        };

        if (groupId && groupedRows.has(groupId)) {
            groupedRows.get(groupId)!.push(normalizedRow);
            return;
        }

        leftovers.push(normalizedRow);
    });

    const groupedStandings = groups
        .map((group) => ({
            group_id: group.id,
            group_name: group.name,
            rows: rankStandingsRows(groupedRows.get(group.id) || [])
                .map((row) => ({
                    ...row,
                    group_id: group.id,
                })),
        }))
        .filter((group) => group.rows.length > 0);

    if (leftovers.length > 0) {
        groupedStandings.push({
            group_id: UNGROUPED_GROUP_ID,
            group_name: 'Sin grupo',
            rows: rankStandingsRows(leftovers)
                .map((row) => ({
                    ...row,
                    group_id: UNGROUPED_GROUP_ID,
                })),
        });
    }

    return {
        standings: groupedStandings.length > 0 ? groupedStandings : preparedStandings,
        teamLabels,
    };
}
