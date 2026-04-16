'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Plus, Save, ShieldAlert, Trash2 } from 'lucide-react';
import LogoUploader from '@/components/LogoUploader';
import { useAuth } from '@/context/AuthContext';
import { isGlobalAdminRole } from '@/lib/auth/roles';
import { getTournamentCountryOptions, resolveTournamentCountryId, resolveTournamentCountryLabel } from '@/lib/data/countries';
import { isBlockedTournamentId } from '@/lib/utils/blockedTournaments';

type ExternalTournamentPayload = {
    id: string;
    source?: string | null;
    name?: string | null;
    display_name?: string | null;
    logo_url?: string | null;
    sport?: string | null;
    country?: string | null;
    country_id?: string | null;
    url?: string | null;
    priority?: number | null;
};

type ExternalStandingsGroup = {
    id: string;
    name: string;
    order_index?: number | null;
};

type ExternalStandingsAssignment = {
    id: string;
    team_id?: string | null;
    team_name?: string | null;
    team_url?: string | null;
    group_id?: string | null;
    points?: number | null;
};

type ExternalStandingsLabel = {
    id: string;
    name: string;
    color: string;
    position: number;
    positions_input?: string;
    group_id?: string | null;
};

type ExternalStandingsPayload = {
    id: string;
    source?: string | null;
    groups: ExternalStandingsGroup[];
    assignments: ExternalStandingsAssignment[];
    labels: ExternalStandingsLabel[];
};

type ExternalStandingsTable = ExternalStandingsPayload & {
    key: string;
    name: string;
    source_key?: string | null;
    order_index?: number | null;
    builtIn?: boolean;
};

type ExternalStandingsEditorPayload = {
    id: string;
    source?: string | null;
    tables: ExternalStandingsTable[];
};

type ApiStandingsTable = {
    key: string;
    name: string;
    sourceKey: string;
    rows: StandingsPreviewRow[];
    builtIn: boolean;
};

type ApiResponseEnvelope = {
    ok?: boolean;
    error?: string;
    [key: string]: unknown;
} | null;

type ExternalApiRecord = Record<string, unknown>;

type StandingsPreviewRow = {
    id: string;
    name: string;
    teamId: string | null;
    teamUrl: string | null;
    logo: string | null;
    position: number | null;
    points: number | null;
    groupId: string | null;
    groupName: string | null;
};

const BUILTIN_STANDINGS_TABLES = [
    { key: 'standings', name: 'Tabla general' },
    { key: 'luckyLoser', name: 'Lucky Loser' },
    { key: 'standingsForm', name: 'Forma' },
    { key: 'standingsOverUnder', name: 'Over/Under' },
    { key: 'standingsHtFt', name: 'HT/FT' },
] as const;

function normalizeString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
}

function normalizeInteger(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return Math.trunc(parsed);
    }
    return null;
}

function normalizeCountryFormValue(country: unknown, countryId: unknown) {
    const rawCountry = normalizeString(country);
    const rawCountryId = normalizeString(countryId);
    const resolvedCountryId = resolveTournamentCountryId(rawCountryId || rawCountry) || rawCountryId || '';
    const resolvedCountry =
        resolveTournamentCountryLabel(resolvedCountryId || rawCountry) ||
        rawCountry ||
        '';

    return {
        country: resolvedCountry,
        country_id: resolvedCountryId,
    };
}

function asRecord(value: unknown): ExternalApiRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as ExternalApiRecord
        : null;
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

function stripLabelPositionSuffix(value: string | null | undefined) {
    const normalized = normalizeString(value);
    if (!normalized) return null;
    return normalized.replace(/__p\d+$/i, '');
}

function parseLabelPositions(value: unknown, fallback?: number | null): number[] {
    const raw = typeof value === 'string' ? value : String(value ?? '');
    const parts = raw
        .split(',')
        .map((part) => normalizeInteger(part))
        .filter((position): position is number => typeof position === 'number' && position > 0);

    const unique = [...new Set(parts)];
    if (unique.length > 0) return unique.sort((left, right) => left - right);

    if (typeof fallback === 'number' && Number.isFinite(fallback) && fallback > 0) {
        return [Math.trunc(fallback)];
    }

    return [1];
}

function formatLabelPositions(positions: number[]) {
    return positions.join(', ');
}

function getBuiltinTableName(key: string) {
    return BUILTIN_STANDINGS_TABLES.find((table) => table.key === key)?.name || null;
}

function normalizeStandingsTableKey(value: unknown, index: number) {
    const raw = normalizeString(value);
    if (!raw) return `custom-table-${index + 1}`;

    const builtin = BUILTIN_STANDINGS_TABLES.find((table) => table.key === raw);
    if (builtin) return builtin.key;

    const slug = slugify(raw);
    return slug ? `custom-${slug}` : `custom-table-${index + 1}`;
}

function normalizeStandingsTableName(key: string, value: unknown, index: number) {
    return normalizeString(value) || getBuiltinTableName(key) || `Tabla ${index + 1}`;
}

function normalizeStandingsTableSourceKey(value: unknown) {
    const raw = normalizeString(value);
    if (!raw) return 'standings';
    return BUILTIN_STANDINGS_TABLES.some((table) => table.key === raw) ? raw : 'standings';
}

function normalizeEditorTable(table: Partial<ExternalStandingsTable>, index: number): ExternalStandingsTable {
    const key = normalizeStandingsTableKey(table.key, index);

    return {
        id: normalizeString(table.id) || `${key}-${index + 1}`,
        key,
        name: normalizeStandingsTableName(key, table.name, index),
        source: normalizeString(table.source) || 'external-api',
        source_key: normalizeStandingsTableSourceKey(table.source_key ?? key),
        groups: Array.isArray(table.groups) ? table.groups : [],
        assignments: Array.isArray(table.assignments) ? table.assignments : [],
        labels: normalizeEditorLabels(Array.isArray(table.labels) ? table.labels : []),
        order_index: normalizeInteger(table.order_index ?? index) ?? index,
        builtIn: BUILTIN_STANDINGS_TABLES.some((entry) => entry.key === key),
    };
}

function ensureEditorTables(
    tables: ExternalStandingsTable[],
    apiTables: ApiStandingsTable[],
    tournamentId: string,
): ExternalStandingsTable[] {
    const merged = new Map<string, ExternalStandingsTable>();
    const sourceKeysWithRows = new Set(
        apiTables
            .filter((table) => table.rows.length > 0)
            .map((table) => table.key),
    );

    const normalizedExisting = tables.map((table, index) => normalizeEditorTable(table, index));

    BUILTIN_STANDINGS_TABLES.forEach((table, index) => {
        const existing = normalizedExisting.find((entry) => entry.key === table.key);
        if (existing) {
            merged.set(table.key, { ...existing, builtIn: true, order_index: index });
            return;
        }

        if (table.key !== 'standings' && !sourceKeysWithRows.has(table.key)) {
            return;
        }

        merged.set(table.key, {
            id: `${tournamentId}:${table.key}`,
            key: table.key,
            name: table.name,
            source: 'external-api',
            source_key: table.key,
            groups: [],
            assignments: [],
            labels: [],
            order_index: index,
            builtIn: true,
        });
    });

    normalizedExisting
        .filter((table) => !merged.has(table.key))
        .forEach((table, index) => {
            merged.set(table.key, {
                ...table,
                order_index: BUILTIN_STANDINGS_TABLES.length + index,
            });
        });

    return [...merged.values()].sort((left, right) => (left.order_index ?? 0) - (right.order_index ?? 0));
}

function normalizeEditorLabels(labels: ExternalStandingsLabel[]): ExternalStandingsLabel[] {
    const grouped = new Map<string, ExternalStandingsLabel & { __positions: number[] }>();

    labels.forEach((label, index) => {
        const name = normalizeString(label.name);
        const color = normalizeString(label.color);
        if (!name || !color) return;

        const baseId = stripLabelPositionSuffix(label.id) || `label-${index + 1}`;
        const groupId = normalizeString(label.group_id);
        const positions = parseLabelPositions(label.positions_input ?? label.position, label.position);
        const key = `${baseId}:${name}:${color}:${groupId || 'global'}`;

        const existing = grouped.get(key);
        if (existing) {
            existing.__positions = [...new Set([...existing.__positions, ...positions])].sort((left, right) => left - right);
            existing.position = existing.__positions[0] || existing.position;
            existing.positions_input = formatLabelPositions(existing.__positions);
            return;
        }

        grouped.set(key, {
            id: baseId,
            name,
            color,
            position: positions[0] || 1,
            positions_input: formatLabelPositions(positions),
            group_id: groupId,
            __positions: positions,
        });
    });

    return [...grouped.values()]
        .sort((left, right) => {
            if (left.position !== right.position) return left.position - right.position;
            return left.name.localeCompare(right.name);
        })
        .map((label) => {
            const { __positions, ...nextLabel } = label;
            void __positions;
            return nextLabel;
        });
}

function expandLabelsForSave(labels: ExternalStandingsLabel[]): ExternalStandingsLabel[] {
    const expanded: ExternalStandingsLabel[] = [];

    labels.forEach((label, index) => {
        const name = normalizeString(label.name);
        const color = normalizeString(label.color);
        if (!name || !color) return;

        const baseId = stripLabelPositionSuffix(label.id) || `label-${index + 1}`;
        const positions = parseLabelPositions(label.positions_input ?? label.position, label.position);

        positions.forEach((position) => {
            expanded.push({
                id: positions.length === 1 ? baseId : `${baseId}__p${position}`,
                name,
                color,
                position,
                group_id: normalizeString(label.group_id),
            });
        });
    });

    return expanded;
}

function isGroupedStandings(rows: unknown[]): boolean {
    const firstRow = asRecord(rows[0]);
    return Array.isArray(rows) && rows.length > 0 && Array.isArray(firstRow?.rows);
}

function getStandingsTeamName(row: unknown) {
    const record = asRecord(row);
    const team = asRecord(record?.team);
    const participant = asRecord(record?.participant);

    return normalizeString(team?.name) ||
        normalizeString(participant?.name) ||
        normalizeString(record?.team_name) ||
        normalizeString(record?.name) ||
        'Equipo';
}

function getStandingsTeamId(row: unknown) {
    const record = asRecord(row);
    const team = asRecord(record?.team);
    const participant = asRecord(record?.participant);

    return normalizeString(team?.id || team?.team_id || participant?.id || record?.team_id);
}

function getStandingsTeamUrl(row: unknown) {
    const record = asRecord(row);
    const team = asRecord(record?.team);
    const participant = asRecord(record?.participant);

    return normalizeString(team?.team_url || participant?.team_url || record?.team_url);
}

function getStandingsTeamLogo(row: unknown) {
    const record = asRecord(row);
    const team = asRecord(record?.team);
    const participant = asRecord(record?.participant);

    return normalizeString(
        team?.logo ||
        team?.image_path ||
        participant?.logo ||
        participant?.image_path ||
        record?.team_logo ||
        record?.logo
    );
}

function buildRowIdentity(row: unknown, index: number) {
    const teamId = getStandingsTeamId(row);
    const teamUrl = getStandingsTeamUrl(row);
    const teamName = getStandingsTeamName(row);

    if (teamId) return `team:${teamId.toLowerCase()}`;
    if (teamUrl) return `url:${teamUrl.toLowerCase()}`;
    return `name:${slugify(teamName || `row-${index + 1}`) || `row-${index + 1}`}`;
}

function buildPreviewRows(standings: unknown[]): StandingsPreviewRow[] {
    if (!Array.isArray(standings)) return [];

    if (!isGroupedStandings(standings)) {
        return standings.map((row, index: number) => {
            const record = asRecord(row);

            return {
                id: buildRowIdentity(row, index),
                name: getStandingsTeamName(row),
                teamId: getStandingsTeamId(row),
                teamUrl: getStandingsTeamUrl(row),
                logo: getStandingsTeamLogo(row),
                position: normalizeInteger(record?.position),
                points: normalizeInteger(record?.points_total ?? record?.total_points ?? record?.points ?? record?.pts),
                groupId: normalizeString(record?.group_id),
                groupName: null,
            };
        });
    }

    return standings.flatMap((group, groupIndex: number) => {
        const groupRecord = asRecord(group);
        const groupName = normalizeString(groupRecord?.group_name) || `Grupo ${groupIndex + 1}`;
        const groupId = normalizeString(groupRecord?.group_id) || `ext-group-${slugify(groupName) || groupIndex + 1}`;
        const groupRows: unknown[] = Array.isArray(groupRecord?.rows) ? groupRecord.rows : [];

        return groupRows
            .map((row, rowIndex: number) => {
                const record = asRecord(row);

                return {
                    id: buildRowIdentity(row, rowIndex),
                    name: getStandingsTeamName(row),
                    teamId: getStandingsTeamId(row),
                    teamUrl: getStandingsTeamUrl(row),
                    logo: getStandingsTeamLogo(row),
                    position: normalizeInteger(record?.position),
                    points: normalizeInteger(record?.points_total ?? record?.total_points ?? record?.points ?? record?.pts),
                    groupId: normalizeString(record?.group_id) || groupId,
                    groupName,
                };
            });
    });
}

function ensureUniquePreviewRowIds(rows: StandingsPreviewRow[]) {
    const duplicates = new Map<string, number>();

    rows.forEach((row) => {
        duplicates.set(row.id, (duplicates.get(row.id) || 0) + 1);
    });

    return rows.map((row, index) => {
        if ((duplicates.get(row.id) || 0) <= 1) {
            return row;
        }

        const groupScope = slugify(row.groupId || row.groupName || '') || 'global';
        const positionScope = typeof row.position === 'number' ? `pos-${row.position}` : `row-${index + 1}`;

        return {
            ...row,
            id: `${row.id}:group:${groupScope}:${positionScope}:${index + 1}`,
        };
    });
}

function splitPreviewRowsByDuplicateKey(rows: StandingsPreviewRow[]) {
    const seen = new Map<string, number>();
    const primaryRows: StandingsPreviewRow[] = [];
    const luckyLoserRows: StandingsPreviewRow[] = [];

    rows.forEach((row) => {
        const currentCount = seen.get(row.id) || 0;
        seen.set(row.id, currentCount + 1);

        if (currentCount === 0) {
            primaryRows.push(row);
            return;
        }

        luckyLoserRows.push({
            ...row,
            id: `${row.id}:lucky-loser:${currentCount}`,
        });
    });

    return {
        primaryRows: ensureUniquePreviewRowIds(primaryRows),
        luckyLoserRows: ensureUniquePreviewRowIds(luckyLoserRows),
    };
}

function extractPreviewRows(standings: unknown[]): StandingsPreviewRow[] {
    return ensureUniquePreviewRowIds(buildPreviewRows(standings));
}

function extractStandingsRows(standings: unknown[]) {
    return splitPreviewRowsByDuplicateKey(buildPreviewRows(standings));
}

function deriveGroupsFromRows(rows: StandingsPreviewRow[]): ExternalStandingsGroup[] {
    const groups = new Map<string, ExternalStandingsGroup>();

    rows.forEach((row) => {
        const normalizedGroupId = normalizeString(row.groupId);
        const normalizedGroupName = normalizeString(row.groupName);
        if (!normalizedGroupId && !normalizedGroupName) return;

        const id = normalizedGroupId || `ext-group-${slugify(normalizedGroupName || '') || groups.size + 1}`;
        if (groups.has(id)) return;

        groups.set(id, {
            id,
            name: normalizedGroupName || `Grupo ${groups.size + 1}`,
            order_index: groups.size,
        });
    });

    return [...groups.values()];
}

function deriveAssignments(rows: StandingsPreviewRow[]): ExternalStandingsAssignment[] {
    return rows
        .filter((row) => row.groupId)
        .map((row) => ({
            id: row.id,
            team_id: row.teamId,
            team_name: row.name,
            team_url: row.teamUrl,
            group_id: row.groupId,
        }));
}

function deriveLabels(teamLabels: unknown[]): ExternalStandingsLabel[] {
    if (!Array.isArray(teamLabels)) return [];

    return normalizeEditorLabels(
        teamLabels.flatMap((rawRecord, index: number) => {
            const record = asRecord(rawRecord);
            const labelValue = record?.label;
            const rawLabel = Array.isArray(labelValue) ? labelValue[0] : labelValue;
            const label = asRecord(rawLabel);
            const name = normalizeString(label?.name);
            const color = normalizeString(label?.color);
            const position = normalizeInteger(record?.position);
            const groupId = normalizeString(record?.group_id);
            if (!name || !color || !position) return [];

            return [{
                id: normalizeString(record?.label_id) || normalizeString(label?.id) || `label-${index + 1}`,
                name,
                color,
                position,
                positions_input: String(position),
                group_id: groupId,
            }];
        }),
    );
}

function buildApiTablesFromPayload(payload: ExternalApiRecord | null | undefined): ApiStandingsTable[] {
    const standingsRows = extractStandingsRows(Array.isArray(payload?.standings) ? payload.standings as unknown[] : []);
    const candidates: ApiStandingsTable[] = BUILTIN_STANDINGS_TABLES.map((table) => ({
        key: table.key,
        name: table.name,
        sourceKey: table.key,
        rows:
            table.key === 'standings'
                ? standingsRows.primaryRows
                : table.key === 'luckyLoser'
                    ? standingsRows.luckyLoserRows
                    : extractPreviewRows(Array.isArray(payload?.[table.key]) ? payload?.[table.key] as unknown[] : []),
        builtIn: true,
    }));

    const rawCustomTables = Array.isArray(payload?.customStandingsTables) ? payload?.customStandingsTables as unknown[] : [];
    const customTables = rawCustomTables.flatMap((rawTable, index) => {
        const record = asRecord(rawTable);
        if (!record) return [];

        const key = normalizeStandingsTableKey(record.key, index);
        return [{
            key,
            name: normalizeStandingsTableName(key, record.name, index),
            sourceKey: normalizeStandingsTableSourceKey(record.source_key),
            rows: extractPreviewRows(Array.isArray(record.standings) ? record.standings : []),
            builtIn: false,
        }];
    });

    return [...candidates, ...customTables];
}

async function readApiEnvelope(response: Response): Promise<{ payload: ApiResponseEnvelope; text: string }> {
    const text = await response.text().catch(() => '');

    if (!text) {
        return { payload: null, text: '' };
    }

    try {
        return {
            payload: JSON.parse(text) as ApiResponseEnvelope,
            text,
        };
    } catch {
        return {
            payload: null,
            text,
        };
    }
}

export default function ExternalTournamentOverridePage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user, isLoading: authLoading } = useAuth();
    const tournamentId = String(params?.id || '').trim();
    const publicTournamentId = tournamentId.toLowerCase().startsWith('fs-') ? tournamentId : `fs-${tournamentId}`;
    const isExactSuperAdmin = isGlobalAdminRole(user?.role);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [viewportWidth, setViewportWidth] = useState(0);
    const [apiTables, setApiTables] = useState<ApiStandingsTable[]>([]);
    const [activeTableId, setActiveTableId] = useState<string>('standings');
    const [form, setForm] = useState<ExternalTournamentPayload>({
        id: tournamentId,
        source: searchParams.get('source') || 'flashscore',
        name: searchParams.get('name') || searchParams.get('display_name') || '',
        display_name: searchParams.get('display_name') || searchParams.get('name') || '',
        logo_url: searchParams.get('logo_url') || '',
        sport: searchParams.get('sport') || 'rugby',
        country: searchParams.get('country') || '',
        country_id: searchParams.get('country_id') || '',
        url: searchParams.get('url') || '',
        priority: normalizeInteger(searchParams.get('priority')) ?? 0,
    });
    const [standingsEditor, setStandingsEditor] = useState<ExternalStandingsEditorPayload>({
        id: tournamentId,
        source: 'external-api',
        tables: [],
    });

    const returnTo = searchParams.get('returnTo') || `/tournaments/${publicTournamentId}`;
    const searchParamsKey = searchParams.toString();
    const baseCountryOptions = useMemo(() => getTournamentCountryOptions(), []);
    const countryOptions = useMemo(() => {
        const normalizedId = normalizeCountryFormValue(form.country, form.country_id).country_id;
        if (!normalizedId) return baseCountryOptions;

        const existing = baseCountryOptions.find((option) => option.id === normalizedId);
        if (existing) return baseCountryOptions;

        return [
            {
                id: normalizedId,
                label: form.country || normalizedId,
            },
            ...baseCountryOptions,
        ];
    }, [baseCountryOptions, form.country, form.country_id]);
    const selectedCountryOption = useMemo(
        () => countryOptions.find((option) => option.id === form.country_id) || null,
        [countryOptions, form.country_id],
    );
    const activeTable = useMemo(
        () => standingsEditor.tables.find((table) => table.id === activeTableId) || standingsEditor.tables[0] || null,
        [activeTableId, standingsEditor.tables],
    );
    const activeSourceTable = useMemo(
        () => apiTables.find((table) => table.key === (activeTable?.source_key || activeTable?.key || 'standings')) || null,
        [activeTable, apiTables],
    );
    const activeStandingsRows = useMemo(
        () => activeSourceTable?.rows || [],
        [activeSourceTable],
    );
    const isCompactLayout = viewportWidth > 0 && viewportWidth < 700;
    const isMediumLayout = viewportWidth > 0 && viewportWidth < 1080;
    const pagePadding = isCompactLayout ? '20px 14px 56px' : isMediumLayout ? '28px 18px 60px' : '32px 20px 60px';
    const cardPadding = isCompactLayout ? 16 : isMediumLayout ? 20 : 24;
    const mainGridTemplateColumns = isMediumLayout ? 'minmax(0, 1fr)' : 'minmax(0, 1.12fr) minmax(320px, 0.88fr)';
    const tableSelectorColumns = isCompactLayout ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(170px, 220px) auto';
    const standingsRowColumns = isMediumLayout ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(280px, 360px)';
    const labelGridColumns = isCompactLayout
        ? 'minmax(0, 1fr)'
        : isMediumLayout
            ? 'repeat(2, minmax(0, 1fr))'
            : 'minmax(0, 1fr) 140px 130px 180px auto';

    useEffect(() => {
        const updateViewportWidth = () => {
            const nextWidth = Math.round(window.visualViewport?.width || window.innerWidth || 0);
            setViewportWidth(nextWidth);
        };

        updateViewportWidth();
        window.addEventListener('resize', updateViewportWidth);
        window.visualViewport?.addEventListener('resize', updateViewportWidth);

        return () => {
            window.removeEventListener('resize', updateViewportWidth);
            window.visualViewport?.removeEventListener('resize', updateViewportWidth);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        if (authLoading) {
            return;
        }

        if (!isExactSuperAdmin) {
            setLoading(false);
            return;
        }

        async function load() {
            if (!tournamentId) {
                setError('No se encontro el tournament id externo.');
                setLoading(false);
                return;
            }
            if (isBlockedTournamentId(tournamentId)) {
                setError('Este torneo externo esta bloqueado y no se puede editar.');
                setLoading(false);
                return;
            }

            try {
                const publicQuery = new URLSearchParams();
                publicQuery.set('id', tournamentId);
                publicQuery.set('sport', searchParams.get('sport') || 'rugby');
                if (searchParams.get('url')) {
                    publicQuery.set('url', searchParams.get('url') || '');
                }

                const [metaResponse, standingsOverrideResponse, publicResponse] = await Promise.allSettled([
                    fetch(`/api/admin/super/external-tournaments/${encodeURIComponent(tournamentId)}`, {
                        cache: 'no-store',
                    }).then(async (response) => ({
                        ok: response.ok,
                        payload: await response.json().catch(() => null),
                    })),
                    fetch(`/api/admin/super/external-tournaments/${encodeURIComponent(tournamentId)}/standings`, {
                        cache: 'no-store',
                    }).then(async (response) => ({
                        ok: response.ok,
                        payload: await response.json().catch(() => null),
                    })),
                    fetch(`/api/tournaments?${publicQuery.toString()}`, {
                        cache: 'no-store',
                    }).then(async (response) => ({
                        ok: response.ok,
                        payload: await response.json().catch(() => null),
                    })),
                ]);

                if (cancelled) return;

                const nextForm: ExternalTournamentPayload = {
                    id: tournamentId,
                    source: searchParams.get('source') || 'flashscore',
                    name: searchParams.get('name') || searchParams.get('display_name') || '',
                    display_name: searchParams.get('display_name') || searchParams.get('name') || '',
                    logo_url: searchParams.get('logo_url') || '',
                    sport: searchParams.get('sport') || 'rugby',
                    country: searchParams.get('country') || '',
                    country_id: searchParams.get('country_id') || '',
                    url: searchParams.get('url') || '',
                    priority: normalizeInteger(searchParams.get('priority')) ?? 0,
                };
                const initialCountry = normalizeCountryFormValue(nextForm.country, nextForm.country_id);
                nextForm.country = initialCountry.country;
                nextForm.country_id = initialCountry.country_id;

                const nextEditor: ExternalStandingsEditorPayload = {
                    id: tournamentId,
                    source: 'external-api',
                    tables: [],
                };

                let publicTeamLabels: unknown[] = [];
                let publicApiTables: ApiStandingsTable[] = [];

                if (metaResponse.status === 'fulfilled' && metaResponse.value.ok && metaResponse.value.payload?.data) {
                    const externalTournament = metaResponse.value.payload.data as ExternalTournamentPayload;
                    nextForm.source = externalTournament.source || nextForm.source;
                    nextForm.name = externalTournament.display_name || externalTournament.name || nextForm.name;
                    nextForm.display_name = externalTournament.display_name || externalTournament.name || nextForm.display_name;
                    nextForm.logo_url = externalTournament.logo_url || nextForm.logo_url;
                    nextForm.sport = externalTournament.sport || nextForm.sport;
                    const overrideCountry = normalizeCountryFormValue(externalTournament.country, externalTournament.country_id);
                    nextForm.country = overrideCountry.country || nextForm.country;
                    nextForm.country_id = overrideCountry.country_id || nextForm.country_id;
                    nextForm.url = externalTournament.url || nextForm.url;
                    nextForm.priority = normalizeInteger(externalTournament.priority) ?? nextForm.priority ?? 0;
                }

                if (standingsOverrideResponse.status === 'fulfilled' && standingsOverrideResponse.value.ok && standingsOverrideResponse.value.payload?.data) {
                    const override = standingsOverrideResponse.value.payload.data as ExternalStandingsEditorPayload & ExternalStandingsPayload;
                    nextEditor.source = override.source || 'external-api';
                    nextEditor.tables = Array.isArray(override.tables)
                        ? override.tables.map((table, index) => normalizeEditorTable(table, index))
                        : [];
                }

                if (publicResponse.status === 'fulfilled' && publicResponse.value.ok && publicResponse.value.payload?.ok) {
                    const payload = asRecord(publicResponse.value.payload);
                    publicTeamLabels = Array.isArray(payload?.teamLabels) ? payload.teamLabels : [];
                    publicApiTables = buildApiTablesFromPayload(payload);

                    const details = asRecord(payload?.details);
                    const detailsName =
                        normalizeString(details?.display_name) ||
                        normalizeString(details?.name) ||
                        normalizeString(details?.league_name) ||
                        normalizeString(asRecord(details?.competition)?.name);
                    const detailsLogo =
                        normalizeString(details?.logo_url) ||
                        normalizeString(details?.image_path) ||
                        normalizeString(details?.logo) ||
                        normalizeString(details?.tournament_logo) ||
                        normalizeString(details?.tournament_image_path);

                    nextForm.name = nextForm.name || detailsName || nextForm.display_name;
                    nextForm.display_name = nextForm.display_name || detailsName || nextForm.name;
                    nextForm.logo_url = nextForm.logo_url || detailsLogo || '';
                    nextForm.url = nextForm.url || normalizeString(details?.url) || '';
                    nextForm.priority = normalizeInteger(nextForm.priority) ?? normalizeInteger(details?.priority) ?? 0;
                    const detailsCountry = normalizeCountryFormValue(
                        normalizeString(asRecord(details?.country)?.name) || normalizeString(details?.country_name) || normalizeString(details?.country),
                        normalizeString(details?.country_id),
                    );
                    nextForm.country = nextForm.country || detailsCountry.country;
                    nextForm.country_id = nextForm.country_id || detailsCountry.country_id;
                }

                const apiTablesByKey = new Map(publicApiTables.map((table) => [table.key, table]));

                nextEditor.tables = ensureEditorTables(nextEditor.tables, publicApiTables, tournamentId)
                    .map((table, index) => {
                        if (
                            table.groups.length > 0 ||
                            table.assignments.length > 0 ||
                            table.labels.length > 0
                        ) {
                            return {
                                ...table,
                                order_index: index,
                            };
                        }

                        const sourceTable = apiTablesByKey.get(table.source_key || table.key);
                        const sourceRows = sourceTable?.rows || [];
                        if (sourceRows.length === 0) {
                            return {
                                ...table,
                                order_index: index,
                            };
                        }

                        return {
                            ...table,
                            groups: deriveGroupsFromRows(sourceRows),
                            assignments: deriveAssignments(sourceRows),
                            labels: table.key === 'standings' ? deriveLabels(publicTeamLabels) : [],
                            order_index: index,
                        };
                    });

                setForm(nextForm);
                setStandingsEditor(nextEditor);
                setApiTables(publicApiTables);
                setActiveTableId((current) => {
                    const stillExists = nextEditor.tables.some((table) => table.id === current);
                    return stillExists ? current : (nextEditor.tables[0]?.id || 'standings');
                });
            } catch (loadError) {
                if (!cancelled) {
                    const message = loadError instanceof Error ? loadError.message : 'No se pudo cargar el editor externo.';
                    setError(message);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [authLoading, isExactSuperAdmin, searchParams, searchParamsKey, tournamentId]);

    const previewLogo = useMemo(() => form.logo_url || '', [form.logo_url]);

    if (authLoading || loading) {
        return (
            <div style={{ minHeight: '100vh', background: '#06070a', color: '#f5f7fb', display: 'grid', placeItems: 'center' }}>
                Cargando editor de torneo externo...
            </div>
        );
    }

    if (!isExactSuperAdmin) {
        return (
            <div style={{ minHeight: '100vh', background: '#06070a', color: '#f5f7fb', display: 'grid', placeItems: 'center', padding: 24 }}>
                <div style={{ maxWidth: 520, borderRadius: 24, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(18,20,26,0.96)', padding: 28 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                        <ShieldAlert size={22} />
                        <strong>Solo Super Admin</strong>
                    </div>
                    <div style={{ color: '#9aa4b2', lineHeight: 1.6, marginBottom: 20 }}>
                        Este editor esta restringido al rol `super_admin`.
                    </div>
                    <Link href={returnTo} style={{ color: '#6ee7b7', fontWeight: 800 }}>
                        Volver al torneo
                    </Link>
                </div>
            </div>
        );
    }

    async function handleSave() {
        if (!tournamentId) return;

        setSaving(true);
        setSaved(false);
        setError(null);

        try {
            const primaryTable = standingsEditor.tables.find((table) => table.key === 'standings') || standingsEditor.tables[0] || null;
            const [metaResponse, standingsResponse] = await Promise.all([
                fetch(`/api/admin/super/external-tournaments/${encodeURIComponent(tournamentId)}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: form.source || 'flashscore',
                        name: form.display_name || form.name || `External tournament ${tournamentId}`,
                        display_name: form.display_name || form.name || `External tournament ${tournamentId}`,
                        logo_url: form.logo_url || null,
                        sport: form.sport || 'rugby',
                        country: selectedCountryOption?.label || form.country || null,
                        country_id: selectedCountryOption?.id || form.country_id || null,
                        url: form.url || null,
                        priority: normalizeInteger(form.priority) ?? 0,
                    }),
                }),
                fetch(`/api/admin/super/external-tournaments/${encodeURIComponent(tournamentId)}/standings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: standingsEditor.source || 'external-api',
                        groups: primaryTable?.groups || [],
                        assignments: primaryTable?.assignments || [],
                        labels: expandLabelsForSave(primaryTable?.labels || []),
                        tables: standingsEditor.tables.map((table) => {
                            const { builtIn, labels, ...persistedTable } = table;
                            void builtIn;
                            return {
                                ...persistedTable,
                                labels: expandLabelsForSave(labels),
                            };
                        }),
                    }),
                }),
            ]);

            const [metaResult, standingsResult] = await Promise.all([
                readApiEnvelope(metaResponse),
                readApiEnvelope(standingsResponse),
            ]);

            if (!metaResponse.ok) {
                throw new Error(
                    metaResult.payload?.error ||
                    metaResult.text ||
                    `No se pudo guardar el override del torneo. HTTP ${metaResponse.status}.`,
                );
            }
            if (!standingsResponse.ok) {
                throw new Error(
                    standingsResult.payload?.error ||
                    standingsResult.text ||
                    `No se pudo guardar la configuracion editorial de standings. HTTP ${standingsResponse.status}.`,
                );
            }

            setSaved(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar el override del torneo.');
        } finally {
            setSaving(false);
        }
    }

    function updateTable(tableId: string, updater: (table: ExternalStandingsTable) => ExternalStandingsTable) {
        setStandingsEditor((current) => ({
            ...current,
            tables: current.tables.map((table) => table.id === tableId ? updater(table) : table),
        }));
    }

    function addTable() {
        const nextIndex = standingsEditor.tables.filter((table) => !table.builtIn).length + 1;
        const nextTable: ExternalStandingsTable = {
            id: `${tournamentId}:custom:${Date.now()}`,
            key: `custom-${Date.now()}`,
            name: `Nueva tabla ${nextIndex}`,
            source: 'external-api',
            source_key: 'standings',
            groups: [],
            assignments: [],
            labels: [],
            order_index: standingsEditor.tables.length,
            builtIn: false,
        };

        setStandingsEditor((current) => ({
            ...current,
            tables: [...current.tables, nextTable].map((table, index) => ({ ...table, order_index: index })),
        }));
        setApiTables((current) => ([
            ...current,
            {
                key: nextTable.key,
                name: nextTable.name,
                sourceKey: 'standings',
                rows: [],
                builtIn: false,
            },
        ]));
        setActiveTableId(nextTable.id);
    }

    function updateTableMeta(tableId: string, patch: Partial<ExternalStandingsTable>) {
        updateTable(tableId, (table) => ({ ...table, ...patch }));
    }

    function removeTable(tableId: string) {
        const table = standingsEditor.tables.find((entry) => entry.id === tableId);
        if (!table || table.builtIn) return;

        setStandingsEditor((current) => ({
            ...current,
            tables: current.tables
                .filter((entry) => entry.id !== tableId)
                .map((entry, index) => ({ ...entry, order_index: index })),
        }));
        setApiTables((current) => current.filter((entry) => entry.key !== table.key));
        if (activeTableId === tableId) {
            const fallback = standingsEditor.tables.find((entry) => entry.id !== tableId) || null;
            setActiveTableId(fallback?.id || 'standings');
        }
    }

    function getRowGroupValue(row: StandingsPreviewRow) {
        return activeTable?.assignments.find((assignment) => assignment.id === row.id)?.group_id || '';
    }

    function getRowPointsValue(row: StandingsPreviewRow) {
        const points = activeTable?.assignments.find((assignment) => assignment.id === row.id)?.points;
        return typeof points === 'number' && Number.isFinite(points) ? points : '';
    }

    function getRowAdjustedPoints(row: StandingsPreviewRow) {
        const adjustment = activeTable?.assignments.find((assignment) => assignment.id === row.id)?.points;
        const basePoints = row.points ?? 0;
        const normalizedAdjustment =
            typeof adjustment === 'number' && Number.isFinite(adjustment)
                ? adjustment
                : 0;

        return {
            basePoints,
            adjustment: normalizedAdjustment,
            total: basePoints + normalizedAdjustment,
        };
    }

    function updateRowAssignment(row: StandingsPreviewRow, patch: Partial<ExternalStandingsAssignment>) {
        if (!activeTable) return;

        updateTable(activeTable.id, (table) => {
            const existing = table.assignments.find((assignment) => assignment.id === row.id);
            const nextAssignment: ExternalStandingsAssignment = {
                id: row.id,
                team_id: row.teamId,
                team_name: row.name,
                team_url: row.teamUrl,
                group_id: existing?.group_id ?? null,
                points: typeof existing?.points === 'number' && Number.isFinite(existing.points) ? existing.points : null,
                ...patch,
            };
            const assignments = table.assignments.filter((assignment) => assignment.id !== row.id);
            const hasGroup = Boolean(nextAssignment.group_id);
            const hasPoints = typeof nextAssignment.points === 'number' && Number.isFinite(nextAssignment.points);

            if (!hasGroup && !hasPoints) {
                return { ...table, assignments };
            }

            return {
                ...table,
                assignments: [...assignments, nextAssignment],
            };
        });
    }

    function handleRowGroupChange(row: StandingsPreviewRow, groupId: string) {
        updateRowAssignment(row, { group_id: groupId || null });
    }

    function handleRowPointsChange(row: StandingsPreviewRow, rawValue: string) {
        updateRowAssignment(row, {
            points: rawValue.trim() ? normalizeInteger(rawValue) : null,
        });
    }

    function addGroup() {
        if (!activeTable) return;

        updateTable(activeTable.id, (table) => ({
            ...table,
            groups: [
                ...table.groups,
                {
                    id: `ext-group-${Date.now()}-${table.groups.length + 1}`,
                    name: `Grupo ${String.fromCharCode(65 + table.groups.length)}`,
                    order_index: table.groups.length,
                },
            ],
        }));
    }

    function updateGroup(groupId: string, name: string) {
        if (!activeTable) return;

        updateTable(activeTable.id, (table) => ({
            ...table,
            groups: table.groups.map((group) => group.id === groupId ? { ...group, name } : group),
        }));
    }

    function removeGroup(groupId: string) {
        if (!activeTable) return;

        updateTable(activeTable.id, (table) => ({
            ...table,
            groups: table.groups.filter((group) => group.id !== groupId),
            assignments: table.assignments.filter((assignment) => assignment.group_id !== groupId),
            labels: table.labels.filter((label) => label.group_id !== groupId),
        }));
    }

    function addLabel() {
        if (!activeTable) return;

        updateTable(activeTable.id, (table) => ({
            ...table,
            labels: [
                ...table.labels,
                {
                    id: `label-${Date.now()}-${table.labels.length + 1}`,
                    name: 'Nueva etiqueta',
                    color: '#00a365',
                    position: table.labels.length + 1,
                    positions_input: String(table.labels.length + 1),
                    group_id: null,
                },
            ],
        }));
    }

    function updateLabel(labelId: string, patch: Partial<ExternalStandingsLabel>) {
        if (!activeTable) return;

        updateTable(activeTable.id, (table) => ({
            ...table,
            labels: table.labels.map((label) => label.id === labelId ? { ...label, ...patch } : label),
        }));
    }

    function updateLabelPositions(labelId: string, rawValue: string) {
        if (!activeTable) return;

        updateTable(activeTable.id, (table) => ({
            ...table,
            labels: table.labels.map((label) => {
                if (label.id !== labelId) return label;
                const positions = parseLabelPositions(rawValue, label.position);
                return {
                    ...label,
                    position: positions[0] || label.position,
                    positions_input: rawValue,
                };
            }),
        }));
    }

    function normalizeLabelPositionsInput(labelId: string) {
        if (!activeTable) return;

        updateTable(activeTable.id, (table) => ({
            ...table,
            labels: table.labels.map((label) => {
                if (label.id !== labelId) return label;
                const positions = parseLabelPositions(label.positions_input ?? label.position, label.position);
                return {
                    ...label,
                    position: positions[0] || label.position,
                    positions_input: formatLabelPositions(positions),
                };
            }),
        }));
    }

    function removeLabel(labelId: string) {
        if (!activeTable) return;

        updateTable(activeTable.id, (table) => ({
            ...table,
            labels: table.labels.filter((label) => label.id !== labelId),
        }));
    }

    return (
        <div style={{ minHeight: '100vh', background: '#06070a', color: '#f5f7fb', padding: pagePadding }}>
            <div style={{ maxWidth: 1320, margin: '0 auto', width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
                    <div>
                        <Link href={returnTo} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#9aa4b2', marginBottom: 16 }}>
                            <ArrowLeft size={16} />
                            Volver al torneo
                        </Link>
                        <h1 style={{ fontSize: '2rem', fontWeight: 900, marginBottom: 8 }}>Editar torneo externo</h1>
                        <p style={{ color: '#9aa4b2', maxWidth: 620 }}>
                            Panel solo para `super_admin`. El nombre, logo, grupos y etiquetas se reflejan en publico,
                            pero quedan guardados aparte para no afectar las actualizaciones de la API.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => router.push(returnTo)}
                        style={{
                            alignSelf: 'flex-start',
                            background: 'transparent',
                            color: '#9aa4b2',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 999,
                            padding: '10px 16px',
                            cursor: 'pointer',
                            width: isCompactLayout ? '100%' : 'auto',
                            justifyContent: 'center',
                        }}
                    >
                        Cerrar
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: mainGridTemplateColumns, gap: isCompactLayout ? 16 : 24, alignItems: 'start' }}>
                    <section style={{ background: 'rgba(18,20,26,0.94)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: cardPadding }}>
                        <div style={{ display: 'grid', gap: 16 }}>
                            <label style={{ display: 'grid', gap: 8 }}>
                                <span style={{ color: '#9aa4b2', fontSize: 13, fontWeight: 700 }}>Nombre visible</span>
                                <input
                                    value={form.display_name || ''}
                                    onChange={(event) => setForm((prev) => ({
                                        ...prev,
                                        display_name: event.target.value,
                                        name: event.target.value,
                                    }))}
                                    style={{
                                        height: 44,
                                        borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: '#0d1016',
                                        color: '#fff',
                                        padding: '0 14px',
                                    }}
                                />
                            </label>

                            <label style={{ display: 'grid', gap: 8 }}>
                                <span style={{ color: '#9aa4b2', fontSize: 13, fontWeight: 700 }}>Pais del torneo</span>
                                <select
                                    value={form.country_id || ''}
                                    onChange={(event) => {
                                        const nextCountryId = event.target.value;
                                        const nextCountryOption = countryOptions.find((option) => option.id === nextCountryId) || null;
                                        setForm((prev) => ({
                                            ...prev,
                                            country_id: nextCountryId,
                                            country: nextCountryOption?.label || '',
                                        }));
                                    }}
                                    style={{
                                        height: 44,
                                        borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: '#111723',
                                        color: '#fff',
                                        padding: '0 14px',
                                    }}
                                >
                                    <option value="">No especificado</option>
                                    {countryOptions.map((country) => (
                                        <option key={country.id} value={country.id}>
                                            {country.label}
                                        </option>
                                    ))}
                                </select>
                                <span style={{ color: '#6b7280', fontSize: 12 }}>
                                    Este pais se usa para corregir el agrupado y la etiqueta publica del torneo API.
                                </span>
                            </label>

                            <label style={{ display: 'grid', gap: 8 }}>
                                <span style={{ color: '#9aa4b2', fontSize: 13, fontWeight: 700 }}>Prioridad publica</span>
                                <input
                                    type="number"
                                    value={String(form.priority ?? 0)}
                                    onChange={(event) => setForm((prev) => ({
                                        ...prev,
                                        priority: normalizeInteger(event.target.value) ?? 0,
                                    }))}
                                    title="Mayor numero = mas prioridad. Si empatan, se ordenan alfabeticamente."
                                    style={{
                                        height: 44,
                                        borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: '#0d1016',
                                        color: '#fff',
                                        padding: '0 14px',
                                    }}
                                />
                                <span style={{ color: '#6b7280', fontSize: 12 }}>
                                    Mayor numero aparece primero en la vista publica; 0 queda en orden alfabetico.
                                </span>
                            </label>

                            <label style={{ display: 'grid', gap: 8 }}>
                                <span style={{ color: '#9aa4b2', fontSize: 13, fontWeight: 700 }}>Logo URL / Data URL</span>
                                <textarea
                                    value={form.logo_url || ''}
                                    onChange={(event) => setForm((prev) => ({ ...prev, logo_url: event.target.value }))}
                                    rows={5}
                                    placeholder="https://... o data:image/..."
                                    style={{
                                        borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: '#0d1016',
                                        color: '#fff',
                                        padding: 14,
                                        resize: 'vertical',
                                    }}
                                />
                            </label>

                            <LogoUploader
                                currentLogo={previewLogo}
                                onUpload={(logoData) => setForm((prev) => ({ ...prev, logo_url: logoData }))}
                                accentColor="#00a365"
                                label="Subir logo"
                            />

                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={handleSave}
                                    disabled={saving}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 10,
                                        border: 'none',
                                        borderRadius: 999,
                                        padding: '12px 18px',
                                        background: '#00a365',
                                        color: '#04110a',
                                        fontWeight: 800,
                                        cursor: saving ? 'wait' : 'pointer',
                                    }}
                                >
                                    <Save size={16} />
                                    {saving ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setForm((prev) => ({ ...prev, logo_url: '' }))}
                                    style={{
                                        borderRadius: 999,
                                        padding: '12px 18px',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'transparent',
                                        color: '#fff',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Limpiar logo
                                </button>
                            </div>

                            {saved ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#6ee7b7', fontWeight: 700 }}>
                                    <CheckCircle2 size={18} />
                                    Override del torneo guardado.
                                </div>
                            ) : null}
                            {error ? <div style={{ color: '#fca5a5', fontWeight: 700 }}>{error}</div> : null}
                        </div>
                    </section>

                    <section style={{ background: 'rgba(18,20,26,0.94)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: cardPadding }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                            <div>
                                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Tablas API y grupos</div>
                                <div style={{ color: '#9aa4b2', maxWidth: 620 }}>
                                    Cada tabla se configura por separado, como una fase. Elegi la tabla activa, su base API y despues edita grupos, ajustes y etiquetas.
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={addTable}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        borderRadius: 999,
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'transparent',
                                        color: '#fff',
                                        padding: '10px 16px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <Plus size={16} />
                                    Agregar tabla
                                </button>
                                <button
                                    type="button"
                                    onClick={addGroup}
                                    disabled={!activeTable}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        borderRadius: 999,
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        background: 'transparent',
                                        color: '#fff',
                                        padding: '10px 16px',
                                        cursor: activeTable ? 'pointer' : 'not-allowed',
                                        opacity: activeTable ? 1 : 0.5,
                                    }}
                                >
                                    <Plus size={16} />
                                    Agregar grupo
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
                            {standingsEditor.tables.length === 0 ? (
                                <div style={{ color: '#9aa4b2' }}>Sin tablas configuradas.</div>
                            ) : standingsEditor.tables.map((table) => (
                                <div
                                    key={table.id}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: tableSelectorColumns,
                                        gap: 12,
                                        alignItems: 'center',
                                        borderRadius: 16,
                                        border: activeTable?.id === table.id ? '1px solid rgba(110,231,183,0.45)' : '1px solid rgba(255,255,255,0.08)',
                                        background: activeTable?.id === table.id ? 'rgba(12,32,22,0.92)' : '#0d1016',
                                        padding: 12,
                                    }}
                                >
                                    <button
                                        type="button"
                                        onClick={() => setActiveTableId(table.id)}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#fff',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            padding: 0,
                                        }}
                                    >
                                        <div style={{ fontWeight: 800 }}>{table.name}</div>
                                        <div style={{ color: '#9aa4b2', fontSize: 12 }}>
                                            key: {table.key}
                                        </div>
                                    </button>
                                    <select
                                        value={table.source_key || 'standings'}
                                        onChange={(event) => updateTableMeta(table.id, { source_key: event.target.value })}
                                        style={{
                                            height: 40,
                                            borderRadius: 12,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: '#111723',
                                            color: '#fff',
                                            padding: '0 12px',
                                        }}
                                    >
                                        {BUILTIN_STANDINGS_TABLES
                                            .filter((entry) => entry.key === 'standings' || apiTables.some((tableEntry) => tableEntry.key === entry.key && tableEntry.rows.length > 0))
                                            .map((entry) => (
                                                <option key={entry.key} value={entry.key}>
                                                    {entry.name}
                                                </option>
                                            ))}
                                    </select>
                                    {!table.builtIn ? (
                                        <button
                                            type="button"
                                            onClick={() => removeTable(table.id)}
                                            style={{
                                                width: 40,
                                                height: 40,
                                                borderRadius: 12,
                                                border: '1px solid rgba(255,255,255,0.12)',
                                                background: 'transparent',
                                                color: '#fca5a5',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    ) : (
                                        <span style={{ color: '#6ee7b7', fontSize: 11, fontWeight: 800, justifySelf: 'center' }}>BASE</span>
                                    )}
                                </div>
                            ))}
                        </div>

                        {activeTable ? (
                            <label style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
                                <span style={{ color: '#9aa4b2', fontSize: 13, fontWeight: 700 }}>Nombre visible de la tabla activa</span>
                                <input
                                    value={activeTable.name}
                                    onChange={(event) => updateTableMeta(activeTable.id, { name: event.target.value })}
                                    style={{
                                        height: 42,
                                        borderRadius: 12,
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        background: '#0d1016',
                                        color: '#fff',
                                        padding: '0 14px',
                                    }}
                                />
                            </label>
                        ) : null}

                        <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
                            {!activeTable || activeTable.groups.length === 0 ? (
                                <div style={{ color: '#9aa4b2' }}>Sin grupos configurados para esta tabla.</div>
                            ) : activeTable.groups.map((group, index) => (
                                <div key={group.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
                                    <input
                                        value={group.name}
                                        onChange={(event) => updateGroup(group.id, event.target.value)}
                                        aria-label={`Grupo ${index + 1}`}
                                        style={{
                                            height: 42,
                                            borderRadius: 12,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: '#0d1016',
                                            color: '#fff',
                                            padding: '0 14px',
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => removeGroup(group.id)}
                                        style={{
                                            width: 42,
                                            height: 42,
                                            borderRadius: 12,
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            background: 'transparent',
                                            color: '#fca5a5',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'grid', gap: 10 }}>
                            {activeStandingsRows.length === 0 ? (
                                <div style={{ color: '#9aa4b2' }}>No se pudieron cargar filas para la base API seleccionada.</div>
                            ) : activeStandingsRows.map((row) => {
                                const pointsPreview = getRowAdjustedPoints(row);

                                return (
                                    <div
                                        key={row.id}
                                        style={{
                                            display: 'grid',
                                            gridTemplateColumns: standingsRowColumns,
                                            gap: 12,
                                            alignItems: 'center',
                                            borderRadius: 16,
                                            border: '1px solid rgba(255,255,255,0.06)',
                                            background: '#0d1016',
                                            padding: 12,
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                                            <div style={{
                                                width: 34,
                                                height: 34,
                                                borderRadius: 10,
                                                background: 'rgba(255,255,255,0.04)',
                                                border: '1px solid rgba(255,255,255,0.06)',
                                                display: 'grid',
                                                placeItems: 'center',
                                                overflow: 'hidden',
                                                flexShrink: 0,
                                            }}>
                                                {row.logo
                                                    ? <img src={row.logo} alt={row.name} style={{ width: '80%', height: '80%', objectFit: 'contain' }} />
                                                    : <span style={{ color: '#6b7280', fontSize: 11, fontWeight: 800 }}>SIN</span>}
                                            </div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 800, whiteSpace: isCompactLayout ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'break-word' }}>
                                                    {row.position ? `${row.position}. ` : ''}{row.name}
                                                </div>
                                                <div style={{ color: '#9aa4b2', fontSize: 12, lineHeight: 1.5, wordBreak: 'break-word' }}>
                                                    {row.groupName ? `Origen: ${row.groupName}` : 'Tabla general'} · API: {pointsPreview.basePoints} pts · ajuste: {pointsPreview.adjustment >= 0 ? '+' : ''}{pointsPreview.adjustment} · total: {pointsPreview.total}
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 12 }}>
                                            <label style={{ display: 'grid', gap: 6 }}>
                                                <span style={{ color: '#9aa4b2', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                                    Ajuste pts
                                                </span>
                                                <input
                                                    type="number"
                                                    value={getRowPointsValue(row)}
                                                    onChange={(event) => handleRowPointsChange(row, event.target.value)}
                                                    placeholder="0"
                                                    style={{
                                                        height: 42,
                                                        borderRadius: 12,
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        background: '#0d1016',
                                                        color: '#fff',
                                                        padding: '0 14px',
                                                    }}
                                                />
                                            </label>

                                            <label style={{ display: 'grid', gap: 6 }}>
                                                <span style={{ color: '#9aa4b2', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                                                    Grupo
                                                </span>
                                                <select
                                                    value={getRowGroupValue(row)}
                                                    onChange={(event) => handleRowGroupChange(row, event.target.value)}
                                                    style={{
                                                        height: 42,
                                                        borderRadius: 12,
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        background: '#111723',
                                                        color: '#fff',
                                                        padding: '0 12px',
                                                    }}
                                                >
                                                    <option value="">Sin grupo custom</option>
                                                    {(activeTable?.groups || []).map((group) => (
                                                        <option key={group.id} value={group.id}>
                                                            {group.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section style={{ background: 'rgba(18,20,26,0.94)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: cardPadding }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                            <div>
                                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Etiquetas de tabla</div>
                                <div style={{ color: '#9aa4b2', maxWidth: 620 }}>
                                    Define etiquetas por posicion y opcionalmente por grupo para la tabla activa.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={addLabel}
                                disabled={!activeTable}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    borderRadius: 999,
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    background: 'transparent',
                                    color: '#fff',
                                    padding: '10px 16px',
                                    cursor: activeTable ? 'pointer' : 'not-allowed',
                                    opacity: activeTable ? 1 : 0.5,
                                }}
                            >
                                <Plus size={16} />
                                Agregar etiqueta
                            </button>
                        </div>

                        <div style={{ display: 'grid', gap: 12 }}>
                            {!activeTable || activeTable.labels.length === 0 ? (
                                <div style={{ color: '#9aa4b2' }}>Sin etiquetas configuradas.</div>
                            ) : activeTable.labels.map((label) => (
                                <div key={label.id} style={{ display: 'grid', gridTemplateColumns: labelGridColumns, gap: 12, alignItems: 'center' }}>
                                    <input
                                        value={label.name}
                                        onChange={(event) => updateLabel(label.id, { name: event.target.value })}
                                        style={{
                                            height: 42,
                                            borderRadius: 12,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: '#0d1016',
                                            color: '#fff',
                                            padding: '0 14px',
                                        }}
                                    />
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={label.positions_input ?? String(label.position)}
                                        onChange={(event) => updateLabelPositions(label.id, event.target.value)}
                                        onBlur={() => normalizeLabelPositionsInput(label.id)}
                                        placeholder="1, 2, 3"
                                        title="Podés escribir varias posiciones separadas por coma"
                                        style={{
                                            height: 42,
                                            borderRadius: 12,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: '#0d1016',
                                            color: '#fff',
                                            padding: '0 14px',
                                        }}
                                    />
                                    <input
                                        type="color"
                                        value={label.color}
                                        onChange={(event) => updateLabel(label.id, { color: event.target.value })}
                                        style={{
                                            height: 42,
                                            borderRadius: 12,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: '#0d1016',
                                            color: '#fff',
                                            padding: 6,
                                        }}
                                    />
                                    <select
                                        value={label.group_id || ''}
                                        onChange={(event) => updateLabel(label.id, { group_id: event.target.value || null })}
                                        style={{
                                            height: 42,
                                            borderRadius: 12,
                                            border: '1px solid rgba(255,255,255,0.1)',
                                            background: '#111723',
                                            color: '#fff',
                                            padding: '0 12px',
                                        }}
                                    >
                                        <option value="">Toda la tabla</option>
                                        {(activeTable?.groups || []).map((group) => (
                                            <option key={group.id} value={group.id}>
                                                {group.name}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => removeLabel(label.id)}
                                        style={{
                                            width: 42,
                                            height: 42,
                                            borderRadius: 12,
                                            border: '1px solid rgba(255,255,255,0.12)',
                                            background: 'transparent',
                                            color: '#fca5a5',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </section>

                    <aside style={{ background: 'rgba(18,20,26,0.94)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: cardPadding, height: 'fit-content', position: isMediumLayout ? 'relative' : 'sticky', top: isMediumLayout ? undefined : 24 }}>
                        <div style={{ color: '#9aa4b2', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Torneo API</div>
                        <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>{form.display_name || form.name || 'Torneo externo'}</div>
                        <div style={{ color: '#9aa4b2', marginBottom: 4 }}>Tournament ID: {tournamentId}</div>
                        <div style={{ color: '#9aa4b2', marginBottom: 4 }}>Source: {form.source || 'flashscore'}</div>
                        <div style={{ color: '#9aa4b2', marginBottom: 4 }}>Pais: {selectedCountryOption?.label || form.country || 'No especificado'}</div>
                        <div style={{ color: '#9aa4b2', marginBottom: 20 }}>Prioridad: {form.priority ?? 0}</div>

                        <div style={{
                            width: isCompactLayout ? 88 : 112,
                            height: isCompactLayout ? 88 : 112,
                            borderRadius: 20,
                            background: '#0d1016',
                            border: '1px solid rgba(255,255,255,0.08)',
                            display: 'grid',
                            placeItems: 'center',
                            overflow: 'hidden',
                            marginBottom: 18,
                        }}>
                            {previewLogo
                                ? <img src={previewLogo} alt={form.display_name || form.name || tournamentId} style={{ width: '76%', height: '76%', objectFit: 'contain' }} />
                                : <span style={{ color: '#6b7280', fontWeight: 800 }}>SIN LOGO</span>}
                        </div>

                        <div style={{ color: '#cdd6e1', lineHeight: 1.5 }}>
                            El override queda asociado al `tournament_id` externo. La API se sigue consultando igual;
                            estos cambios solo se montan arriba del resultado publico.
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
