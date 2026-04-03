'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Plus, Save, ShieldAlert, Trash2 } from 'lucide-react';
import LogoUploader from '@/components/LogoUploader';
import { useAuth } from '@/context/AuthContext';
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

type ApiResponseEnvelope = {
    ok?: boolean;
    error?: string;
    [key: string]: unknown;
} | null;

type StandingsPreviewRow = {
    id: string;
    name: string;
    teamId: string | null;
    teamUrl: string | null;
    logo: string | null;
    position: number | null;
    groupId: string | null;
    groupName: string | null;
};

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
        .map(({ __positions: _positions, ...label }) => label);
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

function isGroupedStandings(rows: any[]): boolean {
    return Array.isArray(rows) && rows.length > 0 && Array.isArray(rows[0]?.rows);
}

function getStandingsTeamName(row: any) {
    return row?.team?.name || row?.participant?.name || row?.team_name || row?.name || 'Equipo';
}

function getStandingsTeamId(row: any) {
    return normalizeString(row?.team?.id || row?.team?.team_id || row?.participant?.id || row?.team_id);
}

function getStandingsTeamUrl(row: any) {
    return normalizeString(row?.team?.team_url || row?.participant?.team_url || row?.team_url);
}

function getStandingsTeamLogo(row: any) {
    return normalizeString(
        row?.team?.logo ||
        row?.team?.image_path ||
        row?.participant?.logo ||
        row?.participant?.image_path ||
        row?.team_logo ||
        row?.logo
    );
}

function buildRowIdentity(row: any, index: number) {
    const teamId = getStandingsTeamId(row);
    const teamUrl = getStandingsTeamUrl(row);
    const teamName = getStandingsTeamName(row);

    if (teamId) return `team:${teamId.toLowerCase()}`;
    if (teamUrl) return `url:${teamUrl.toLowerCase()}`;
    return `name:${slugify(teamName || `row-${index + 1}`) || `row-${index + 1}`}`;
}

function extractPreviewRows(standings: any[]): StandingsPreviewRow[] {
    if (!Array.isArray(standings)) return [];

    if (!isGroupedStandings(standings)) {
        return standings.map((row: any, index: number) => ({
            id: buildRowIdentity(row, index),
            name: getStandingsTeamName(row),
            teamId: getStandingsTeamId(row),
            teamUrl: getStandingsTeamUrl(row),
            logo: getStandingsTeamLogo(row),
            position: normalizeInteger(row?.position),
            groupId: normalizeString(row?.group_id),
            groupName: null,
        }));
    }

    return standings.flatMap((group: any, groupIndex: number) => {
        const groupName = normalizeString(group?.group_name) || `Grupo ${groupIndex + 1}`;
        const groupId = normalizeString(group?.group_id) || `ext-group-${slugify(groupName) || groupIndex + 1}`;

        return Array.isArray(group?.rows)
            ? group.rows.map((row: any, rowIndex: number) => ({
                id: buildRowIdentity(row, rowIndex),
                name: getStandingsTeamName(row),
                teamId: getStandingsTeamId(row),
                teamUrl: getStandingsTeamUrl(row),
                logo: getStandingsTeamLogo(row),
                position: normalizeInteger(row?.position),
                groupId: normalizeString(row?.group_id) || groupId,
                groupName,
            }))
            : [];
    });
}

function deriveGroupsFromStandings(standings: any[]): ExternalStandingsGroup[] {
    if (!isGroupedStandings(standings)) return [];

    return standings.map((group: any, index: number) => {
        const name = normalizeString(group?.group_name) || `Grupo ${index + 1}`;
        return {
            id: normalizeString(group?.group_id) || `ext-group-${slugify(name) || index + 1}`,
            name,
            order_index: index,
        };
    });
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

function deriveLabels(teamLabels: any[]): ExternalStandingsLabel[] {
    if (!Array.isArray(teamLabels)) return [];

    return normalizeEditorLabels(
        teamLabels.flatMap((record: any, index: number) => {
            const label = Array.isArray(record?.label) ? record.label[0] : record?.label;
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
    const isExactSuperAdmin = user?.role === 'super_admin';

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [standingsRows, setStandingsRows] = useState<StandingsPreviewRow[]>([]);
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
    });
    const [standingsForm, setStandingsForm] = useState<ExternalStandingsPayload>({
        id: tournamentId,
        source: 'external-api',
        groups: [],
        assignments: [],
        labels: [],
    });

    const returnTo = searchParams.get('returnTo') || `/tournaments/${publicTournamentId}`;
    const searchParamsKey = searchParams.toString();

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
                };

                const nextStandings: ExternalStandingsPayload = {
                    id: tournamentId,
                    source: 'external-api',
                    groups: [],
                    assignments: [],
                    labels: [],
                };

                let publicStandings: any[] = [];
                let publicRows: StandingsPreviewRow[] = [];
                let publicTeamLabels: any[] = [];

                if (metaResponse.status === 'fulfilled' && metaResponse.value.ok && metaResponse.value.payload?.data) {
                    const externalTournament = metaResponse.value.payload.data as ExternalTournamentPayload;
                    nextForm.source = externalTournament.source || nextForm.source;
                    nextForm.name = externalTournament.display_name || externalTournament.name || nextForm.name;
                    nextForm.display_name = externalTournament.display_name || externalTournament.name || nextForm.display_name;
                    nextForm.logo_url = externalTournament.logo_url || nextForm.logo_url;
                    nextForm.sport = externalTournament.sport || nextForm.sport;
                    nextForm.country = externalTournament.country || nextForm.country;
                    nextForm.country_id = externalTournament.country_id || nextForm.country_id;
                    nextForm.url = externalTournament.url || nextForm.url;
                }

                if (standingsOverrideResponse.status === 'fulfilled' && standingsOverrideResponse.value.ok && standingsOverrideResponse.value.payload?.data) {
                    const override = standingsOverrideResponse.value.payload.data as ExternalStandingsPayload;
                    nextStandings.source = override.source || 'external-api';
                    nextStandings.groups = Array.isArray(override.groups) ? override.groups : [];
                    nextStandings.assignments = Array.isArray(override.assignments) ? override.assignments : [];
                    nextStandings.labels = normalizeEditorLabels(Array.isArray(override.labels) ? override.labels : []);
                }

                if (publicResponse.status === 'fulfilled' && publicResponse.value.ok && publicResponse.value.payload?.ok) {
                    const payload = publicResponse.value.payload;
                    publicStandings = Array.isArray(payload?.standings) ? payload.standings : [];
                    publicRows = extractPreviewRows(publicStandings);
                    publicTeamLabels = Array.isArray(payload?.teamLabels) ? payload.teamLabels : [];

                    const details = payload?.details;
                    const detailsName =
                        details?.display_name ||
                        details?.name ||
                        details?.league_name ||
                        details?.competition?.name;
                    const detailsLogo =
                        details?.logo_url ||
                        details?.image_path ||
                        details?.logo ||
                        details?.tournament_logo ||
                        details?.tournament_image_path;

                    nextForm.name = nextForm.name || detailsName || nextForm.display_name;
                    nextForm.display_name = nextForm.display_name || detailsName || nextForm.name;
                    nextForm.logo_url = nextForm.logo_url || detailsLogo || '';
                    nextForm.url = nextForm.url || details?.url || '';
                }

                if (nextStandings.groups.length === 0) {
                    nextStandings.groups = deriveGroupsFromStandings(publicStandings);
                }
                if (nextStandings.assignments.length === 0) {
                    nextStandings.assignments = deriveAssignments(publicRows);
                }
                if (nextStandings.labels.length === 0) {
                    nextStandings.labels = deriveLabels(publicTeamLabels);
                }

                setForm(nextForm);
                setStandingsForm(nextStandings);
                setStandingsRows(publicRows);
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
    }, [authLoading, isExactSuperAdmin, searchParamsKey, tournamentId]);

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
                        country: form.country || null,
                        country_id: form.country_id || null,
                        url: form.url || null,
                    }),
                }),
                fetch(`/api/admin/super/external-tournaments/${encodeURIComponent(tournamentId)}/standings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        source: standingsForm.source || 'external-api',
                        groups: standingsForm.groups,
                        assignments: standingsForm.assignments,
                        labels: expandLabelsForSave(standingsForm.labels),
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

    function getRowGroupValue(row: StandingsPreviewRow) {
        return standingsForm.assignments.find((assignment) => assignment.id === row.id)?.group_id || '';
    }

    function handleRowGroupChange(row: StandingsPreviewRow, groupId: string) {
        setStandingsForm((current) => {
            const assignments = current.assignments.filter((assignment) => assignment.id !== row.id);
            if (!groupId) {
                return { ...current, assignments };
            }

            return {
                ...current,
                assignments: [
                    ...assignments,
                    {
                        id: row.id,
                        team_id: row.teamId,
                        team_name: row.name,
                        team_url: row.teamUrl,
                        group_id: groupId,
                    },
                ],
            };
        });
    }

    function addGroup() {
        setStandingsForm((current) => ({
            ...current,
            groups: [
                ...current.groups,
                {
                    id: `ext-group-${Date.now()}-${current.groups.length + 1}`,
                    name: `Grupo ${String.fromCharCode(65 + current.groups.length)}`,
                    order_index: current.groups.length,
                },
            ],
        }));
    }

    function updateGroup(groupId: string, name: string) {
        setStandingsForm((current) => ({
            ...current,
            groups: current.groups.map((group) => group.id === groupId ? { ...group, name } : group),
        }));
    }

    function removeGroup(groupId: string) {
        setStandingsForm((current) => ({
            ...current,
            groups: current.groups.filter((group) => group.id !== groupId),
            assignments: current.assignments.filter((assignment) => assignment.group_id !== groupId),
            labels: current.labels.filter((label) => label.group_id !== groupId),
        }));
    }

    function addLabel() {
        setStandingsForm((current) => ({
            ...current,
            labels: [
                ...current.labels,
                {
                    id: `label-${Date.now()}-${current.labels.length + 1}`,
                    name: 'Nueva etiqueta',
                    color: '#00a365',
                    position: current.labels.length + 1,
                    positions_input: String(current.labels.length + 1),
                    group_id: null,
                },
            ],
        }));
    }

    function updateLabel(labelId: string, patch: Partial<ExternalStandingsLabel>) {
        setStandingsForm((current) => ({
            ...current,
            labels: current.labels.map((label) => label.id === labelId ? { ...label, ...patch } : label),
        }));
    }

    function updateLabelPositions(labelId: string, rawValue: string) {
        setStandingsForm((current) => ({
            ...current,
            labels: current.labels.map((label) => {
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
        setStandingsForm((current) => ({
            ...current,
            labels: current.labels.map((label) => {
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
        setStandingsForm((current) => ({
            ...current,
            labels: current.labels.filter((label) => label.id !== labelId),
        }));
    }

    return (
        <div style={{ minHeight: '100vh', background: '#06070a', color: '#f5f7fb', padding: '32px 20px 60px' }}>
            <div style={{ maxWidth: 960, margin: '0 auto' }}>
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
                        }}
                    >
                        Cerrar
                    </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, 0.75fr)', gap: 24 }}>
                    <section style={{ background: 'rgba(18,20,26,0.94)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 24 }}>
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

                    <section style={{ background: 'rgba(18,20,26,0.94)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                            <div>
                                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Grupos de standings</div>
                                <div style={{ color: '#9aa4b2', maxWidth: 620 }}>
                                    Reordena publicamente la tabla externa sin tocar el dato crudo.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={addGroup}
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
                                Agregar grupo
                            </button>
                        </div>

                        <div style={{ display: 'grid', gap: 12, marginBottom: 18 }}>
                            {standingsForm.groups.length === 0 ? (
                                <div style={{ color: '#9aa4b2' }}>Sin grupos configurados.</div>
                            ) : standingsForm.groups.map((group, index) => (
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
                            {standingsRows.length === 0 ? (
                                <div style={{ color: '#9aa4b2' }}>No se pudieron cargar filas de la tabla externa.</div>
                            ) : standingsRows.map((row) => (
                                <div
                                    key={row.id}
                                    style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 220px)',
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
                                            <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {row.position ? `${row.position}. ` : ''}{row.name}
                                            </div>
                                            <div style={{ color: '#9aa4b2', fontSize: 12 }}>
                                                {row.groupName ? `Origen: ${row.groupName}` : 'Tabla general'}
                                            </div>
                                        </div>
                                    </div>

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
                                        {standingsForm.groups.map((group) => (
                                            <option key={group.id} value={group.id}>
                                                {group.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section style={{ background: 'rgba(18,20,26,0.94)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 24 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                            <div>
                                <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 6 }}>Etiquetas de tabla</div>
                                <div style={{ color: '#9aa4b2', maxWidth: 620 }}>
                                    Define etiquetas por posicion y opcionalmente por grupo.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={addLabel}
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
                                Agregar etiqueta
                            </button>
                        </div>

                        <div style={{ display: 'grid', gap: 12 }}>
                            {standingsForm.labels.length === 0 ? (
                                <div style={{ color: '#9aa4b2' }}>Sin etiquetas configuradas.</div>
                            ) : standingsForm.labels.map((label) => (
                                <div key={label.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 140px 130px 180px auto', gap: 12, alignItems: 'center' }}>
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
                                        {standingsForm.groups.map((group) => (
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

                    <aside style={{ background: 'rgba(18,20,26,0.94)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 24, padding: 24, height: 'fit-content' }}>
                        <div style={{ color: '#9aa4b2', fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Torneo API</div>
                        <div style={{ fontSize: 24, fontWeight: 900, marginBottom: 8 }}>{form.display_name || form.name || 'Torneo externo'}</div>
                        <div style={{ color: '#9aa4b2', marginBottom: 4 }}>Tournament ID: {tournamentId}</div>
                        <div style={{ color: '#9aa4b2', marginBottom: 20 }}>Source: {form.source || 'flashscore'}</div>

                        <div style={{
                            width: 112,
                            height: 112,
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
