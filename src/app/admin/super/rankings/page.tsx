'use client';

import Link from 'next/link';
import { ChangeEvent, FormEvent, useDeferredValue, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
    AlertCircle,
    ArrowUpRight,
    ChevronLeft,
    ChevronRight,
    CheckCircle2,
    Download,
    FileSpreadsheet,
    PencilLine,
    Plus,
    RefreshCw,
    RotateCcw,
    Save,
    Shield,
    Table2,
    Trash2,
    UploadCloud,
} from 'lucide-react';
import {
    analyzeRankingSheet,
    buildCatalogClubs,
    buildRowClubSummary,
    type RankingCatalogClub,
    type RankingCatalogClubSource,
    type RankingClubMatch,
    type RankingExpectedField,
} from '@/lib/rankings/rankingWorkbookAnalysis';
import ExportImage from '@/components/ExportImage';
import {
    buildRankingExportRows,
    formatRankingRating,
    getRankingClubName,
    getRankingClubShortName,
    getRankingDelta,
    getRankingPreviousRating,
    paginateRankingEntries,
    RANKING_EXPORT_COLUMN_LABELS,
} from '@/lib/rankings/rankingTable';
import baseStyles from '../page.module.css';
import styles from './page.module.css';

type SheetRows = Record<string, string>[];
type WorkbookPreview = {
    fileName: string;
    fileSizeLabel: string;
    sheetNames: string[];
    rowsBySheet: Record<string, SheetRows>;
    headersBySheet: Record<string, string[]>;
};
type RankingWorkspace = {
    id: string;
    name: string;
    sport: string;
    season: string;
    scope: string;
    description: string;
    preview: WorkbookPreview | null;
    selectedSheet: string;
    selectedClubHeader: string;
    manualClubLinksBySheet: Record<string, Record<string, string>>;
    error: string | null;
    isParsing: boolean;
};
type RankingSummary = {
    id: string;
    name: string;
    sport?: string | null;
    season: string;
    results_season?: number;
    scope?: string | null;
    description?: string | null;
    stale_from_match_id?: string | null;
    stale_reason?: string | null;
    initial_imported_at?: string | null;
    backfill_completed_at?: string | null;
    last_incremental_match_id?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    metadata?: Record<string, unknown> | null;
};
type RankingEntry = {
    id: string;
    club_id: string;
    source_name: string;
    clubs?: { name?: string | null; short_name?: string | null; logo_url?: string | null } | null;
    current_position?: number | null;
    current_rating?: number | string | null;
    previous_rating?: number | string | null;
    initial_rating?: number | string | null;
    source_region?: string | null;
    source_position?: number | null;
    source_previous_position?: number | null;
    source_variation?: number | string | null;
    is_active?: boolean;
};
type RankingApplication = {
    id: string;
    match_id: string;
    match_date_time?: string | null;
    home_club_id: string;
    away_club_id: string;
    home_score: number;
    away_score: number;
    applied_mode?: string;
};
type RankingManualAdjustment = {
    id: string;
    club_id: string;
    mode: string;
    value: number | string;
    resulting_rating: number | string | null;
    reason: string;
    created_at?: string | null;
};
type RankingDetail = {
    ranking: RankingSummary;
    entries: RankingEntry[];
    recentApplications: RankingApplication[];
    manualAdjustments: RankingManualAdjustment[];
};
type Feedback = { tone: 'success' | 'error' | 'info'; text: string } | null;
type EntryEditorState = {
    mode: 'create' | 'edit';
    entryId: string | null;
    clubId: string;
    sourceName: string;
    initialRating: string;
    sourceRegion: string;
    sourcePosition: string;
    sourcePreviousPosition: string;
    sourceVariation: string;
    isActive: boolean;
};
type ImportPlan = {
    entries: Array<{
        clubId: string;
        sourceName: string;
        initialRating: number;
        sourceRowIndex: number;
        sourceRegion: string | null;
        sourcePosition: number | null;
        sourcePreviousPosition: number | null;
        sourceVariation: number | null;
        sourcePayload: Record<string, unknown>;
    }>;
    ratingHeader: string | null;
    validRows: number;
    unresolvedRows: number;
    ambiguousRows: number;
    missingRatingRows: number;
    inactiveRows: number;
    duplicateRows: number;
    blockedReason: string | null;
};

const EXPECTED_FIELDS: readonly RankingExpectedField[] = [
    { key: 'posicion', label: 'Posicion actual', aliases: ['pos', 'posicion', 'puesto', 'rank', 'ranking'] },
    { key: 'club_id', label: 'ID del club', aliases: ['club_id', 'id', 'codigo_club', 'clubid'] },
    { key: 'club', label: 'Nombre del club', aliases: ['club', 'nombre', 'club_name', 'equipo', 'team'] },
    { key: 'rating_inicial', label: 'Rating / OVR', aliases: ['rating_inicial', 'rating', 'puntaje_inicial', 'puntos', 'pts', 'ovr', 'overall'] },
    { key: 'region', label: 'TR / Region', aliases: ['tr', 'torneo', 'union', 'regional', 'region', 'region_origen'] },
    { key: 'puesto_viejo', label: 'Puesto anterior', aliases: ['puesto_viejo', 'puesto_anterior', 'posicion_anterior', 'rank_anterior', 'old_rank', 'old_position'] },
    { key: 'variacion', label: 'Variacion', aliases: ['variacion', 'delta', 'cambio', 'movement'] },
    { key: 'activo', label: 'Activo en ranking', aliases: ['activo', 'habilitado', 'enabled', 'participa'] },
];

const TEMPLATE_ROWS = [
    { Pos: '1', Equipo: 'CASI', OVR: '82.50', TR: 'Buenos Aires', 'Puesto viejo': '2', Variacion: '1' },
    { Pos: '2', Equipo: 'SIC', OVR: '81.40', TR: 'Buenos Aires', 'Puesto viejo': '1', Variacion: '-1' },
];
const RANKING_PAGE_SIZE = 20;

const INITIAL_RANKINGS: RankingWorkspace[] = [{
    id: 'ranking-rugby-clubes-2025',
    name: 'Ranking Clubes Rugby',
    sport: 'rugby',
    season: '2025',
    scope: 'clubes-designados',
    description: 'Base inicial para aplicar resultados 2026.',
    preview: null,
    selectedSheet: '',
    selectedClubHeader: '',
    manualClubLinksBySheet: {},
    error: null,
    isParsing: false,
}];

function formatBytes(bytes: number) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
    const units = ['B', 'KB', 'MB', 'GB'];
    const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / 1024 ** exp;
    return `${value.toFixed(value >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
}
function formatPercent(value: number) {
    if (!Number.isFinite(value) || value <= 0) return '0%';
    return `${Math.round(value * 100)}%`;
}
function formatDateTime(value: string | null | undefined) {
    if (!value) return '-';
    try {
        return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
    } catch {
        return value;
    }
}
function createEntryEditorState(entry?: RankingEntry | null): EntryEditorState {
    return {
        mode: entry ? 'edit' : 'create',
        entryId: entry?.id ?? null,
        clubId: entry?.club_id ?? '',
        sourceName: entry?.source_name ?? '',
        initialRating:
            entry?.initial_rating === null || entry?.initial_rating === undefined
                ? ''
                : String(entry.initial_rating),
        sourceRegion: entry?.source_region ?? '',
        sourcePosition:
            entry?.source_position === null || entry?.source_position === undefined
                ? ''
                : String(entry.source_position),
        sourcePreviousPosition:
            entry?.source_previous_position === null || entry?.source_previous_position === undefined
                ? ''
                : String(entry.source_previous_position),
        sourceVariation:
            entry?.source_variation === null || entry?.source_variation === undefined
                ? ''
                : String(entry.source_variation),
        isActive: entry?.is_active !== false,
    };
}
function getExcelRowNumber(rowIndex: number) {
    return rowIndex + 2;
}
function buildManualMatch(sourceValue: string, club: RankingCatalogClub): RankingClubMatch {
    return {
        sourceValue,
        normalizedValue: String(sourceValue ?? '').trim(),
        matchedClubId: club.id,
        matchedClubName: club.name,
        matchedClubShortName: club.shortName,
        matchedClubLogoUrl: club.logoUrl,
        confidence: 'alta',
        matchType: 'manual',
        score: 1,
        ambiguous: false,
        alternatives: [{ id: club.id, name: club.name }],
    };
}
function normalizeNumber(value: unknown) {
    const text = String(value ?? '').trim();
    if (!text) return null;
    const numeric = Number(text.replace(/\s+/g, '').replace(',', '.'));
    return Number.isFinite(numeric) ? numeric : null;
}
function normalizeBoolean(value: unknown) {
    const text = String(value ?? '').trim().toLowerCase();
    if (!text) return null;
    if (['1', 'si', 'sí', 'true', 'x', 'activo', 'yes'].includes(text)) return true;
    if (['0', 'no', 'false', 'inactivo', 'off'].includes(text)) return false;
    return null;
}
function buildId(name: string, season: string) {
    const slug = `${name}-${season}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return slug || `ranking-${Date.now()}`;
}
function normalizeSearchText(value: unknown) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}
function parseWorkbook(file: File, buffer: ArrayBuffer): WorkbookPreview {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const rowsBySheet: Record<string, SheetRows> = {};
    const headersBySheet: Record<string, string[]> = {};
    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
        const cleaned = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [String(key).trim(), value == null ? '' : String(value).trim()])))
            .filter((row) => Object.values(row).some((value) => value !== ''));
        const headers = Array.from(cleaned.reduce((acc, row) => { Object.keys(row).forEach((key) => acc.add(key)); return acc; }, new Set<string>()))
            .filter((header) => !/^__EMPTY(?:_\d+)?$/.test(header) || cleaned.some((row) => String(row[header] || '').trim() !== ''));
        rowsBySheet[sheetName] = cleaned;
        headersBySheet[sheetName] = headers;
    }
    return { fileName: file.name, fileSizeLabel: formatBytes(file.size), sheetNames: workbook.SheetNames, rowsBySheet, headersBySheet };
}
function downloadTemplate() {
    const worksheet = XLSX.utils.json_to_sheet(TEMPLATE_ROWS);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ranking_base');
    XLSX.writeFile(workbook, 'ranking-clubes-base.xlsx');
}
function getMatchBadgeClass(match: RankingClubMatch | null) {
    if (!match?.matchedClubId) return baseStyles.pillNeutral;
    if (match.matchType === 'manual') return baseStyles.pillInfo;
    if (match.ambiguous || match.confidence === 'baja') return baseStyles.pillWarning;
    if (match.confidence === 'alta') return baseStyles.pillSuccess;
    return baseStyles.pillInfo;
}
function getMatchBadgeLabel(match: RankingClubMatch | null) {
    if (!match?.matchedClubId) return 'Sin match';
    if (match.matchType === 'manual') return 'Manual';
    if (match.ambiguous) return 'Revisar';
    if (match.confidence === 'alta') return 'Alta';
    if (match.confidence === 'media') return 'Media';
    return 'Baja';
}
function mergeWorkspaces(current: RankingWorkspace[], summaries: RankingSummary[]) {
    const currentMap = new Map(current.map((workspace) => [workspace.id, workspace]));
    const persistedIds = new Set(summaries.map((summary) => summary.id));
    const persisted = summaries.map((summary) => ({
        id: summary.id,
        name: summary.name,
        sport: summary.sport || currentMap.get(summary.id)?.sport || 'rugby',
        season: summary.season || currentMap.get(summary.id)?.season || String((summary.results_season || 0) - 1),
        scope: summary.scope || currentMap.get(summary.id)?.scope || 'clubes-designados',
        description: summary.description || currentMap.get(summary.id)?.description || '',
        preview: currentMap.get(summary.id)?.preview || null,
        selectedSheet: currentMap.get(summary.id)?.selectedSheet || '',
        selectedClubHeader: currentMap.get(summary.id)?.selectedClubHeader || '',
        manualClubLinksBySheet: currentMap.get(summary.id)?.manualClubLinksBySheet || {},
        error: currentMap.get(summary.id)?.error || null,
        isParsing: currentMap.get(summary.id)?.isParsing || false,
    }));
    return [...persisted, ...current.filter((workspace) => !persistedIds.has(workspace.id))];
}
async function readJson(response: Response) {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo completar la operacion.');
    return payload;
}

export default function SuperRankingsPage() {
    const [rankings, setRankings] = useState(INITIAL_RANKINGS);
    const [selectedRankingId, setSelectedRankingId] = useState(INITIAL_RANKINGS[0].id);
    const [draft, setDraft] = useState({ name: '', sport: 'rugby', season: '2025', scope: 'clubes-designados', description: '' });
    const [catalogBySport, setCatalogBySport] = useState<Record<string, RankingCatalogClub[]>>({});
    const [catalogState, setCatalogState] = useState({ sport: null as string | null, loading: false, error: null as string | null });
    const [summariesById, setSummariesById] = useState<Record<string, RankingSummary>>({});
    const [detailsById, setDetailsById] = useState<Record<string, RankingDetail>>({});
    const [feedback, setFeedback] = useState<Feedback>(null);
    const [loadingList, setLoadingList] = useState(false);
    const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
    const [savingBase, setSavingBase] = useState(false);
    const [backfilling, setBackfilling] = useState(false);
    const [recalculatingMatchId, setRecalculatingMatchId] = useState<string | null>(null);
    const [manualBusy, setManualBusy] = useState(false);
    const [manualForm, setManualForm] = useState({ clubId: '', mode: 'delta' as 'delta' | 'set', value: '', reason: '' });
    const [entryFilter, setEntryFilter] = useState('');
    const [entryRegionFilter, setEntryRegionFilter] = useState('all');
    const [entryPage, setEntryPage] = useState(1);
    const [entryEditor, setEntryEditor] = useState<EntryEditorState>(createEntryEditorState());
    const [entryBusy, setEntryBusy] = useState(false);
    const deferredEntryFilter = useDeferredValue(entryFilter);

    const selectedRanking = useMemo(() => rankings.find((ranking) => ranking.id === selectedRankingId) ?? rankings[0] ?? null, [rankings, selectedRankingId]);
    const selectedSummary = useMemo(() => (selectedRanking ? summariesById[selectedRanking.id] ?? null : null), [selectedRanking, summariesById]);
    const selectedDetail = useMemo(() => (selectedRanking ? detailsById[selectedRanking.id] ?? null : null), [detailsById, selectedRanking]);
    const currentHeaders = useMemo(() => !selectedRanking?.preview || !selectedRanking.selectedSheet ? [] : selectedRanking.preview.headersBySheet[selectedRanking.selectedSheet] ?? [], [selectedRanking]);
    const currentRows = useMemo(() => !selectedRanking?.preview || !selectedRanking.selectedSheet ? [] : selectedRanking.preview.rowsBySheet[selectedRanking.selectedSheet] ?? [], [selectedRanking]);
    const catalogClubs = useMemo(() => (selectedRanking ? catalogBySport[selectedRanking.sport] ?? [] : []), [catalogBySport, selectedRanking]);
    const catalogClubMap = useMemo(() => new Map(catalogClubs.map((club) => [club.id, club])), [catalogClubs]);
    const sheetAnalysis = useMemo(() => analyzeRankingSheet(currentRows, currentHeaders, EXPECTED_FIELDS, catalogClubs), [catalogClubs, currentHeaders, currentRows]);
    const activeClubHeader = useMemo(() => {
        if (!selectedRanking) return null;
        if (selectedRanking.selectedClubHeader && currentHeaders.includes(selectedRanking.selectedClubHeader)) return selectedRanking.selectedClubHeader;
        return sheetAnalysis.suggestedClubHeader;
    }, [currentHeaders, selectedRanking, sheetAnalysis.suggestedClubHeader]);
    const clubMatchMap = useMemo(() => activeClubHeader ? sheetAnalysis.matchMapsByHeader[activeClubHeader] ?? {} : {}, [activeClubHeader, sheetAnalysis.matchMapsByHeader]);
    const manualClubLinks = useMemo(() => {
        if (!selectedRanking?.selectedSheet) return {} as Record<string, string>;
        return selectedRanking.manualClubLinksBySheet[selectedRanking.selectedSheet] ?? {};
    }, [selectedRanking]);
    const effectiveClubMatchMap = useMemo(() => {
        if (!Object.keys(manualClubLinks).length) return clubMatchMap;
        const next = { ...clubMatchMap };
        for (const [sourceValue, clubId] of Object.entries(manualClubLinks)) {
            const club = catalogClubMap.get(clubId);
            if (!club) continue;
            next[sourceValue] = buildManualMatch(sourceValue, club);
        }
        return next;
    }, [catalogClubMap, clubMatchMap, manualClubLinks]);
    const rowClubSummary = useMemo(() => buildRowClubSummary(currentRows, activeClubHeader, effectiveClubMatchMap), [activeClubHeader, currentRows, effectiveClubMatchMap]);
    const rowClubRows = rowClubSummary.rows;
    const detectedFields = useMemo(() => EXPECTED_FIELDS.map((field) => ({ ...field, matchedHeader: sheetAnalysis.suggestedFieldHeaders[field.key] ?? null })), [sheetAnalysis]);
    const recognizedCount = detectedFields.filter((field) => field.matchedHeader).length;
    const entryNameMap = useMemo(() => new Map((selectedDetail?.entries ?? []).map((entry) => [entry.club_id, entry.clubs?.short_name || entry.clubs?.name || entry.source_name])), [selectedDetail]);
    const entryRegions = useMemo(
        () => Array.from(new Set((selectedDetail?.entries ?? []).map((entry) => entry.source_region).filter((region): region is string => Boolean(region)))).sort((left, right) => left.localeCompare(right, 'es')),
        [selectedDetail],
    );
    const filteredEntries = useMemo(() => {
        if (!selectedDetail) return [];
        const query = normalizeSearchText(deferredEntryFilter);
        return selectedDetail.entries.filter((entry) => {
            const matchesRegion = entryRegionFilter === 'all' || (entry.source_region ?? '') === entryRegionFilter;
            const matchesQuery = !query || [
                entry.clubs?.name,
                entry.clubs?.short_name,
                entry.source_name,
                entry.source_region,
            ].some((value) => normalizeSearchText(value).includes(query));

            return matchesRegion && matchesQuery;
        });
    }, [deferredEntryFilter, entryRegionFilter, selectedDetail]);
    const paginatedEntries = useMemo(
        () => paginateRankingEntries(filteredEntries, entryPage, RANKING_PAGE_SIZE),
        [entryPage, filteredEntries],
    );
    const visibleEntries = paginatedEntries.items;
    const rankingExportRows = useMemo(
        () => buildRankingExportRows(filteredEntries),
        [filteredEntries],
    );

    const importPlan = useMemo<ImportPlan>(() => {
        const ratingHeader = sheetAnalysis.suggestedFieldHeaders.rating_inicial ?? null;
        const regionHeader = sheetAnalysis.suggestedFieldHeaders.region ?? null;
        const positionHeader = sheetAnalysis.suggestedFieldHeaders.posicion ?? null;
        const previousPositionHeader = sheetAnalysis.suggestedFieldHeaders.puesto_viejo ?? null;
        const variationHeader = sheetAnalysis.suggestedFieldHeaders.variacion ?? null;
        const activeHeader = sheetAnalysis.suggestedFieldHeaders.activo ?? null;
        if (!activeClubHeader) return { entries: [], ratingHeader: null, validRows: 0, unresolvedRows: 0, ambiguousRows: 0, missingRatingRows: 0, inactiveRows: 0, duplicateRows: 0, blockedReason: 'No se detecto una columna de club.' };
        if (!ratingHeader) return { entries: [], ratingHeader: null, validRows: 0, unresolvedRows: 0, ambiguousRows: 0, missingRatingRows: 0, inactiveRows: 0, duplicateRows: 0, blockedReason: 'No se detecto la columna de rating inicial.' };
        let unresolvedRows = 0;
        let ambiguousRows = 0;
        let missingRatingRows = 0;
        let inactiveRows = 0;
        let duplicateRows = 0;
        const rawEntries = currentRows.flatMap((row, index) => {
            const sourceName = String(row[activeClubHeader] || '').trim();
            if (!sourceName) return [];
            if (activeHeader && normalizeBoolean(row[activeHeader]) === false) {
                inactiveRows += 1;
                return [];
            }
            const match = effectiveClubMatchMap[sourceName] ?? null;
            if (!match?.matchedClubId) {
                unresolvedRows += 1;
                return [];
            }
            if (match.ambiguous) ambiguousRows += 1;
            const rating = normalizeNumber(row[ratingHeader]);
            if (rating === null) {
                missingRatingRows += 1;
                return [];
            }
            return [{
                clubId: match.matchedClubId,
                sourceName,
                initialRating: rating,
                sourceRowIndex: index,
                sourceRegion: regionHeader ? String(row[regionHeader] || '').trim() || null : null,
                sourcePosition: positionHeader ? normalizeNumber(row[positionHeader]) : null,
                sourcePreviousPosition: previousPositionHeader ? normalizeNumber(row[previousPositionHeader]) : null,
                sourceVariation: variationHeader ? normalizeNumber(row[variationHeader]) : null,
                sourcePayload: row,
            }];
        });
        const seenClubIds = new Set<string>();
        const entries = rawEntries.filter((entry) => {
            if (seenClubIds.has(entry.clubId)) {
                duplicateRows += 1;
                return false;
            }
            seenClubIds.add(entry.clubId);
            return true;
        });
        let blockedReason: string | null = null;
        if (unresolvedRows > 0) blockedReason = `Hay ${unresolvedRows} filas sin club resuelto.`;
        else if (missingRatingRows > 0) blockedReason = `Hay ${missingRatingRows} filas sin rating valido.`;
        else if (entries.length === 0) blockedReason = 'No hay filas validas para importar.';
        return { entries, ratingHeader, validRows: entries.length, unresolvedRows, ambiguousRows, missingRatingRows, inactiveRows, duplicateRows, blockedReason };
    }, [activeClubHeader, currentRows, effectiveClubMatchMap, sheetAnalysis.suggestedFieldHeaders]);
    const unresolvedRowDetails = useMemo(() => rowClubRows
        .filter((row) => row.sourceValue && !row.match?.matchedClubId)
        .map((row) => ({
            rowIndex: row.rowIndex,
            excelRowNumber: getExcelRowNumber(row.rowIndex),
            sourceValue: row.sourceValue,
        })), [rowClubRows]);
    const manualLinkDetails = useMemo(() => Object.entries(manualClubLinks)
        .map(([sourceValue, clubId]) => {
            const club = catalogClubMap.get(clubId);
            return club ? {
                sourceValue,
                clubId,
                clubName: club.name,
                clubShortName: club.shortName,
            } : null;
        })
        .filter((item): item is { sourceValue: string; clubId: string; clubName: string; clubShortName: string | null } => item !== null)
        .sort((left, right) => left.sourceValue.localeCompare(right.sourceValue, 'es')), [catalogClubMap, manualClubLinks]);

    useEffect(() => {
        let cancelled = false;
        setLoadingList(true);
        fetch('/api/admin/super/rankings', { cache: 'no-store' })
            .then(readJson)
            .then((payload) => {
                if (cancelled) return;
                const data = Array.isArray(payload?.data) ? payload.data : [];
                setSummariesById(Object.fromEntries(data.map((summary: RankingSummary) => [summary.id, summary])));
                setRankings((current) => mergeWorkspaces(current, data));
            })
            .catch((error) => {
                if (!cancelled) setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudieron cargar los rankings guardados.' });
            })
            .finally(() => {
                if (!cancelled) setLoadingList(false);
            });
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        const sport = selectedRanking?.sport;
        if (!sport || catalogBySport[sport]) return;
        const controller = new AbortController();
        setCatalogState({ sport, loading: true, error: null });
        fetch(`/api/admin/super/rankings/club-catalog?sport=${encodeURIComponent(sport)}`, { cache: 'no-store', signal: controller.signal })
            .then(readJson)
            .then((payload) => buildCatalogClubs(Array.isArray(payload?.data) ? payload.data as RankingCatalogClubSource[] : []))
            .then((clubs) => {
                setCatalogBySport((current) => ({ ...current, [sport]: clubs }));
                setCatalogState({ sport, loading: false, error: null });
            })
            .catch((error) => {
                if (error?.name === 'AbortError') return;
                setCatalogState({ sport, loading: false, error: error instanceof Error ? error.message : 'No se pudo cargar el catalogo.' });
            });
        return () => controller.abort();
    }, [catalogBySport, selectedRanking?.sport]);

    useEffect(() => {
        if (!selectedSummary || detailsById[selectedSummary.id]) return;
        setLoadingDetailId(selectedSummary.id);
        fetch(`/api/admin/super/rankings/${encodeURIComponent(selectedSummary.id)}`, { cache: 'no-store' })
            .then(readJson)
            .then((payload) => {
                const detail = payload?.data as RankingDetail;
                setDetailsById((current) => ({ ...current, [detail.ranking.id]: detail }));
                setSummariesById((current) => ({ ...current, [detail.ranking.id]: detail.ranking }));
            })
            .catch((error) => {
                setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo cargar el detalle.' });
            })
            .finally(() => setLoadingDetailId((current) => current === selectedSummary.id ? null : current));
    }, [detailsById, selectedSummary]);

    useEffect(() => {
        if (!selectedDetail?.entries.length) return;
        setManualForm((current) => current.clubId && selectedDetail.entries.some((entry) => entry.club_id === current.clubId) ? current : { ...current, clubId: selectedDetail.entries[0].club_id });
    }, [selectedDetail]);

    useEffect(() => {
        setEntryFilter('');
        setEntryRegionFilter('all');
        setEntryPage(1);
        setEntryEditor(createEntryEditorState());
    }, [selectedRankingId]);

    useEffect(() => {
        setEntryPage((current) => Math.min(current, paginatedEntries.totalPages));
    }, [paginatedEntries.totalPages]);

    useEffect(() => {
        setEntryPage(1);
    }, [deferredEntryFilter, entryRegionFilter]);

    useEffect(() => {
        if (!catalogClubs.length) return;
        setEntryEditor((current) => (
            current.mode === 'create' && !current.clubId
                ? { ...current, clubId: catalogClubs[0].id }
                : current
        ));
    }, [catalogClubs]);

    const patchRanking = (rankingId: string, updater: (ranking: RankingWorkspace) => RankingWorkspace) => setRankings((current) => current.map((ranking) => ranking.id === rankingId ? updater(ranking) : ranking));
    const openCreateEntryEditor = () => {
        setEntryEditor((current) => ({
            ...createEntryEditorState(),
            clubId: current.mode === 'create' && current.clubId ? current.clubId : '',
        }));
    };
    const openEditEntryEditor = (entry: RankingEntry) => {
        setEntryEditor(createEntryEditorState(entry));
    };
    const setManualClubLink = (sourceValue: string, clubId: string) => {
        if (!selectedRanking?.selectedSheet) return;
        patchRanking(selectedRanking.id, (ranking) => {
            const currentSheetLinks = ranking.manualClubLinksBySheet[ranking.selectedSheet] ?? {};
            const nextSheetLinks = { ...currentSheetLinks };
            if (clubId) nextSheetLinks[sourceValue] = clubId;
            else delete nextSheetLinks[sourceValue];
            return {
                ...ranking,
                manualClubLinksBySheet: {
                    ...ranking.manualClubLinksBySheet,
                    [ranking.selectedSheet]: nextSheetLinks,
                },
            };
        });
    };
    const applyDetail = (detail: RankingDetail) => {
        setDetailsById((current) => ({ ...current, [detail.ranking.id]: detail }));
        setSummariesById((current) => {
            const next = { ...current, [detail.ranking.id]: detail.ranking };
            setRankings((workspaces) => mergeWorkspaces(workspaces, Object.values(next)));
            return next;
        });
        setEntryPage(1);
    };
    const previewRowIndexes = useMemo(() => {
        if (unresolvedRowDetails.length > 0) return unresolvedRowDetails.slice(0, 12).map((row) => row.rowIndex);
        return currentRows.slice(0, 12).map((_, index) => index);
    }, [currentRows, unresolvedRowDetails]);
    const previewRows = useMemo(() => {
        const rows: Array<{
            rowIndex: number;
            row: Record<string, string>;
            rowMatch: (typeof rowClubRows)[number] | null;
        }> = [];
        for (const rowIndex of previewRowIndexes) {
            const row = currentRows[rowIndex];
            if (!row) continue;
            rows.push({
                rowIndex,
                row,
                rowMatch: rowClubRows[rowIndex] ?? null,
            });
        }
        return rows;
    }, [currentRows, previewRowIndexes, rowClubRows]);
    const previewNotice = useMemo(() => {
        if (unresolvedRowDetails.length > 0) return `Mostrando ${previewRows.length} de ${unresolvedRowDetails.length} filas sin club resuelto.`;
        if (currentRows.length > previewRows.length) return `Mostrando ${previewRows.length} de ${currentRows.length} filas de la hoja.`;
        return `${previewRows.length} filas visibles.`;
    }, [currentRows.length, previewRows.length, unresolvedRowDetails.length]);
    const clubSelectValue = selectedRanking?.selectedClubHeader && currentHeaders.includes(selectedRanking.selectedClubHeader) ? selectedRanking.selectedClubHeader : '__auto__';
    const selectedResultsSeason = selectedSummary?.results_season ?? (Number.isFinite(Number(selectedRanking?.season)) ? Number(selectedRanking?.season) + 1 : null);
    const publicRankingHref = selectedRanking ? `/rankings?sport=${encodeURIComponent(selectedRanking.sport)}&ranking=${encodeURIComponent(selectedRanking.id)}` : '/rankings';
    const selectedInspectorEntry = selectedDetail?.entries.find((entry) => entry.id === entryEditor.entryId) ?? null;
    const selectedInspectorClub = selectedInspectorEntry?.clubs ?? catalogClubMap.get(entryEditor.clubId) ?? null;
    const inspectorTitle = selectedInspectorEntry
        ? getRankingClubName(selectedInspectorEntry)
        : entryEditor.sourceName || selectedInspectorClub?.name || 'Nuevo club';
    const activeEntriesCount = selectedDetail?.entries.filter((entry) => entry.is_active !== false).length ?? 0;
    const hasSeasonBootstrap = Boolean(selectedSummary?.backfill_completed_at);

    const handleCreateRanking = () => {
        if (!draft.name.trim()) return;
        const nextId = buildId(draft.name, draft.season || 'base');
        const ranking: RankingWorkspace = {
            id: rankings.some((item) => item.id === nextId) ? `${nextId}-${Date.now()}` : nextId,
            name: draft.name.trim(),
            sport: draft.sport,
            season: draft.season.trim() || 'sin-temporada',
            scope: draft.scope,
            description: draft.description.trim(),
            preview: null,
            selectedSheet: '',
            selectedClubHeader: '',
            manualClubLinksBySheet: {},
            error: null,
            isParsing: false,
        };
        setRankings((current) => [ranking, ...current]);
        setSelectedRankingId(ranking.id);
        setDraft({ name: '', sport: 'rugby', season: '2025', scope: 'clubes-designados', description: '' });
    };
    const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedRanking) return;
        patchRanking(selectedRanking.id, (ranking) => ({ ...ranking, error: null, isParsing: true }));
        try {
            const preview = parseWorkbook(file, await file.arrayBuffer());
            patchRanking(selectedRanking.id, (ranking) => ({ ...ranking, preview, selectedSheet: preview.sheetNames[0] ?? '', selectedClubHeader: '', manualClubLinksBySheet: {}, error: null, isParsing: false }));
            setFeedback({ tone: 'info', text: `Excel cargado en ${selectedRanking.name}.` });
        } catch (error) {
            patchRanking(selectedRanking.id, (ranking) => ({ ...ranking, preview: null, selectedSheet: '', selectedClubHeader: '', manualClubLinksBySheet: {}, error: error instanceof Error ? error.message : 'No se pudo leer el Excel.', isParsing: false }));
        } finally {
            event.target.value = '';
        }
    };
    const handleSaveBase = async () => {
        if (!selectedRanking) return;
        if (importPlan.blockedReason) {
            const unresolvedHint = unresolvedRowDetails.length
                ? ` Revisa las filas ${unresolvedRowDetails.slice(0, 6).map((row) => row.excelRowNumber).join(', ')}${unresolvedRowDetails.length > 6 ? '...' : ''}.`
                : '';
            return setFeedback({ tone: 'error', text: `${importPlan.blockedReason}${unresolvedHint}` });
        }
        setSavingBase(true);
        try {
            const payload = await readJson(await fetch('/api/admin/super/rankings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedRanking.id, name: selectedRanking.name, sport: selectedRanking.sport, season: selectedRanking.season, resultsSeason: Number(selectedRanking.season) + 1, scope: selectedRanking.scope, description: selectedRanking.description, entries: importPlan.entries }) }));
            applyDetail(payload.data as RankingDetail);
            setFeedback({ tone: 'success', text: `Base guardada con ${importPlan.validRows} clubes.${importPlan.duplicateRows > 0 ? ` Se ignoraron ${importPlan.duplicateRows} filas duplicadas.` : ''}` });
        } catch (error) {
            setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar la base.' });
        } finally {
            setSavingBase(false);
        }
    };
    const handleBackfill = async () => {
        if (!selectedRanking) return;
        setBackfilling(true);
        try {
            const payload = await readJson(await fetch(`/api/admin/super/rankings/${encodeURIComponent(selectedRanking.id)}/backfill`, { method: 'POST' }));
            applyDetail(payload.data as RankingDetail);
            setFeedback({ tone: 'success', text: `Corrida inicial ${selectedResultsSeason || ''} completada. A partir de ahora el ranking se actualiza con resultados finales guardados en la base.` });
        } catch (error) {
            setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo ejecutar la corrida inicial.' });
        } finally {
            setBackfilling(false);
        }
    };
    const handleRecalculateFromMatch = async (matchId: string) => {
        if (!selectedRanking || !matchId) return;
        setRecalculatingMatchId(matchId);
        try {
            const payload = await readJson(await fetch(`/api/admin/super/rankings/${encodeURIComponent(selectedRanking.id)}/recalculate-from-match`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ matchId }) }));
            applyDetail(payload.data as RankingDetail);
            setFeedback({ tone: 'success', text: `Recalculo completado desde ${matchId}.` });
        } catch (error) {
            setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo recalcular el ranking.' });
        } finally {
            setRecalculatingMatchId((current) => current === matchId ? null : current);
        }
    };
    const handleManualAdjustment = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedRanking) return;
        const numericValue = normalizeNumber(manualForm.value);
        if (numericValue === null) return setFeedback({ tone: 'error', text: 'El ajuste manual necesita un valor numerico.' });
        setManualBusy(true);
        try {
            const payload = await readJson(await fetch(`/api/admin/super/rankings/${encodeURIComponent(selectedRanking.id)}/manual-adjustments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clubId: manualForm.clubId, mode: manualForm.mode, value: numericValue, reason: manualForm.reason }) }));
            applyDetail(payload.data as RankingDetail);
            setManualForm((current) => ({ ...current, value: '', reason: '' }));
            setFeedback({ tone: 'success', text: 'Ajuste manual aplicado.' });
        } catch (error) {
            setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo aplicar el ajuste manual.' });
        } finally {
            setManualBusy(false);
        }
    };
    const handleSaveEntry = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!selectedRanking) return;

        const initialRating = normalizeNumber(entryEditor.initialRating);
        if (!entryEditor.clubId) {
            return setFeedback({ tone: 'error', text: 'Selecciona un club para esta fila.' });
        }
        if (initialRating === null) {
            return setFeedback({ tone: 'error', text: 'El rating inicial debe ser numerico.' });
        }

        setEntryBusy(true);
        try {
            const payload = {
                clubId: entryEditor.clubId,
                sourceName: entryEditor.sourceName.trim() || null,
                initialRating,
                sourceRegion: entryEditor.sourceRegion.trim() || null,
                sourcePosition: entryEditor.sourcePosition.trim() ? Number(entryEditor.sourcePosition) : null,
                sourcePreviousPosition: entryEditor.sourcePreviousPosition.trim() ? Number(entryEditor.sourcePreviousPosition) : null,
                sourceVariation: entryEditor.sourceVariation.trim() ? Number(entryEditor.sourceVariation) : null,
                isActive: entryEditor.isActive,
            };
            const url = entryEditor.mode === 'edit' && entryEditor.entryId
                ? `/api/admin/super/rankings/${encodeURIComponent(selectedRanking.id)}/entries/${encodeURIComponent(entryEditor.entryId)}`
                : `/api/admin/super/rankings/${encodeURIComponent(selectedRanking.id)}/entries`;
            const method = entryEditor.mode === 'edit' && entryEditor.entryId ? 'PATCH' : 'POST';
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const result = await readJson(response);
            applyDetail(result.data as RankingDetail);
            setEntryEditor(createEntryEditorState());
            setFeedback({
                tone: 'success',
                text:
                    method === 'PATCH'
                        ? 'Club del ranking actualizado.'
                        : 'Club agregado al ranking.',
            });
        } catch (error) {
            setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo guardar la fila del ranking.' });
        } finally {
            setEntryBusy(false);
        }
    };
    const handleDeleteEntry = async (entry: RankingEntry) => {
        if (!selectedRanking) return;
        const clubName = getRankingClubName(entry);
        if (!window.confirm(`Quitar a ${clubName} de ${selectedRanking.name}?`)) return;

        setEntryBusy(true);
        try {
            const response = await fetch(
                `/api/admin/super/rankings/${encodeURIComponent(selectedRanking.id)}/entries/${encodeURIComponent(entry.id)}`,
                { method: 'DELETE' },
            );
            const result = await readJson(response);
            applyDetail(result.data as RankingDetail);
            setEntryEditor((current) => (
                current.entryId === entry.id ? createEntryEditorState() : current
            ));
            setFeedback({ tone: 'success', text: `${clubName} fue quitado del ranking.` });
        } catch (error) {
            setFeedback({ tone: 'error', text: error instanceof Error ? error.message : 'No se pudo quitar el club del ranking.' });
        } finally {
            setEntryBusy(false);
        }
    };

    const renderWorkspaceLayout = rankings.length >= 0;
    if (renderWorkspaceLayout) {
        return (
            <div className={styles.pageShell}>
                <header className={styles.chromeHeader}>
                    <div className={styles.chromeLeft}>
                        <div className={styles.brandMark}>G</div>
                        <div className={styles.chromeDivider} />
                        <div className={styles.breadcrumbs}>
                            <span>Rankings</span>
                            <span>/</span>
                            <strong>{selectedRanking?.name || 'Workspace'}</strong>
                        </div>
                    </div>
                    <div className={styles.chromeStatus}>
                        <span className={styles.systemDot} />
                        <span>{loadingList ? 'Sincronizando rankings' : 'Workspace operativo'}</span>
                    </div>
                </header>

                {feedback ? <div className={`${styles.inlineNotice} ${feedback.tone === 'success' ? styles.inlineNoticeSuccess : feedback.tone === 'error' ? styles.inlineNoticeError : styles.inlineNoticeInfo}`}>{feedback.tone === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<span>{feedback.text}</span></div> : null}

                <section className={styles.workspaceFrame}>
                    <aside className={styles.sidebar}>
                        <div className={styles.sidebarHeader}>
                            <span className={styles.sidebarLabel}>Rankings activos</span>
                            <span className={styles.sidebarCount}>{loadingList ? 'Sync' : rankings.length}</span>
                        </div>

                        <details className={styles.sidebarComposer}>
                            <summary className={styles.sidebarComposerSummary}>
                                <span>Nuevo ranking</span>
                                <Plus size={14} />
                            </summary>
                            <div className={styles.sidebarComposerBody}>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}><label className={styles.formLabel}>Nombre</label><input className={styles.formInput} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ranking Inter Clubes" /></div>
                                    <div className={styles.formGroup}><label className={styles.formLabel}>Deporte</label><select className={styles.formSelect} value={draft.sport} onChange={(event) => setDraft((current) => ({ ...current, sport: event.target.value }))}><option value="rugby">Rugby</option><option value="football">Futbol</option><option value="hockey">Hockey</option></select></div>
                                </div>
                                <div className={styles.formRow}>
                                    <div className={styles.formGroup}><label className={styles.formLabel}>Temporada</label><input className={styles.formInput} value={draft.season} onChange={(event) => setDraft((current) => ({ ...current, season: event.target.value }))} placeholder="2025" /></div>
                                    <div className={styles.formGroup}><label className={styles.formLabel}>Alcance</label><input className={styles.formInput} value={draft.scope} onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value }))} /></div>
                                </div>
                                <div className={styles.formGroup}><label className={styles.formLabel}>Descripcion</label><textarea className={styles.formTextarea} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></div>
                                <button className={styles.createBtn} type="button" onClick={handleCreateRanking} disabled={!draft.name.trim()}><Plus size={16} />Crear ranking</button>
                            </div>
                        </details>

                        <div className={styles.sidebarList}>
                            {rankings.map((ranking) => {
                                const summary = summariesById[ranking.id];
                                const isActive = ranking.id === selectedRankingId;
                                const statusLabel = summary ? summary.stale_from_match_id ? 'Stale' : 'Guardado' : 'Borrador';
                                const statusClass = summary ? summary.stale_from_match_id ? styles.statusChipWarning : styles.statusChipSuccess : styles.statusChipNeutral;
                                return (
                                    <button key={ranking.id} type="button" className={`${styles.sidebarItem} ${isActive ? styles.sidebarItemActive : ''}`} onClick={() => setSelectedRankingId(ranking.id)}>
                                        <div className={styles.sidebarItemTop}>
                                            <strong>{ranking.name}</strong>
                                            <span className={`${styles.statusChip} ${statusClass}`}>{statusLabel}</span>
                                        </div>
                                        <span className={styles.sidebarItemMeta}>{ranking.sport} • base {ranking.season}</span>
                                        <span className={styles.sidebarItemDescription}>{ranking.description || 'Sin descripcion cargada.'}</span>
                                    </button>
                                );
                            })}
                        </div>

                        <a href="#workspace-support" className={styles.sidebarFooterBtn}><Shield size={14} />Soporte tecnico</a>
                    </aside>
                    <div className={styles.workspaceMain}>
                        <div className={styles.toolbar}>
                            <div className={styles.metricRow}>
                                <div className={styles.metricBadge}><span>Clubes</span><strong>{selectedDetail?.entries.length ?? 0}</strong></div>
                                <div className={styles.metricBadge}><span>Activos</span><strong>{activeEntriesCount}</strong></div>
                                <div className={styles.metricBadge}><span>Overrides</span><strong>{selectedDetail?.manualAdjustments.length ?? 0}</strong></div>
                                <div className={styles.metricBadge}><span>Ultima sync</span><strong>{formatDateTime(selectedSummary?.updated_at || selectedSummary?.backfill_completed_at)}</strong></div>
                            </div>
                            <div className={styles.toolbarActions}>
                                <button className={styles.secondaryBtn} onClick={downloadTemplate} type="button"><Download size={14} />Plantilla</button>
                                <button type="button" className={styles.secondaryBtn} onClick={handleSaveBase} disabled={!selectedRanking || savingBase}>{savingBase ? <RefreshCw size={14} className={styles.spin} /> : <Save size={14} />}Guardar base</button>
                                <button type="button" className={styles.secondaryBtn} onClick={handleBackfill} disabled={!selectedSummary || backfilling || hasSeasonBootstrap}>{backfilling ? <RefreshCw size={14} className={styles.spin} /> : <RefreshCw size={14} />}{hasSeasonBootstrap ? 'Inicializado' : 'Inicializar 2026'}</button>
                                <button type="button" className={styles.secondaryBtn} onClick={() => selectedSummary?.stale_from_match_id ? handleRecalculateFromMatch(selectedSummary.stale_from_match_id) : undefined} disabled={!selectedSummary?.stale_from_match_id || Boolean(recalculatingMatchId)}>{recalculatingMatchId ? <RefreshCw size={14} className={styles.spin} /> : <RotateCcw size={14} />}Recalcular</button>
                                <Link href={publicRankingHref} className={styles.secondaryBtn}><ArrowUpRight size={14} />Ver publica</Link>
                            </div>
                        </div>

                        <details className={styles.workspacePanel}>
                            <summary className={styles.panelSummary}>
                                <div>
                                    <span className={styles.panelEyebrow}>Importacion</span>
                                    <strong>Excel base y matching</strong>
                                </div>
                                <span className={`${styles.statusChip} ${importPlan.blockedReason ? styles.statusChipWarning : styles.statusChipInfo}`}>{importPlan.blockedReason ? 'Revisar' : selectedRanking?.preview ? 'Cargado' : 'Listo para importar'}</span>
                            </summary>
                            <div className={styles.panelBody}>
                                <div className={styles.uploadPanel}>
                                    <label className={styles.dropzone}><input className={styles.fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} /><div className={styles.dropIcon}>{selectedRanking?.isParsing ? <RefreshCw size={26} className={styles.spin} /> : <UploadCloud size={26} />}</div><strong>Sube el Excel base del ranking</strong><span>La plataforma detecta columnas, hace matching de clubes y prepara la base inicial.</span></label>
                                    {selectedRanking?.error ? <div className={styles.alertError}><AlertCircle size={16} /><span>{selectedRanking.error}</span></div> : null}
                                    {selectedRanking?.preview ? <>
                                        <div className={styles.fileSummary}>
                                            <div><span className={styles.summaryLabel}>Archivo</span><strong>{selectedRanking.preview.fileName}</strong></div>
                                            <div><span className={styles.summaryLabel}>Tamano</span><strong>{selectedRanking.preview.fileSizeLabel}</strong></div>
                                            <div><span className={styles.summaryLabel}>Hojas</span><strong>{selectedRanking.preview.sheetNames.length}</strong></div>
                                        </div>
                                        <div className={styles.sheetTabs}>
                                            {selectedRanking.preview.sheetNames.map((sheetName) => <button key={sheetName} type="button" className={`${styles.sheetTab} ${selectedRanking.selectedSheet === sheetName ? styles.sheetTabActive : ''}`} onClick={() => patchRanking(selectedRanking.id, (ranking) => ({ ...ranking, selectedSheet: sheetName }))}>{sheetName}</button>)}
                                        </div>
                                        <div className={styles.analysisToolbar}>
                                            <div className={styles.selectorGroup}>
                                                <label className={styles.selectorLabel}>Columna de club</label>
                                                <select className={styles.selectorSelect} value={clubSelectValue} onChange={(event) => patchRanking(selectedRanking.id, (ranking) => ({ ...ranking, selectedClubHeader: event.target.value === '__auto__' ? '' : event.target.value }))}>
                                                    <option value="__auto__">{sheetAnalysis.suggestedClubHeader ? `Auto: ${sheetAnalysis.suggestedClubHeader}` : 'Auto: sin detectar'}</option>
                                                    {currentHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                                                </select>
                                            </div>
                                            <div className={styles.analysisGrid}>
                                                <div className={styles.analysisMetric}><span>Match clubes</span><strong>{rowClubSummary.rowsWithValue ? `${rowClubSummary.matchedRows}/${rowClubSummary.rowsWithValue}` : 'Sin datos'}</strong></div>
                                                <div className={styles.analysisMetric}><span>Cobertura</span><strong>{formatPercent(rowClubSummary.matchCoverage)}</strong></div>
                                                <div className={styles.analysisMetric}><span>Filas validas</span><strong>{importPlan.validRows}</strong></div>
                                                <div className={styles.analysisMetric}><span>Ambiguas</span><strong>{importPlan.ambiguousRows}</strong></div>
                                                <div className={styles.analysisMetric}><span>Duplicadas</span><strong>{importPlan.duplicateRows}</strong></div>
                                            </div>
                                        </div>
                                    </> : null}
                                </div>
                            </div>
                        </details>

                        <div className={styles.workspaceSurface}>
                            <div className={styles.surfaceHeader}>
                                <div>
                                    <span className={styles.panelEyebrow}>Tabla operativa</span>
                                    <h2 className={styles.surfaceTitle}>{selectedRanking?.name || 'Selecciona un ranking'}</h2>
                                    <p className={styles.workspaceSubtitle}>Base {selectedRanking?.season || '-'} / resultados {selectedResultsSeason || '-'}</p>
                                </div>
                                <span className={`${styles.statusChip} ${selectedSummary ? selectedSummary.stale_from_match_id ? styles.statusChipWarning : styles.statusChipSuccess : styles.statusChipNeutral}`}>{selectedSummary ? selectedSummary.stale_from_match_id ? 'Requiere recalc' : 'OK' : 'Sin guardar'}</span>
                            </div>
                            {loadingDetailId === selectedRanking?.id && !selectedDetail ? <div className={styles.emptyPreview}>Cargando detalle...</div> : selectedDetail ? <>
                                <div className={styles.tableToolbar}>
                                    <div className={styles.tableControls}>
                                        <div className={styles.searchGroup}><label className={styles.selectorLabel}>Buscar club</label><input className={styles.formInput} value={entryFilter} onChange={(event) => setEntryFilter(event.target.value)} placeholder="CASI, Mendoza, Buenos Aires..." /></div>
                                        <div className={styles.searchGroup}><label className={styles.selectorLabel}>Region</label><select className={styles.formSelect} value={entryRegionFilter} onChange={(event) => setEntryRegionFilter(event.target.value)}><option value="all">Todas las regiones</option>{entryRegions.map((region) => <option key={region} value={region}>{region}</option>)}</select></div>
                                    </div>
                                    <div className={styles.tableToolbarMeta}>
                                        <span>{filteredEntries.length} de {selectedDetail.entries.length} clubes</span>
                                        <span>{selectedDetail.ranking.last_incremental_match_id ? `Ultimo match ${selectedDetail.ranking.last_incremental_match_id}` : 'Sin incremental aplicado'}</span>
                                    </div>
                                    <div className={styles.tableToolbarActions}>
                                        <ExportImage className={styles.exportAction} template="standings" filename={`ranking-${selectedRanking?.name || 'clubes'}`} data={{ title: selectedRanking?.name || 'Ranking de Clubes', subtitle: `Base ${selectedRanking?.season || '-'} / resultados ${selectedResultsSeason || '-'}`, rows: rankingExportRows, columnLabels: RANKING_EXPORT_COLUMN_LABELS, plainDiff: true }} />
                                    </div>
                                </div>
                                <div className={styles.standingsTableWrap}>
                                    <table className={styles.standingsTable}>
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Club</th>
                                                <th>OVR</th>
                                                <th>Anterior</th>
                                                <th>Delta</th>
                                                <th>TR</th>
                                                <th>Estado</th>
                                                <th>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleEntries.map((entry, index) => {
                                                const previousRating = getRankingPreviousRating(entry);
                                                const delta = getRankingDelta(entry.current_rating, previousRating);
                                                const absoluteIndex = paginatedEntries.start + index + 1;
                                                const isSelected = entryEditor.entryId === entry.id;
                                                return (
                                                    <tr key={entry.id} className={isSelected ? styles.tableRowActive : undefined} onClick={() => openEditEntryEditor(entry)}>
                                                        <td><span className={styles.rankBadge}>{entry.current_position || absoluteIndex}</span></td>
                                                        <td><div className={styles.standingsTeamCell}>{entry.clubs?.logo_url ? <img src={entry.clubs.logo_url} alt="" className={styles.standingsTeamLogo} /> : <div className={styles.standingsTeamLogoPlaceholder} />}<div className={styles.teamCellCopy}><strong>{getRankingClubName(entry)}</strong><span>{getRankingClubShortName(entry)}</span></div></div></td>
                                                        <td>{formatRankingRating(entry.current_rating)}</td>
                                                        <td>{formatRankingRating(previousRating)}</td>
                                                        <td className={delta.tone === 'positive' ? styles.deltaPositive : delta.tone === 'negative' ? styles.deltaNegative : styles.deltaNeutral}>{delta.label}</td>
                                                        <td>{entry.source_region || '-'}</td>
                                                        <td><span className={`${styles.statusChip} ${entry.is_active === false ? styles.statusChipNeutral : styles.statusChipSuccess}`}>{entry.is_active === false ? 'Inactivo' : 'Activo'}</span></td>
                                                        <td><div className={styles.entryRowActions}><button type="button" className={styles.iconBtn} onClick={(event) => { event.stopPropagation(); openEditEntryEditor(entry); }} disabled={entryBusy} aria-label={`Editar ${getRankingClubName(entry)}`}><PencilLine size={14} /></button><button type="button" className={styles.iconBtnDanger} onClick={(event) => { event.stopPropagation(); handleDeleteEntry(entry); }} disabled={entryBusy} aria-label={`Quitar ${getRankingClubName(entry)}`}><Trash2 size={14} /></button></div></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className={styles.paginationBar}>
                                    <span className={styles.paginationMeta}>Mostrando {visibleEntries.length ? paginatedEntries.start + 1 : 0}-{paginatedEntries.start + visibleEntries.length} de {filteredEntries.length} clubes</span>
                                    <div className={styles.paginationControls}>
                                        <button type="button" className={styles.secondaryBtn} onClick={() => setEntryPage((current) => Math.max(1, current - 1))} disabled={paginatedEntries.page <= 1}><ChevronLeft size={14} />Anterior</button>
                                        <span className={styles.paginationPage}>Pagina {paginatedEntries.page} de {paginatedEntries.totalPages}</span>
                                        <button type="button" className={styles.secondaryBtn} onClick={() => setEntryPage((current) => Math.min(paginatedEntries.totalPages, current + 1))} disabled={paginatedEntries.page >= paginatedEntries.totalPages}>Siguiente<ChevronRight size={14} /></button>
                                    </div>
                                </div>
                            </> : <div className={styles.emptyPreview}>Guarda la base para persistir este ranking.</div>}
                            {selectedSummary?.stale_reason ? <div className={styles.staleNotice}><AlertCircle size={16} /><span>{selectedSummary.stale_reason}</span></div> : null}
                        </div>
                    </div>
                    <aside className={styles.inspector}>
                        <div className={styles.inspectorHeader}>
                            <div>
                                <span className={styles.panelEyebrow}>Inspector</span>
                                <h2 className={styles.inspectorTitle}>{inspectorTitle}</h2>
                                <p className={styles.workspaceSubtitle}>{entryEditor.mode === 'edit' ? 'Edicion contextual del club seleccionado.' : 'Alta manual sin salir de la tabla.'}</p>
                            </div>
                            <button type="button" className={styles.secondaryBtn} onClick={openCreateEntryEditor} disabled={entryBusy}><Plus size={14} />Nuevo club</button>
                        </div>

                        <div className={styles.inspectorScroll}>
                            <section className={styles.inspectorCard}>
                                <div className={styles.inspectorCardHeader}>
                                    <div><span className={styles.panelEyebrow}>Entidad</span><strong>Informacion base</strong></div>
                                    <span className={`${styles.statusChip} ${styles.statusChipInfo}`}>{entryEditor.mode === 'edit' ? 'Editando' : 'Alta manual'}</span>
                                </div>
                                {selectedSummary ? <form className={styles.entryEditor} onSubmit={handleSaveEntry}><div className={styles.formRow}><div className={styles.formGroup}><label className={styles.formLabel}>Club</label><select className={styles.formSelect} value={entryEditor.clubId} onChange={(event) => setEntryEditor((current) => ({ ...current, clubId: event.target.value }))}><option value="">Elegir club...</option>{catalogClubs.map((club) => <option key={club.id} value={club.id}>{club.shortName ? `${club.name} (${club.shortName})` : club.name}</option>)}</select></div><div className={styles.formGroup}><label className={styles.formLabel}>Nombre en ranking</label><input className={styles.formInput} value={entryEditor.sourceName} onChange={(event) => setEntryEditor((current) => ({ ...current, sourceName: event.target.value }))} placeholder="Se completa con el nombre del club si lo dejas vacio" /></div></div><div className={styles.formRow}><div className={styles.formGroup}><label className={styles.formLabel}>Rating base</label><input className={styles.formInput} value={entryEditor.initialRating} onChange={(event) => setEntryEditor((current) => ({ ...current, initialRating: event.target.value }))} placeholder="81.25" /></div><div className={styles.formGroup}><label className={styles.formLabel}>TR / Region</label><input className={styles.formInput} value={entryEditor.sourceRegion} onChange={(event) => setEntryEditor((current) => ({ ...current, sourceRegion: event.target.value }))} placeholder="Buenos Aires" /></div></div><div className={styles.formRow}><div className={styles.formGroup}><label className={styles.formLabel}>Posicion base</label><input className={styles.formInput} value={entryEditor.sourcePosition} onChange={(event) => setEntryEditor((current) => ({ ...current, sourcePosition: event.target.value }))} placeholder="1" /></div><div className={styles.formGroup}><label className={styles.formLabel}>Puesto anterior</label><input className={styles.formInput} value={entryEditor.sourcePreviousPosition} onChange={(event) => setEntryEditor((current) => ({ ...current, sourcePreviousPosition: event.target.value }))} placeholder="2" /></div><div className={styles.formGroup}><label className={styles.formLabel}>Variacion</label><input className={styles.formInput} value={entryEditor.sourceVariation} onChange={(event) => setEntryEditor((current) => ({ ...current, sourceVariation: event.target.value }))} placeholder="+1" /></div></div><label className={styles.checkboxRow}><input type="checkbox" checked={entryEditor.isActive} onChange={(event) => setEntryEditor((current) => ({ ...current, isActive: event.target.checked }))} /><span>Activo dentro del ranking</span></label><div className={styles.editorActions}><button type="submit" className={styles.createBtn} disabled={entryBusy}>{entryBusy ? <RefreshCw size={16} className={styles.spin} /> : <Save size={16} />}{entryEditor.mode === 'edit' ? 'Guardar cambios' : 'Agregar club'}</button></div><p className={styles.entryEditorHint}>Si el ranking ya tiene backfill, al guardar se reconstruye automaticamente para respetar la historia 2026.</p></form> : <div className={styles.emptyPreview}>Guarda la base primero para poder gestionar clubes.</div>}
                            </section>

                            <section className={styles.inspectorCard}>
                                <div className={styles.inspectorCardHeader}>
                                    <div><span className={styles.panelEyebrow}>Ranking engine</span><strong>Override manual</strong></div>
                                    <span className={`${styles.statusChip} ${styles.statusChipWarning}`}>Override</span>
                                </div>
                                {selectedDetail ? <form className={styles.manualForm} onSubmit={handleManualAdjustment}><div className={styles.formGroup}><label className={styles.formLabel}>Club</label><select className={styles.formSelect} value={manualForm.clubId} onChange={(event) => setManualForm((current) => ({ ...current, clubId: event.target.value }))}>{selectedDetail.entries.map((entry) => <option key={entry.club_id} value={entry.club_id}>{entry.clubs?.name || entry.source_name}</option>)}</select></div><div className={styles.formRow}><div className={styles.formGroup}><label className={styles.formLabel}>Modo</label><select className={styles.formSelect} value={manualForm.mode} onChange={(event) => setManualForm((current) => ({ ...current, mode: event.target.value === 'set' ? 'set' : 'delta' }))}><option value="delta">Sumar / restar</option><option value="set">Fijar valor</option></select></div><div className={styles.formGroup}><label className={styles.formLabel}>Valor</label><input className={styles.formInput} value={manualForm.value} onChange={(event) => setManualForm((current) => ({ ...current, value: event.target.value }))} placeholder={manualForm.mode === 'set' ? '81.25' : '+0.50'} /></div></div><div className={styles.formGroup}><label className={styles.formLabel}>Motivo</label><textarea className={styles.formTextarea} value={manualForm.reason} onChange={(event) => setManualForm((current) => ({ ...current, reason: event.target.value }))} /></div><button type="submit" className={styles.createBtn} disabled={manualBusy}>{manualBusy ? <RefreshCw size={16} className={styles.spin} /> : <Save size={16} />}Aplicar override</button></form> : <div className={styles.emptyPreview}>Guarda la base primero.</div>}
                                {selectedDetail?.manualAdjustments.length ? <div className={styles.activityList}>{selectedDetail.manualAdjustments.map((adjustment) => <div key={adjustment.id} className={styles.activityItem}><div className={styles.activityTop}><strong>{entryNameMap.get(adjustment.club_id) || adjustment.club_id}</strong><span className={`${baseStyles.pill} ${baseStyles.pillWarning}`}>{adjustment.mode}</span></div><span className={styles.columnMeta}>Valor {Number(adjustment.value) >= 0 ? '+' : ''}{formatRankingRating(Number(adjustment.value))} / Resultado {formatRankingRating(adjustment.resulting_rating === null ? null : Number(adjustment.resulting_rating))}</span><span className={styles.columnMeta}>{adjustment.reason} / {formatDateTime(adjustment.created_at)}</span></div>)}</div> : null}
                            </section>

                            <div className={styles.inspectorStack} id="workspace-support">
                                <div className={styles.supportLead}>
                                    <div><span className={styles.panelEyebrow}>Soporte</span><h3 className={styles.supportTitle}>Control de importacion y recalc</h3></div>
                                    <p className={styles.sectionText}>Todo el soporte operativo queda en este rail para no romper el foco sobre la tabla.</p>
                                </div>
                                <div className={baseStyles.card}><div className={baseStyles.cardHeader}><h2 className={baseStyles.cardTitle}>Importacion del Excel</h2><span className={`${baseStyles.pill} ${importPlan.blockedReason ? baseStyles.pillWarning : baseStyles.pillSuccess}`}>{importPlan.blockedReason ? 'Revisar' : 'Lista'}</span></div><div className={styles.analysisPanel}><div className={styles.analysisGridCompact}><div className={styles.analysisMetric}><span>Catalogo</span><strong>{catalogState.loading ? 'Cargando...' : `${catalogClubs.length} clubes`}</strong></div><div className={styles.analysisMetric}><span>Rating</span><strong>{importPlan.ratingHeader || 'Pendiente'}</strong></div><div className={styles.analysisMetric}><span>Sin match</span><strong>{importPlan.unresolvedRows}</strong></div><div className={styles.analysisMetric}><span>Sin rating</span><strong>{importPlan.missingRatingRows}</strong></div></div>{importPlan.blockedReason ? <div className={styles.alertError}><AlertCircle size={16} /><span>{importPlan.blockedReason}</span></div> : <div className={styles.inlineHint}><CheckCircle2 size={16} /><span>La base esta lista para guardarse.</span></div>}{importPlan.duplicateRows > 0 ? <div className={`${styles.inlineHint} ${styles.inlineNoticeInfo}`}><CheckCircle2 size={16} /><span>Se ignoraran {importPlan.duplicateRows} filas duplicadas y se tomara la primera valida de cada club.</span></div> : null}{catalogState.error && catalogState.sport === selectedRanking?.sport ? <div className={styles.alertError}><AlertCircle size={16} /><span>{catalogState.error}</span></div> : null}</div></div>
                                {unresolvedRowDetails.length ? <div className={baseStyles.card}><div className={baseStyles.cardHeader}><h2 className={baseStyles.cardTitle}>Filas sin club resuelto</h2><span className={`${baseStyles.pill} ${baseStyles.pillWarning}`}>{unresolvedRowDetails.length}</span></div><div className={styles.blockingPanel}><div className={styles.blockingHint}><AlertCircle size={16} /><span>Estas filas bloquean el guardado. Puedes vincularlas manualmente desde aca.</span></div><div className={styles.blockingList}>{unresolvedRowDetails.map((row) => <div key={`unresolved-${row.rowIndex}`} className={styles.blockingItem}><div className={styles.blockingTop}><strong>Fila {row.excelRowNumber}</strong><span className={`${baseStyles.pill} ${baseStyles.pillWarning}`}>Sin match</span></div><span className={styles.blockingValue}>{row.sourceValue}</span><div className={styles.blockingControl}><label className={styles.selectorLabel}>Vincular con</label><select className={`${styles.formSelect} ${styles.blockingSelect}`} value={manualClubLinks[row.sourceValue] || ''} onChange={(event) => setManualClubLink(row.sourceValue, event.target.value)}><option value="">Elegir club...</option>{catalogClubs.map((club) => <option key={`${row.rowIndex}-${club.id}`} value={club.id}>{club.shortName ? `${club.name} (${club.shortName})` : club.name}</option>)}</select></div></div>)}</div></div></div> : null}
                                {manualLinkDetails.length ? <div className={baseStyles.card}><div className={baseStyles.cardHeader}><h2 className={baseStyles.cardTitle}>Vinculaciones manuales</h2><span className={`${baseStyles.pill} ${baseStyles.pillInfo}`}>{manualLinkDetails.length}</span></div><div className={styles.blockingPanel}><div className={styles.blockingList}>{manualLinkDetails.map((item) => <div key={`manual-link-${item.sourceValue}`} className={styles.blockingItem}><div className={styles.blockingTop}><strong>{item.sourceValue}</strong><span className={`${baseStyles.pill} ${baseStyles.pillInfo}`}>Manual</span></div><span className={styles.matchMeta}>{item.clubShortName ? `${item.clubName} (${item.clubShortName})` : item.clubName}</span><button type="button" className={styles.linkBtn} onClick={() => setManualClubLink(item.sourceValue, '')}>Quitar vinculo</button></div>)}</div></div></div> : null}
                            </div>
                        </div>
                    </aside>
                </section>

                <footer className={styles.statusBar}>
                    <div className={styles.statusCluster}>
                        <span className={styles.statusItem}><span className={styles.systemDot} />Catalogo {catalogState.loading ? 'sync' : `${catalogClubs.length} clubes`}</span>
                        <span className={styles.statusDivider}>|</span>
                        <span className={styles.statusItem}>Rows {selectedDetail?.entries.length ?? 0}</span>
                    </div>
                    <div className={styles.statusCluster}>
                        <span className={styles.statusItem}>Seleccion {selectedInspectorEntry ? getRankingClubShortName(selectedInspectorEntry) || getRankingClubName(selectedInspectorEntry) : 'ninguna'}</span>
                        <span className={styles.statusDivider}>|</span>
                        <span className={styles.statusItem}>Base {selectedRanking?.season || '-'}</span>
                    </div>
                </footer>
            </div>
        );
    }

    return (
        <>
            <header className={baseStyles.header}>
                <div className={baseStyles.headerLeft}>
                    <h1 className={baseStyles.pageTitle}>Ranking de Clubes</h1>
                    <p className={baseStyles.pageSubtitle}>Excel base, World Rugby, backfill 2026, incremental y override manual.</p>
                </div>
                <div className={baseStyles.headerRight}>
                    <button className={baseStyles.viewSiteBtn} onClick={downloadTemplate} type="button">Descargar plantilla</button>
                </div>
            </header>
            <div className={baseStyles.content}>
                <section className={baseStyles.statsGrid}>
                    <div className={baseStyles.statCard}><div className={baseStyles.statIcon}><Shield size={22} /></div><div className={baseStyles.statInfo}><span className={baseStyles.statValue}>{rankings.length}</span><span className={baseStyles.statLabel}>Rankings abiertos</span></div></div>
                    <div className={baseStyles.statCard}><div className={baseStyles.statIcon}><Table2 size={22} /></div><div className={baseStyles.statInfo}><span className={baseStyles.statValue}>{Object.keys(summariesById).length}</span><span className={baseStyles.statLabel}>Rankings guardados</span></div></div>
                    <div className={baseStyles.statCard}><div className={baseStyles.statIcon}><FileSpreadsheet size={22} /></div><div className={baseStyles.statInfo}><span className={baseStyles.statValue}>{importPlan.validRows}</span><span className={baseStyles.statLabel}>Filas listas</span></div></div>
                    <div className={baseStyles.statCard}><div className={baseStyles.statIcon}><CheckCircle2 size={22} /></div><div className={baseStyles.statInfo}><span className={baseStyles.statValue}>{selectedDetail?.entries.length ?? 0}</span><span className={baseStyles.statLabel}>Clubes persistidos</span></div></div>
                </section>
                {feedback ? <div className={`${styles.inlineNotice} ${feedback.tone === 'success' ? styles.inlineNoticeSuccess : feedback.tone === 'error' ? styles.inlineNoticeError : styles.inlineNoticeInfo}`}>{feedback.tone === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<span>{feedback.text}</span></div> : null}
                <section className={styles.managerGrid}>
                    <aside className={styles.managerRail}>
                        <div className={`${baseStyles.card} ${styles.creatorForm}`}>
                            <div className={styles.sectionLead}>
                                <span className={styles.sectionKicker}>Configuracion</span>
                                <div>
                                    <h2 className={styles.sectionTitle}>Crear ranking</h2>
                                    <p className={styles.sectionText}>Abre una nueva base de trabajo y despues cargale su Excel.</p>
                                </div>
                            </div>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}><label className={styles.formLabel}>Nombre</label><input className={styles.formInput} value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ranking Inter Clubes" /></div>
                                <div className={styles.formGroup}><label className={styles.formLabel}>Deporte</label><select className={styles.formSelect} value={draft.sport} onChange={(event) => setDraft((current) => ({ ...current, sport: event.target.value }))}><option value="rugby">Rugby</option><option value="football">Futbol</option><option value="hockey">Hockey</option></select></div>
                            </div>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}><label className={styles.formLabel}>Temporada base</label><input className={styles.formInput} value={draft.season} onChange={(event) => setDraft((current) => ({ ...current, season: event.target.value }))} placeholder="2025" /></div>
                                <div className={styles.formGroup}><label className={styles.formLabel}>Alcance</label><input className={styles.formInput} value={draft.scope} onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value }))} /></div>
                            </div>
                            <div className={styles.formGroup}><label className={styles.formLabel}>Descripcion</label><textarea className={styles.formTextarea} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></div>
                            <button className={styles.createBtn} type="button" onClick={handleCreateRanking} disabled={!draft.name.trim()}><Plus size={16} />Crear ranking</button>
                        </div>
                        <div className={`${baseStyles.card} ${styles.rankingList}`}>
                            <div className={baseStyles.cardHeader}><div><h2 className={baseStyles.cardTitle}>Rankings</h2><p className={styles.sectionText}>Selecciona el ranking con el que queres trabajar.</p></div><span className={`${baseStyles.pill} ${baseStyles.pillInfo}`}>{loadingList ? 'Actualizando...' : `${rankings.length} activos`}</span></div>
                            {rankings.map((ranking) => {
                                const summary = summariesById[ranking.id];
                                return <button key={ranking.id} type="button" className={`${styles.rankingCard} ${ranking.id === selectedRankingId ? styles.rankingCardActive : ''}`} onClick={() => setSelectedRankingId(ranking.id)}><div className={styles.rankingCardTop}><strong>{ranking.name}</strong><span className={`${baseStyles.pill} ${summary ? summary.stale_from_match_id ? baseStyles.pillWarning : baseStyles.pillSuccess : baseStyles.pillNeutral}`}>{summary ? summary.stale_from_match_id ? 'Stale' : 'Guardado' : 'Borrador'}</span></div><span className={styles.rankingMeta}>{ranking.sport} / base {ranking.season}</span><p className={styles.rankingDescription}>{ranking.description || 'Sin descripcion cargada.'}</p></button>;
                            })}
                        </div>
                    </aside>
                    <div className={styles.workspaceColumn}>
                        <div className={styles.workspaceIntro}>
                            <div>
                                <span className={styles.sectionKicker}>Workspace</span>
                                <h2 className={styles.sectionTitle}>Operar ranking</h2>
                            </div>
                            <p className={styles.sectionText}>Primero importa o revisa la base, despues edita clubes y por ultimo controla la tabla final.</p>
                        </div>
                        <div className={baseStyles.card}>
                            <div className={baseStyles.cardHeader}>
                                <div>
                                    <h2 className={baseStyles.cardTitle}>{selectedRanking?.name || 'Selecciona un ranking'}</h2>
                                    <p className={styles.workspaceSubtitle}>Base {selectedRanking?.season || '-'} / resultados {selectedResultsSeason || '-'}</p>
                                </div>
                            </div>
                            <div className={styles.actionStrip}>
                                <button type="button" className={styles.secondaryBtn} onClick={handleSaveBase} disabled={!selectedRanking || savingBase}>{savingBase ? <RefreshCw size={14} className={styles.spin} /> : <Save size={14} />}Guardar base</button>
                                <button type="button" className={styles.secondaryBtn} onClick={handleBackfill} disabled={!selectedSummary || backfilling}>{backfilling ? <RefreshCw size={14} className={styles.spin} /> : <RefreshCw size={14} />}Backfill</button>
                                <button type="button" className={styles.secondaryBtn} onClick={() => selectedSummary?.stale_from_match_id ? handleRecalculateFromMatch(selectedSummary.stale_from_match_id) : undefined} disabled={!selectedSummary?.stale_from_match_id || Boolean(recalculatingMatchId)}>{recalculatingMatchId ? <RefreshCw size={14} className={styles.spin} /> : <RotateCcw size={14} />}Recalcular stale</button>
                                <Link href={publicRankingHref} className={styles.secondaryBtn}><ArrowUpRight size={14} />Ver publica</Link>
                            </div>
                            <div className={styles.uploadPanel}>
                                <label className={styles.dropzone}><input className={styles.fileInput} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} /><div className={styles.dropIcon}>{selectedRanking?.isParsing ? <RefreshCw size={26} className={styles.spin} /> : <UploadCloud size={26} />}</div><strong>Sube el Excel base del ranking</strong><span>La web detecta columnas, hace matching de clubes y prepara la base inicial.</span></label>
                                {selectedRanking?.error ? <div className={styles.alertError}><AlertCircle size={16} /><span>{selectedRanking.error}</span></div> : null}
                                {selectedRanking?.preview ? <>
                                    <div className={styles.fileSummary}>
                                        <div>
                                            <span className={styles.summaryLabel}>Archivo</span>
                                            <strong>{selectedRanking.preview.fileName}</strong>
                                        </div>
                                        <div>
                                            <span className={styles.summaryLabel}>Tamano</span>
                                            <strong>{selectedRanking.preview.fileSizeLabel}</strong>
                                        </div>
                                        <div>
                                            <span className={styles.summaryLabel}>Hojas</span>
                                            <strong>{selectedRanking.preview.sheetNames.length}</strong>
                                        </div>
                                    </div>
                                    <div className={styles.sheetTabs}>
                                        {selectedRanking.preview.sheetNames.map((sheetName) => (
                                            <button
                                                key={sheetName}
                                                type="button"
                                                className={`${styles.sheetTab} ${selectedRanking.selectedSheet === sheetName ? styles.sheetTabActive : ''}`}
                                                onClick={() => patchRanking(selectedRanking.id, (ranking) => ({ ...ranking, selectedSheet: sheetName }))}
                                            >
                                                {sheetName}
                                            </button>
                                        ))}
                                    </div>
                                    <div className={styles.analysisToolbar}>
                                        <div className={styles.selectorGroup}>
                                            <label className={styles.selectorLabel}>Columna de club</label>
                                            <select
                                                className={styles.selectorSelect}
                                                value={clubSelectValue}
                                                onChange={(event) => patchRanking(selectedRanking.id, (ranking) => ({ ...ranking, selectedClubHeader: event.target.value === '__auto__' ? '' : event.target.value }))}
                                            >
                                                <option value="__auto__">{sheetAnalysis.suggestedClubHeader ? `Auto: ${sheetAnalysis.suggestedClubHeader}` : 'Auto: sin detectar'}</option>
                                                {currentHeaders.map((header) => <option key={header} value={header}>{header}</option>)}
                                            </select>
                                        </div>
                                        <div className={styles.analysisGrid}>
                                            <div className={styles.analysisMetric}><span>Match clubes</span><strong>{rowClubSummary.rowsWithValue ? `${rowClubSummary.matchedRows}/${rowClubSummary.rowsWithValue}` : 'Sin datos'}</strong></div>
                                            <div className={styles.analysisMetric}><span>Cobertura</span><strong>{formatPercent(rowClubSummary.matchCoverage)}</strong></div>
                                            <div className={styles.analysisMetric}><span>Filas validas</span><strong>{importPlan.validRows}</strong></div>
                                            <div className={styles.analysisMetric}><span>Ambiguas</span><strong>{importPlan.ambiguousRows}</strong></div>
                                            <div className={styles.analysisMetric}><span>Duplicadas</span><strong>{importPlan.duplicateRows}</strong></div>
                                        </div>
                                    </div>
                                    <div className={styles.previewWrap}>
                                        {currentRows.length === 0 ? <div className={styles.emptyPreview}>La hoja seleccionada no tiene filas utiles.</div> : <>
                                            <table className={styles.previewTable}>
                                                <thead>
                                                    <tr>
                                                        <th className={styles.rowIndexHeader}>Fila</th>
                                                        {currentHeaders.map((header) => <th key={header} className={header === activeClubHeader ? styles.previewHeaderActive : undefined}>{header}</th>)}
                                                        {activeClubHeader ? <th>Club detectado</th> : null}
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {previewRows.map(({ row, rowIndex, rowMatch }) => {
                                                        const isUnresolved = Boolean(rowMatch?.sourceValue) && !rowMatch?.match?.matchedClubId;
                                                        const isAmbiguous = Boolean(rowMatch?.match?.matchedClubId) && Boolean(rowMatch?.match?.ambiguous);
                                                        const matchDescription = rowMatch?.match?.matchType === 'manual'
                                                            ? 'Vinculado manualmente.'
                                                            : rowMatch?.match?.ambiguous
                                                                ? 'Hay alternativas cercanas.'
                                                                : `Coincidencia ${formatPercent(rowMatch?.match?.score ?? 0)}`;
                                                        return (
                                                            <tr
                                                                key={`${selectedRanking.selectedSheet}-${rowIndex}`}
                                                                className={isUnresolved ? styles.previewRowPending : isAmbiguous ? styles.previewRowAmbiguous : undefined}
                                                            >
                                                                <td className={styles.rowIndexCell}>{getExcelRowNumber(rowIndex)}</td>
                                                                {currentHeaders.map((header) => <td key={`${selectedRanking.selectedSheet}-${rowIndex}-${header}`}>{row[header] || '-'}</td>)}
                                                                {activeClubHeader ? <td>{rowMatch?.sourceValue ? rowMatch.match?.matchedClubId ? <div className={styles.matchCell}><div className={styles.matchCellTop}><strong>{rowMatch.match.matchedClubShortName || rowMatch.match.matchedClubName}</strong><span className={`${baseStyles.pill} ${getMatchBadgeClass(rowMatch.match)}`}>{getMatchBadgeLabel(rowMatch.match)}</span></div><span className={styles.matchMeta}>{matchDescription}</span></div> : <div className={styles.matchCell}><strong className={styles.pendingText}>Sin match</strong><span className={styles.matchMeta}>Esta fila bloquea el guardado.</span></div> : '-'}</td> : null}
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                            <div className={styles.previewFooter}>{previewNotice}</div>
                                        </>}
                                    </div>
                                </> : null}
                            </div>
                        </div>
                        <div className={baseStyles.card}>
                            <div className={baseStyles.cardHeader}>
                                <div>
                                    <h2 className={baseStyles.cardTitle}>Gestion de clubes del ranking</h2>
                                    <p className={styles.workspaceSubtitle}>
                                        Agrega miembros, reemplaza clubes o corrige la base sin volver al Excel.
                                    </p>
                                </div>
                                <span className={`${baseStyles.pill} ${baseStyles.pillInfo}`}>
                                    {entryEditor.mode === 'edit' ? 'Editando' : 'Alta manual'}
                                </span>
                            </div>
                            {selectedSummary ? (
                                <form className={styles.entryEditor} onSubmit={handleSaveEntry}>
                                    <div className={styles.formRow}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Club</label>
                                            <select
                                                className={styles.formSelect}
                                                value={entryEditor.clubId}
                                                onChange={(event) => setEntryEditor((current) => ({ ...current, clubId: event.target.value }))}
                                            >
                                                <option value="">Elegir club...</option>
                                                {catalogClubs.map((club) => (
                                                    <option key={club.id} value={club.id}>
                                                        {club.shortName ? `${club.name} (${club.shortName})` : club.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Nombre en ranking</label>
                                            <input
                                                className={styles.formInput}
                                                value={entryEditor.sourceName}
                                                onChange={(event) => setEntryEditor((current) => ({ ...current, sourceName: event.target.value }))}
                                                placeholder="Se completa con el nombre del club si lo dejas vacio"
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.formRow}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Rating base</label>
                                            <input
                                                className={styles.formInput}
                                                value={entryEditor.initialRating}
                                                onChange={(event) => setEntryEditor((current) => ({ ...current, initialRating: event.target.value }))}
                                                placeholder="81.25"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>TR / Region</label>
                                            <input
                                                className={styles.formInput}
                                                value={entryEditor.sourceRegion}
                                                onChange={(event) => setEntryEditor((current) => ({ ...current, sourceRegion: event.target.value }))}
                                                placeholder="Buenos Aires"
                                            />
                                        </div>
                                    </div>
                                    <div className={styles.formRow}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Posicion base</label>
                                            <input
                                                className={styles.formInput}
                                                value={entryEditor.sourcePosition}
                                                onChange={(event) => setEntryEditor((current) => ({ ...current, sourcePosition: event.target.value }))}
                                                placeholder="1"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Puesto anterior</label>
                                            <input
                                                className={styles.formInput}
                                                value={entryEditor.sourcePreviousPosition}
                                                onChange={(event) => setEntryEditor((current) => ({ ...current, sourcePreviousPosition: event.target.value }))}
                                                placeholder="2"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.formLabel}>Variacion</label>
                                            <input
                                                className={styles.formInput}
                                                value={entryEditor.sourceVariation}
                                                onChange={(event) => setEntryEditor((current) => ({ ...current, sourceVariation: event.target.value }))}
                                                placeholder="+1"
                                            />
                                        </div>
                                    </div>
                                    <label className={styles.checkboxRow}>
                                        <input
                                            type="checkbox"
                                            checked={entryEditor.isActive}
                                            onChange={(event) => setEntryEditor((current) => ({ ...current, isActive: event.target.checked }))}
                                        />
                                        <span>Activo dentro del ranking</span>
                                    </label>
                                    <div className={styles.editorActions}>
                                        <button type="submit" className={styles.createBtn} disabled={entryBusy}>
                                            {entryBusy ? <RefreshCw size={16} className={styles.spin} /> : <Save size={16} />}
                                            {entryEditor.mode === 'edit' ? 'Guardar cambios' : 'Agregar club'}
                                        </button>
                                        <button
                                            type="button"
                                            className={styles.secondaryBtn}
                                            onClick={openCreateEntryEditor}
                                            disabled={entryBusy}
                                        >
                                            <Plus size={14} />
                                            Nuevo club
                                        </button>
                                    </div>
                                    <p className={styles.entryEditorHint}>
                                        Si el ranking ya tiene backfill, al guardar se reconstruye automaticamente para respetar la historia 2026.
                                    </p>
                                </form>
                            ) : (
                                <div className={styles.emptyPreview}>Guarda la base primero para poder gestionar clubes.</div>
                            )}
                        </div>
                        <div className={baseStyles.card}>
                            <div className={baseStyles.cardHeader}>
                                <h2 className={baseStyles.cardTitle}>Ranking actual</h2>
                                <span className={`${baseStyles.pill} ${selectedSummary ? selectedSummary.stale_from_match_id ? baseStyles.pillWarning : baseStyles.pillSuccess : baseStyles.pillNeutral}`}>
                                    {selectedSummary ? selectedSummary.stale_from_match_id ? 'Requiere recalc' : 'OK' : 'Sin guardar'}
                                </span>
                            </div>
                            {loadingDetailId === selectedRanking?.id && !selectedDetail ? <div className={styles.emptyPreview}>Cargando detalle...</div> : selectedDetail ? <>
                                <div className={styles.detailGrid}>
                                    <div className={styles.analysisMetric}><span>Clubes</span><strong>{selectedDetail.entries.length}</strong></div>
                                    <div className={styles.analysisMetric}><span>Visibles</span><strong>{filteredEntries.length}</strong></div>
                                    <div className={styles.analysisMetric}><span>Backfill</span><strong>{formatDateTime(selectedDetail.ranking.backfill_completed_at || selectedDetail.ranking.updated_at)}</strong></div>
                                    <div className={styles.analysisMetric}><span>Overrides</span><strong>{selectedDetail.manualAdjustments.length}</strong></div>
                                </div>
                                <div className={styles.tableToolbar}>
                                    <div className={styles.searchGroup}>
                                        <label className={styles.selectorLabel}>Buscar club</label>
                                        <input
                                            className={styles.formInput}
                                            value={entryFilter}
                                            onChange={(event) => setEntryFilter(event.target.value)}
                                            placeholder="CASI, Mendoza, Buenos Aires..."
                                        />
                                    </div>
                                    <div className={styles.tableToolbarMeta}>
                                        <span>{filteredEntries.length} de {selectedDetail.entries.length} clubes</span>
                                        <span>{selectedDetail.ranking.last_incremental_match_id ? `Ultimo match ${selectedDetail.ranking.last_incremental_match_id}` : 'Sin incremental aplicado'}</span>
                                    </div>
                                    <div className={styles.tableToolbarActions}>
                                        <ExportImage
                                            className={styles.exportAction}
                                            template="standings"
                                            filename={`ranking-${selectedRanking?.name || 'clubes'}`}
                                            data={{
                                                title: selectedRanking?.name || 'Ranking de Clubes',
                                                subtitle: `Base ${selectedRanking?.season || '-'} / resultados ${selectedResultsSeason || '-'}`,
                                                rows: rankingExportRows,
                                                columnLabels: RANKING_EXPORT_COLUMN_LABELS,
                                                plainDiff: true,
                                            }}
                                        />
                                    </div>
                                </div>
                                <div className={styles.standingsTableWrap}>
                                    <table className={styles.standingsTable}>
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>Club</th>
                                                <th>OVR</th>
                                                <th>Anterior</th>
                                                <th>Delta</th>
                                                <th>TR</th>
                                                <th>Estado</th>
                                                <th>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {visibleEntries.map((entry, index) => {
                                                const previousRating = getRankingPreviousRating(entry);
                                                const delta = getRankingDelta(entry.current_rating, previousRating);
                                                const absoluteIndex = paginatedEntries.start + index + 1;
                                                return (
                                                    <tr key={entry.id}>
                                                        <td>
                                                            <span className={styles.rankBadge}>{entry.current_position || absoluteIndex}</span>
                                                        </td>
                                                        <td>
                                                            <div className={styles.standingsTeamCell}>
                                                                {entry.clubs?.logo_url
                                                                    ? <img src={entry.clubs.logo_url} alt="" className={styles.standingsTeamLogo} />
                                                                    : <div className={styles.standingsTeamLogoPlaceholder} />}
                                                                <div className={styles.teamCellCopy}>
                                                                    <strong>{getRankingClubName(entry)}</strong>
                                                                    <span>{getRankingClubShortName(entry)}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td>{formatRankingRating(entry.current_rating)}</td>
                                                        <td>{formatRankingRating(previousRating)}</td>
                                                        <td className={delta.tone === 'positive' ? styles.deltaPositive : delta.tone === 'negative' ? styles.deltaNegative : styles.deltaNeutral}>
                                                            {delta.label}
                                                        </td>
                                                        <td>{entry.source_region || '-'}</td>
                                                        <td>
                                                            <span className={`${baseStyles.pill} ${entry.is_active === false ? baseStyles.pillNeutral : baseStyles.pillSuccess}`}>
                                                                {entry.is_active === false ? 'Inactivo' : 'Activo'}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <div className={styles.entryRowActions}>
                                                                <button
                                                                    type="button"
                                                                    className={styles.iconBtn}
                                                                    onClick={() => openEditEntryEditor(entry)}
                                                                    disabled={entryBusy}
                                                                    aria-label={`Editar ${getRankingClubName(entry)}`}
                                                                >
                                                                    <PencilLine size={14} />
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    className={styles.iconBtnDanger}
                                                                    onClick={() => handleDeleteEntry(entry)}
                                                                    disabled={entryBusy}
                                                                    aria-label={`Quitar ${getRankingClubName(entry)}`}
                                                                >
                                                                    <Trash2 size={14} />
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className={styles.paginationBar}>
                                    <span className={styles.paginationMeta}>
                                        Mostrando {visibleEntries.length ? paginatedEntries.start + 1 : 0}-{paginatedEntries.start + visibleEntries.length} de {filteredEntries.length} clubes
                                    </span>
                                    <div className={styles.paginationControls}>
                                        <button
                                            type="button"
                                            className={styles.secondaryBtn}
                                            onClick={() => setEntryPage((current) => Math.max(1, current - 1))}
                                            disabled={paginatedEntries.page <= 1}
                                        >
                                            <ChevronLeft size={14} />
                                            Anterior
                                        </button>
                                        <span className={styles.paginationPage}>Pagina {paginatedEntries.page} de {paginatedEntries.totalPages}</span>
                                        <button
                                            type="button"
                                            className={styles.secondaryBtn}
                                            onClick={() => setEntryPage((current) => Math.min(paginatedEntries.totalPages, current + 1))}
                                            disabled={paginatedEntries.page >= paginatedEntries.totalPages}
                                        >
                                            Siguiente
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            </> : <div className={styles.emptyPreview}>Guarda la base para persistir este ranking.</div>}
                            {selectedSummary?.stale_reason ? <div className={styles.staleNotice}><AlertCircle size={16} /><span>{selectedSummary.stale_reason}</span></div> : null}
                        </div>
                    </div>
                    <aside className={styles.sidebarColumn}>
                        <div className={styles.workspaceIntro}>
                            <div>
                                <span className={styles.sectionKicker}>Soporte</span>
                                <h2 className={styles.sectionTitle}>Resolver y controlar</h2>
                            </div>
                            <p className={styles.sectionText}>Acá quedan los chequeos de importación, recalculo y ajustes manuales.</p>
                        </div>
                        <div className={baseStyles.card}><div className={baseStyles.cardHeader}><h2 className={baseStyles.cardTitle}>Importacion del Excel</h2><span className={`${baseStyles.pill} ${importPlan.blockedReason ? baseStyles.pillWarning : baseStyles.pillSuccess}`}>{importPlan.blockedReason ? 'Revisar' : 'Lista'}</span></div><div className={styles.analysisPanel}><div className={styles.analysisGridCompact}><div className={styles.analysisMetric}><span>Catalogo</span><strong>{catalogState.loading ? 'Cargando...' : `${catalogClubs.length} clubes`}</strong></div><div className={styles.analysisMetric}><span>Rating</span><strong>{importPlan.ratingHeader || 'Pendiente'}</strong></div><div className={styles.analysisMetric}><span>Sin match</span><strong>{importPlan.unresolvedRows}</strong></div><div className={styles.analysisMetric}><span>Sin rating</span><strong>{importPlan.missingRatingRows}</strong></div></div>{importPlan.blockedReason ? <div className={styles.alertError}><AlertCircle size={16} /><span>{importPlan.blockedReason}</span></div> : <div className={styles.inlineHint}><CheckCircle2 size={16} /><span>La base esta lista para guardarse.</span></div>}{importPlan.duplicateRows > 0 ? <div className={`${styles.inlineHint} ${styles.inlineNoticeInfo}`}><CheckCircle2 size={16} /><span>Se ignoraran {importPlan.duplicateRows} filas duplicadas y se tomara la primera valida de cada club.</span></div> : null}{catalogState.error && catalogState.sport === selectedRanking?.sport ? <div className={styles.alertError}><AlertCircle size={16} /><span>{catalogState.error}</span></div> : null}</div></div>
                        {unresolvedRowDetails.length ? <div className={baseStyles.card}><div className={baseStyles.cardHeader}><h2 className={baseStyles.cardTitle}>Filas sin club resuelto</h2><span className={`${baseStyles.pill} ${baseStyles.pillWarning}`}>{unresolvedRowDetails.length}</span></div><div className={styles.blockingPanel}><div className={styles.blockingHint}><AlertCircle size={16} /><span>Estas filas bloquean el guardado. Puedes vincularlas manualmente desde aca.</span></div><div className={styles.blockingList}>{unresolvedRowDetails.map((row) => <div key={`unresolved-${row.rowIndex}`} className={styles.blockingItem}><div className={styles.blockingTop}><strong>Fila {row.excelRowNumber}</strong><span className={`${baseStyles.pill} ${baseStyles.pillWarning}`}>Sin match</span></div><span className={styles.blockingValue}>{row.sourceValue}</span><div className={styles.blockingControl}><label className={styles.selectorLabel}>Vincular con</label><select className={`${styles.formSelect} ${styles.blockingSelect}`} value={manualClubLinks[row.sourceValue] || ''} onChange={(event) => setManualClubLink(row.sourceValue, event.target.value)}><option value="">Elegir club...</option>{catalogClubs.map((club) => <option key={`${row.rowIndex}-${club.id}`} value={club.id}>{club.shortName ? `${club.name} (${club.shortName})` : club.name}</option>)}</select></div></div>)}</div></div></div> : null}
                        {manualLinkDetails.length ? <div className={baseStyles.card}><div className={baseStyles.cardHeader}><h2 className={baseStyles.cardTitle}>Vinculaciones manuales</h2><span className={`${baseStyles.pill} ${baseStyles.pillInfo}`}>{manualLinkDetails.length}</span></div><div className={styles.blockingPanel}><div className={styles.blockingList}>{manualLinkDetails.map((item) => <div key={`manual-link-${item.sourceValue}`} className={styles.blockingItem}><div className={styles.blockingTop}><strong>{item.sourceValue}</strong><span className={`${baseStyles.pill} ${baseStyles.pillInfo}`}>Manual</span></div><span className={styles.matchMeta}>{item.clubShortName ? `${item.clubName} (${item.clubShortName})` : item.clubName}</span><button type="button" className={styles.linkBtn} onClick={() => setManualClubLink(item.sourceValue, '')}>Quitar vinculo</button></div>)}</div></div></div> : null}
                        <div className={baseStyles.card}><div className={baseStyles.cardHeader}><h2 className={baseStyles.cardTitle}>Campos esperados</h2><span className={`${baseStyles.pill} ${recognizedCount > 0 ? baseStyles.pillInfo : baseStyles.pillNeutral}`}>{recognizedCount} detectados</span></div><div className={styles.fieldList}>{detectedFields.map((field) => <div key={field.key} className={styles.fieldItem}><div><strong>{field.label}</strong><span>{field.aliases.join(' / ')}</span></div><span className={`${baseStyles.pill} ${field.matchedHeader ? baseStyles.pillSuccess : baseStyles.pillNeutral}`}>{field.matchedHeader || 'Pendiente'}</span></div>)}</div></div>
                        <div className={baseStyles.card}><div className={baseStyles.cardHeader}><h2 className={baseStyles.cardTitle}>Recientes y recalculo</h2><span className={`${baseStyles.pill} ${baseStyles.pillNeutral}`}>{selectedDetail?.recentApplications.length ?? 0}</span></div>{selectedDetail?.recentApplications.length ? <div className={styles.activityList}>{selectedDetail.recentApplications.map((application) => <div key={application.id} className={styles.activityItem}><div className={styles.activityTop}><strong>{entryNameMap.get(application.home_club_id) || application.home_club_id} {application.home_score} - {application.away_score} {entryNameMap.get(application.away_club_id) || application.away_club_id}</strong><span className={`${baseStyles.pill} ${application.applied_mode === 'incremental' ? baseStyles.pillInfo : baseStyles.pillNeutral}`}>{application.applied_mode}</span></div><span className={styles.columnMeta}>{formatDateTime(application.match_date_time)} / {application.match_id}</span><button type="button" className={styles.linkBtn} onClick={() => handleRecalculateFromMatch(application.match_id)} disabled={recalculatingMatchId === application.match_id}>{recalculatingMatchId === application.match_id ? <RefreshCw size={14} className={styles.spin} /> : <RotateCcw size={14} />}Recalcular desde este partido</button></div>)}</div> : <div className={styles.emptyPreview}>Todavia no hay partidos aplicados.</div>}</div>
                        <div className={baseStyles.card}><div className={baseStyles.cardHeader}><h2 className={baseStyles.cardTitle}>Ajuste manual</h2><span className={`${baseStyles.pill} ${baseStyles.pillWarning}`}>Override</span></div>{selectedDetail ? <form className={styles.manualForm} onSubmit={handleManualAdjustment}><div className={styles.formGroup}><label className={styles.formLabel}>Club</label><select className={styles.formSelect} value={manualForm.clubId} onChange={(event) => setManualForm((current) => ({ ...current, clubId: event.target.value }))}>{selectedDetail.entries.map((entry) => <option key={entry.club_id} value={entry.club_id}>{entry.clubs?.name || entry.source_name}</option>)}</select></div><div className={styles.formRow}><div className={styles.formGroup}><label className={styles.formLabel}>Modo</label><select className={styles.formSelect} value={manualForm.mode} onChange={(event) => setManualForm((current) => ({ ...current, mode: event.target.value === 'set' ? 'set' : 'delta' }))}><option value="delta">Sumar / restar</option><option value="set">Fijar valor</option></select></div><div className={styles.formGroup}><label className={styles.formLabel}>Valor</label><input className={styles.formInput} value={manualForm.value} onChange={(event) => setManualForm((current) => ({ ...current, value: event.target.value }))} placeholder={manualForm.mode === 'set' ? '81.25' : '+0.50'} /></div></div><div className={styles.formGroup}><label className={styles.formLabel}>Motivo</label><textarea className={styles.formTextarea} value={manualForm.reason} onChange={(event) => setManualForm((current) => ({ ...current, reason: event.target.value }))} /></div><button type="submit" className={styles.createBtn} disabled={manualBusy}>{manualBusy ? <RefreshCw size={16} className={styles.spin} /> : <Save size={16} />}Aplicar override</button></form> : <div className={styles.emptyPreview}>Guarda la base primero.</div>}{selectedDetail?.manualAdjustments.length ? <div className={styles.activityList}>{selectedDetail.manualAdjustments.map((adjustment) => <div key={adjustment.id} className={styles.activityItem}><div className={styles.activityTop}><strong>{entryNameMap.get(adjustment.club_id) || adjustment.club_id}</strong><span className={`${baseStyles.pill} ${baseStyles.pillWarning}`}>{adjustment.mode}</span></div><span className={styles.columnMeta}>Valor {Number(adjustment.value) >= 0 ? '+' : ''}{formatRankingRating(Number(adjustment.value))} / Resultado {formatRankingRating(adjustment.resulting_rating === null ? null : Number(adjustment.resulting_rating))}</span><span className={styles.columnMeta}>{adjustment.reason} / {formatDateTime(adjustment.created_at)}</span></div>)}</div> : null}</div>
                        <div className={baseStyles.card}><div className={baseStyles.cardHeader}><h2 className={baseStyles.cardTitle}>Plantilla rapida</h2><button className={styles.linkBtn} onClick={downloadTemplate} type="button"><Download size={14} />Descargar</button></div><div className={styles.templatePreview}>{TEMPLATE_ROWS.map((row, index) => <div key={`${row.Equipo}-${index}`} className={styles.templateRow}><strong>{row.Pos}. {row.Equipo}</strong><span>{row.OVR} OVR / {row.TR}</span></div>)}</div></div>
                    </aside>
                </section>
            </div>
        </>
    );
}
