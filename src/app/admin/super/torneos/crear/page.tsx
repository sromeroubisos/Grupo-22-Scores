'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ChevronLeft, Trophy, Globe, Search, Loader2, Plus, RefreshCw,
    LayoutGrid, ListOrdered, GitMerge, Flag, Settings2, CheckCircle2,
} from 'lucide-react';
import PhaseCreator, { type PhaseConfiguration, type Team as PhaseTeam } from '@/app/admin/components/PhaseCreator';
import LogoUploader from '@/components/LogoUploader';
import { useOptionalSuperConsole } from '../../SuperConsoleContext';
import { createClient } from '@/lib/supabase/client';
import { createEntitySafe, updateEntitySafe } from '@/app/admin/entities/actions';
import { invalidateCache } from '@/lib/cache/superAdminCache';
import { getTournamentCountryOptions, type TournamentCountryOption } from '@/lib/data/countries';
import { getAllSports } from '@/lib/data/sports';
import { createUnion } from '@/lib/services/unionService';
import { mapExternalSportToInternalSport } from '@/lib/sports';
import {
    buildTournamentCompetitionConfig,
    getTournamentFormatFromPhaseType,
    getTournamentFormatLabel,
    getTournamentFormatPhaseType,
    normalizeTournamentFormat,
    type CircuitChampionMode,
} from '@/lib/utils/tournamentFormat';
import { resolveTournamentAudience, syncAgeGradeWithAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import '../../creation-forms.css';

const sportsCatalog = getAllSports();

const sportDefaults: Record<string, { duration: number; win: number; draw: number; loss: number }> = {
    'football': { duration: 90, win: 3, draw: 1, loss: 0 },
    'rugby': { duration: 80, win: 4, draw: 2, loss: 0 },
    'rugby-union': { duration: 80, win: 4, draw: 2, loss: 0 },
    'rugby-league': { duration: 80, win: 2, draw: 1, loss: 0 },
    'basketball': { duration: 40, win: 2, draw: 0, loss: 1 },
    'hockey': { duration: 60, win: 3, draw: 1, loss: 0 },
    'field-hockey': { duration: 60, win: 3, draw: 1, loss: 0 },
    'volleyball': { duration: 90, win: 3, draw: 0, loss: 0 },
    'beach-volleyball': { duration: 60, win: 3, draw: 0, loss: 0 },
    'tennis': { duration: 120, win: 2, draw: 0, loss: 0 },
    'table-tennis': { duration: 30, win: 2, draw: 0, loss: 0 },
    'badminton': { duration: 45, win: 2, draw: 0, loss: 0 },
    'handball': { duration: 60, win: 2, draw: 1, loss: 0 },
    'futsal': { duration: 40, win: 3, draw: 1, loss: 0 },
    'beach-soccer': { duration: 36, win: 3, draw: 1, loss: 0 },
    'baseball': { duration: 180, win: 1, draw: 0, loss: 0 },
    'cricket': { duration: 300, win: 1, draw: 0, loss: 0 },
    'american-football': { duration: 60, win: 1, draw: 0, loss: 0 },
    'aussie-rules': { duration: 80, win: 4, draw: 2, loss: 0 },
    'snooker': { duration: 60, win: 1, draw: 0, loss: 0 },
    'darts': { duration: 30, win: 1, draw: 0, loss: 0 },
    'boxing': { duration: 36, win: 1, draw: 0, loss: 0 },
    'mma': { duration: 25, win: 1, draw: 0, loss: 0 },
    'esports': { duration: 45, win: 1, draw: 0, loss: 0 },
    'water-polo': { duration: 32, win: 2, draw: 1, loss: 0 },
    'floorball': { duration: 60, win: 3, draw: 1, loss: 0 },
    'bandy': { duration: 90, win: 3, draw: 1, loss: 0 },
    'netball': { duration: 60, win: 2, draw: 0, loss: 0 },
    'kabaddi': { duration: 40, win: 2, draw: 0, loss: 0 },
};

/* =========================================================
   Templates (Paso 0). Cada plantilla pre-configura formato +
   defaults razonables para que el usuario solo confirme
   nombre, deporte y participantes.
   ========================================================= */

type TemplateId = 'league' | 'knockout' | 'groups' | 'circuit' | 'custom';

interface TournamentTemplate {
    id: TemplateId;
    icon: string;
    title: string;
    description: string;
    format: string;                        // se traduce a phaseType internamente
    advanced: boolean;                     // true → abre directo el modo avanzado
    popular?: boolean;
    dashed?: boolean;
}

const TOURNAMENT_TEMPLATES: TournamentTemplate[] = [
    {
        id: 'league',
        icon: '🏆',
        title: 'Liga · todos contra todos',
        description: 'Round-robin. Sumás puntos por victoria, empate y derrota. Ida o ida y vuelta.',
        format: 'league',
        advanced: false,
        popular: true,
    },
    {
        id: 'knockout',
        icon: '🥊',
        title: 'Eliminación directa',
        description: 'Llaves. Cuartos → semis → final. Sin segunda chance.',
        format: 'knockout',
        advanced: false,
    },
    {
        id: 'groups',
        icon: '🎯',
        title: 'Grupos + Playoff',
        description: 'Fase de grupos seguida de eliminación. Ideal con muchos equipos.',
        format: 'groups',
        advanced: false,
    },
    {
        id: 'circuit',
        icon: '🏁',
        title: 'Circuito por eventos',
        description: 'Varias paradas en la temporada con tabla acumulada o final decisiva.',
        format: 'circuit',
        advanced: false,
    },
    {
        id: 'custom',
        icon: '⚙️',
        title: 'Personalizado · multi-fase',
        description: 'Wizard avanzado. Definí cada fase, criterios y bonus desde cero.',
        format: 'groups',
        advanced: true,
        dashed: true,
    },
];

function slugify(value: string) {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
}

function normalizeCountryId(value: string | null | undefined, options: TournamentCountryOption[]): string {
    if (!value) return '';
    const normalized = slugify(value);
    const matched = options.find((option) => slugify(option.id) === normalized || slugify(option.label) === normalized);
    return matched?.id || normalized;
}

const AGE_GRADE_OPTIONS = [
    'Mayores (Adults)',
    'Juveniles',
    'U23',
    'U20',
    'U18',
    'U16',
    'Femenino',
    'Mixto',
];

const DEFAULT_PHASE_CRITERIA = [
    { id: 'points', text: 'Puntos obtenidos', value: 'points_table' },
    { id: 'diff_points', text: 'Diferencia de Tantos', value: 'points_diff' },
];

const DEFAULT_PHASE_TAGS = [
    { id: '1', fromPosition: 1, toPosition: 2, label: 'Clasifica', color: '#00a365' },
];

type UnionOption = {
    id: string;
    name: string;
    country?: string | null;
};

type InlineUnionFormState = {
    name: string;
    slug: string;
    country: string;
    unionLevel: string;
    slugManuallyEdited: boolean;
};

type ClubRecord = {
    id: string;
    name: string;
    short_name?: string | null;
    shortName?: string | null;
    slug?: string | null;
    entity_type?: string | null;
    city?: string | null;
    region?: string | null;
    country?: string | null;
    logo_url?: string | null;
    primary_color?: string | null;
    sport?: string | null;
    sport_id?: string | null;
};

type SquadRecord = {
    id: string;
    club_id?: string | null;
    name: string;
    sport?: string | null;
    gender?: string | null;
    category?: string | null;
    season?: string | null;
    status?: string | null;
};

type TournamentRecord = {
    name?: string | null;
    sport_id?: string | null;
    is_visible?: boolean | null;
    season_id?: string | null;
    category?: string | null;
    age_grade?: string | null;
    format?: string | null;
    country_id?: string | null;
    country?: string | null;
    union_id?: string | null;
    logo_url?: string | null;
    ruleset?: {
        pointsWin?: number;
        pointsDraw?: number;
        pointsLoss?: number;
        pointsBonusTry?: number;
        pointsBonusLoss?: number;
    } | null;
};

type ParticipantRow = {
    club_id: string;
    division_id?: string | null;
    division?: SquadRecord | null;
};

type EntityFilter = 'all' | 'club' | 'seleccion' | 'franquicia' | 'academia';

function formatSquadLabel(squad: SquadRecord): string {
    const suffix = [squad.sport, squad.gender, squad.category]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' / ');

    const seasonLabel = squad.season ? ` · ${squad.season}` : '';
    return `${squad.name}${suffix ? ` (${suffix})` : ''}${seasonLabel}`;
}

function sameIdList(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    return left.every((value, index) => value === right[index]);
}

function sortUnionOptions(unions: UnionOption[]): UnionOption[] {
    return [...unions].sort((left, right) => left.name.localeCompare(right.name));
}

function mapFormatToPhaseType(format: string): PhaseConfiguration['phaseType'] {
    return getTournamentFormatPhaseType(format) as PhaseConfiguration['phaseType'];
}

function mapPhaseTypeToFormat(phaseType: string, preferredFormat?: string): string {
    return getTournamentFormatFromPhaseType(phaseType, preferredFormat);
}

function getPhaseTypeLabel(phaseType: string): string {
    if (phaseType === 'league') return 'Liga';
    if (phaseType === 'playoff') return 'Playoff';
    return 'Fase de grupos';
}

function buildPhaseName(phaseType: string): string {
    if (phaseType === 'league') return 'Regular Season';
    if (phaseType === 'playoff') return 'Playoffs';
    return 'Fase de grupos';
}

function buildGroupNames(count: number): string[] {
    return Array.from({ length: Math.max(1, count) }, (_, index) => `Grupo ${String.fromCharCode(65 + index)}`);
}

function parsePointsValue(value: string | number | undefined, fallback: number): number {
    const numericValue = Number(String(value ?? fallback).replace(/[^\d.-]/g, ''));
    return Number.isFinite(numericValue) ? numericValue : fallback;
}

function getClubShortName(club: Pick<ClubRecord, 'name' | 'short_name' | 'shortName'>): string {
    if (club.short_name) return String(club.short_name).trim().slice(0, 4).toUpperCase();
    if (club.shortName) return String(club.shortName).trim().slice(0, 4).toUpperCase();

    return String(club.name || '')
        .split(' ')
        .filter(Boolean)
        .slice(0, 3)
        .map((chunk: string) => chunk[0])
        .join('')
        .slice(0, 4)
        .toUpperCase();
}

function getClubEntityTypeLabel(value: string | null | undefined): string {
    const normalized = String(value || 'club').trim().toLowerCase();
    switch (normalized) {
        case 'seleccion': return 'Selección';
        case 'academia': return 'Academia';
        case 'franquicia': return 'Franquicia';
        default: return 'Club';
    }
}

function getClubEntityTypeSlug(value: string | null | undefined): EntityFilter {
    const normalized = String(value || 'club').trim().toLowerCase();
    if (normalized === 'seleccion') return 'seleccion';
    if (normalized === 'academia') return 'academia';
    if (normalized === 'franquicia') return 'franquicia';
    return 'club';
}

const ADMIN_CLUB_PAGE_SIZE = 1000;

async function fetchAdminClubPage(offset: number): Promise<ClubRecord[]> {
    const response = await fetch(`/api/admin/clubs?limit=${ADMIN_CLUB_PAGE_SIZE}&offset=${offset}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
            ? String(payload.error || '')
            : '';
        throw new Error(message || 'No se pudieron cargar los equipos.');
    }

    return Array.isArray(payload) ? payload as ClubRecord[] : [];
}

async function fetchAllAdminClubs(): Promise<ClubRecord[]> {
    const allClubs: ClubRecord[] = [];
    for (let offset = 0; ; offset += ADMIN_CLUB_PAGE_SIZE) {
        const page = await fetchAdminClubPage(offset);
        allClubs.push(...page);
        if (page.length < ADMIN_CLUB_PAGE_SIZE) return allClubs;
    }
}

// En el panel de Admin de Torneos los clubes vienen scopeados (solo los que
// creó o tiene concedidos). Mismo shape que ClubRecord.
async function fetchTournamentAdminClubs(): Promise<ClubRecord[]> {
    const response = await fetch('/api/admin/torneo/clubs?limit=1000', {
        cache: 'no-store',
        credentials: 'include',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
            ? String(payload.error || '')
            : '';
        throw new Error(message || 'No se pudieron cargar los equipos.');
    }
    return Array.isArray(payload?.data) ? payload.data as ClubRecord[] : [];
}

function createDefaultPhaseConfig(
    phaseType: PhaseConfiguration['phaseType'],
    selectedTeamIds: string[],
    rules: {
        pointsWin: number;
        pointsDraw: number;
        pointsLoss: number;
        pointsBonusTry: number;
        pointsBonusLoss: number;
    }
): PhaseConfiguration {
    return {
        phaseType,
        config: {
            groupsCount: 4,
            teamsPerGroup: 5,
            qualifiersPerGroup: 2,
            pointsWin: String(rules.pointsWin),
            pointsDraw: String(rules.pointsDraw),
            pointsBonusTry: String(rules.pointsBonusTry),
            pointsBonusLoss: String(rules.pointsBonusLoss),
            leagueRounds: 1,
            playoffThirdPlace: false,
        },
        selectedTeamIds,
        fixtureData: [],
        isFixtureGenerated: false,
        activeCriteria: DEFAULT_PHASE_CRITERIA,
        tags: DEFAULT_PHASE_TAGS,
        groupAssignments: {},
    };
}

function buildQuickPhasePayload(config: PhaseConfiguration) {
    const groupsCount = Math.max(1, Number(config.config?.groupsCount) || 1);
    const qualifiersPerGroup = Math.max(0, Number(config.config?.qualifiersPerGroup) || 0);
    const leagueRounds = Math.max(1, Number(config.config?.leagueRounds) || 1);
    const normalizedPhaseType = config.phaseType === 'groups' ? 'group_stage' : config.phaseType;
    const groupNames = normalizedPhaseType === 'group_stage' ? buildGroupNames(groupsCount) : [];

    return {
        name: buildPhaseName(config.phaseType),
        phase_type: normalizedPhaseType,
        order_index: 1,
        is_active: true,
        settings: {
            quickCreator: {
                ...config,
                savedAt: new Date().toISOString(),
            },
            phaseMode: config.phaseType,
            teamsCount: config.selectedTeamIds.length,
            advanceCount: qualifiersPerGroup,
            legs: normalizedPhaseType === 'league' ? leagueRounds : 1,
            group_names: groupNames,
            selectedTeamIds: config.selectedTeamIds,
            groupAssignments: config.groupAssignments,
            fixturePreview: config.fixtureData,
            pointsSystem: {
                win: parsePointsValue(config.config?.pointsWin, 4),
                draw: parsePointsValue(config.config?.pointsDraw, 2),
                loss: 0,
                bonusTry: parsePointsValue(config.config?.pointsBonusTry, 1),
                bonusLoss: parsePointsValue(config.config?.pointsBonusLoss, 1),
            },
            tiebreakers: config.activeCriteria.map((criterion, index) => ({
                metric: criterion.value || criterion.id,
                label: criterion.text,
                enabled: true,
                order: index + 1,
                priority: index + 1,
            })),
            tableTags: config.tags,
            playoffThirdPlace: Boolean(config.config?.playoffThirdPlace),
        },
    };
}

/* =========================================================
   COMPONENTE PRINCIPAL
   ========================================================= */

type WizardStage =
    | 'template'      // Paso 0: elegir plantilla
    | 'basics'        // Paso 1: nombre, deporte, audiencia, temporada
    | 'structure'     // Paso 2: cantidad equipos, modalidad, puntos
    | 'participants'  // Paso 3: catálogo de clubes + planteles
    | 'advanced';     // Modo avanzado: PhaseCreator completo

const STAGE_ORDER: WizardStage[] = ['template', 'basics', 'structure', 'participants'];

const DRAFT_STORAGE_KEY = 'g22.tournament.create.draft.v1';

interface DraftPayload {
    formData: unknown;
    selectedTemplate: TemplateId | null;
    stage: WizardStage;
    savedAt: string;
}

type SuperCreateTournamentProps = {
    navigationMode?: 'admin' | 'tournament-admin';
};

export default function SuperCreateTournament({ navigationMode = 'admin' }: SuperCreateTournamentProps = {}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const tournamentId = searchParams?.get('tournamentId');
    const supabase = createClient();
    const isTournamentAdmin = navigationMode === 'tournament-admin';
    const tournamentsHomeHref = isTournamentAdmin ? '/admin/torneo/torneos' : '/admin/super/torneos';

    // En el panel de Admin de Torneos no hay SuperConsoleProvider: usamos la
    // variante opcional y caemos a valores neutros (unions se cargan aparte).
    const superConsole = useOptionalSuperConsole();
    const superConsoleLoading = superConsole?.loading ?? {
        clubs: false,
        matches: false,
        tournaments: false,
        unions: false,
        news: false,
    };
    const refresh = superConsole?.refresh ?? (() => {});

    /* ============== Estado del wizard ============== */
    const [stage, setStage] = useState<WizardStage>('template');
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null);
    const [isEdit, setIsEdit] = useState(false);
    const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
    const [autosaveLabel, setAutosaveLabel] = useState<string>('');

    /* ============== Estado heredado del wizard original ============== */
    const [availableUnions, setAvailableUnions] = useState<UnionOption[]>([]);
    const [clubs, setClubs] = useState<ClubRecord[]>([]);
    const [loadingClubs, setLoadingClubs] = useState(true);
    const [clubsError, setClubsError] = useState<string | null>(null);
    const [selectedClubs, setSelectedClubs] = useState<string[]>([]);
    const [selectedDivisionByClub, setSelectedDivisionByClub] = useState<Record<string, string>>({});
    const [clubSquadsByClub, setClubSquadsByClub] = useState<Record<string, SquadRecord[]>>({});
    const [loadingSquadsByClub, setLoadingSquadsByClub] = useState<Record<string, boolean>>({});
    const [searchTerm, setSearchTerm] = useState('');
    const [entityFilter, setEntityFilter] = useState<EntityFilter>('all');
    const [saving, setSaving] = useState(false);
    const [countryOptions, setCountryOptions] = useState<TournamentCountryOption[]>(() => getTournamentCountryOptions());
    const [phaseConfig, setPhaseConfig] = useState<PhaseConfiguration | null>(null);
    const [showUnionCreator, setShowUnionCreator] = useState(false);
    const [creatingUnion, setCreatingUnion] = useState(false);
    const [unionCreateError, setUnionCreateError] = useState<string | null>(null);
    const [unionCreateSuccess, setUnionCreateSuccess] = useState<string | null>(null);
    const [unionCreateForm, setUnionCreateForm] = useState<InlineUnionFormState>({
        name: '',
        slug: '',
        country: 'Argentina',
        unionLevel: 'regional',
        slugManuallyEdited: false,
    });

    const [formData, setFormData] = useState({
        name: '',
        sport: 'rugby',
        visibility: 'private',                  // por defecto borrador
        season: '2026',
        format: 'league',
        circuitChampionMode: 'accumulation' as CircuitChampionMode,
        category: 'Profesional',
        publicAudience: 'mayores' as TournamentAudience,
        ageGrade: 'Mayores (Adults)',
        country: '',
        unionId: '',
        logoUrl: '',
        teamCount: 8,
        leagueRounds: 1,
        rules: {
            pointsWin: 4,
            pointsDraw: 2,
            pointsLoss: 0,
            pointsBonusTry: 1,
            pointsBonusLoss: 1,
        }
    });

    /* ============== Carga catálogo de clubes ============== */
    useEffect(() => {
        let isCancelled = false;
        setLoadingClubs(true);
        setClubsError(null);

        const loader = isTournamentAdmin ? fetchTournamentAdminClubs : fetchAllAdminClubs;
        loader()
            .then((data) => { if (!isCancelled) setClubs(data); })
            .catch((error) => {
                if (isCancelled) return;
                console.error('Error loading admin club catalog:', error);
                setClubs([]);
                setClubsError(error instanceof Error ? error.message : 'No se pudieron cargar los equipos.');
            })
            .finally(() => { if (!isCancelled) setLoadingClubs(false); });

        return () => { isCancelled = true; };
    }, [isTournamentAdmin]);

    /* ============== Uniones ============== */
    useEffect(() => {
        if (isTournamentAdmin) {
            // Sin SuperConsole: las uniones vienen del catálogo del panel de torneos.
            let cancelled = false;
            fetch('/api/admin/torneo/meta', { cache: 'no-store', credentials: 'include' })
                .then((response) => response.json())
                .then((payload) => {
                    if (cancelled) return;
                    const unions = Array.isArray(payload?.unions) ? payload.unions : [];
                    setAvailableUnions(sortUnionOptions(
                        unions.map((union: { id: string; name: string; country?: string | null }) => ({
                            id: union.id,
                            name: union.name,
                            country: union.country ?? null,
                        })),
                    ));
                })
                .catch(() => { if (!cancelled) setAvailableUnions([]); });
            return () => { cancelled = true; };
        }

        setAvailableUnions(sortUnionOptions(
            (superConsole?.unions ?? []).map((union) => ({
                id: union.id,
                name: union.name,
                country: union.country,
            })),
        ));
    }, [isTournamentAdmin, superConsole?.unions]);

    useEffect(() => {
        if (!unionCreateForm.slugManuallyEdited) {
            setUnionCreateForm((prev) => ({ ...prev, slug: slugify(prev.name) }));
        }
    }, [unionCreateForm.name, unionCreateForm.slugManuallyEdited]);

    /* ============== Países ============== */
    useEffect(() => {
        supabase.from('countries').select('id, name, code, flag_emoji').order('name').then(({ data }) => {
            setCountryOptions(getTournamentCountryOptions(data || []));
        });
    }, [supabase]);

    /* ============== Edición de torneo existente ============== */
    useEffect(() => {
        if (!tournamentId) return;

        supabase.from('tournaments')
            .select('*')
            .eq('id', tournamentId)
            .single()
            .then(({ data }: { data: TournamentRecord | null }) => {
                if (!data) return;
                setIsEdit(true);
                setStage('basics');
                setSelectedTemplate(null);

                const sportVal = data.sport_id ? mapExternalSportToInternalSport(data.sport_id) : 'rugby';
                const defaults = sportDefaults[sportVal as string] || { duration: 60, win: 1, draw: 0, loss: 0 };
                const inferredAudience = resolveTournamentAudience({ ageGrade: data.age_grade, category: data.category });
                const competitionConfig = (data.ruleset as { competition?: { parameters?: { champion_mode?: CircuitChampionMode } } } | null)?.competition;

                setFormData(prev => ({
                    ...prev,
                    name: data.name || '',
                    sport: sportVal,
                    visibility: data.is_visible ? 'public' : 'private',
                    season: data.season_id || '2026',
                    category: data.category || prev.category,
                    publicAudience: inferredAudience,
                    ageGrade: data.age_grade || syncAgeGradeWithAudience(prev.ageGrade, inferredAudience),
                    format: normalizeTournamentFormat(data.format || prev.format),
                    circuitChampionMode: competitionConfig?.parameters?.champion_mode === 'final' ? 'final' : prev.circuitChampionMode,
                    country: normalizeCountryId(data.country_id || data.country || '', countryOptions),
                    unionId: data.union_id || '',
                    logoUrl: data.logo_url || '',
                    rules: {
                        ...prev.rules,
                        pointsWin: data.ruleset?.pointsWin ?? defaults.win ?? prev.rules.pointsWin,
                        pointsDraw: data.ruleset?.pointsDraw ?? defaults.draw ?? prev.rules.pointsDraw,
                        pointsLoss: data.ruleset?.pointsLoss ?? defaults.loss ?? prev.rules.pointsLoss,
                        pointsBonusTry: data.ruleset?.pointsBonusTry ?? prev.rules.pointsBonusTry,
                        pointsBonusLoss: data.ruleset?.pointsBonusLoss ?? prev.rules.pointsBonusLoss,
                    }
                }));
            });

        // Participantes existentes
        fetch(`/api/tournaments/${tournamentId}/participants?full=true`, { cache: 'no-store' })
            .then(async (response) => response.ok ? response.json() : null)
            .then((participants: ParticipantRow[] | null) => {
                if (!participants) return;

                const nextSelectedClubs = Array.from(new Set(
                    participants
                        .map((participant) => participant.club_id)
                        .filter((clubId): clubId is string => Boolean(clubId))
                ));

                const nextSelectedDivisions = participants.reduce<Record<string, string>>((accumulator, participant) => {
                    if (participant.club_id && participant.division_id) {
                        accumulator[participant.club_id] = participant.division_id;
                    }
                    return accumulator;
                }, {});

                setSelectedClubs(nextSelectedClubs);
                setSelectedDivisionByClub(nextSelectedDivisions);
            })
            .catch((error) => console.error('Error loading tournament participants:', error));

        // Configuración guardada de fase
        fetch(`/api/tournaments/${tournamentId}/phases`)
            .then(async (response) => response.ok ? response.json() : null)
            .then((payload) => {
                const firstPhase = payload?.data?.[0];
                const savedQuickConfig = firstPhase?.settings?.quickCreator || firstPhase?.settings?.quick_creator;

                if (savedQuickConfig) {
                    setPhaseConfig(savedQuickConfig as PhaseConfiguration);
                    if (Array.isArray(savedQuickConfig.selectedTeamIds) && savedQuickConfig.selectedTeamIds.length > 0) {
                        setSelectedClubs(savedQuickConfig.selectedTeamIds);
                    }
                }
            })
            .catch((error) => console.error('Error loading phase config:', error));
    }, [countryOptions, supabase, tournamentId]);

    /* ============== Autosave a localStorage (solo en creación) ============== */
    useEffect(() => {
        if (isEdit || stage === 'template') return;
        if (typeof window === 'undefined') return;

        setAutosaveState('saving');
        const handle = window.setTimeout(() => {
            try {
                const payload: DraftPayload = {
                    formData,
                    selectedTemplate,
                    stage,
                    savedAt: new Date().toISOString(),
                };
                window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
                setAutosaveState('saved');
                setAutosaveLabel('Borrador guardado');
            } catch (error) {
                console.warn('No se pudo guardar borrador local:', error);
                setAutosaveState('idle');
            }
        }, 600);

        return () => window.clearTimeout(handle);
    }, [formData, selectedTemplate, stage, isEdit]);

    /* ============== Restaurar borrador al cargar (en create) ============== */
    useEffect(() => {
        if (isEdit || tournamentId) return;
        if (typeof window === 'undefined') return;

        try {
            const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
            if (!raw) return;
            const payload = JSON.parse(raw) as DraftPayload;
            if (!payload || !payload.formData) return;

            const ok = window.confirm('Encontramos un borrador sin terminar. ¿Querés continuar donde lo dejaste?');
            if (ok) {
                setFormData((prev) => ({ ...prev, ...(payload.formData as object) }));
                setSelectedTemplate(payload.selectedTemplate);
                setStage(payload.stage || 'basics');
            } else {
                window.localStorage.removeItem(DRAFT_STORAGE_KEY);
            }
        } catch (error) {
            console.warn('No se pudo restaurar borrador local:', error);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ============== Helpers de cambio ============== */
    const setClubSelection = (clubId: string, isSelected: boolean) => {
        setSelectedClubs((prev) => {
            if (isSelected) return prev.includes(clubId) ? prev : [...prev, clubId];
            return prev.filter((id) => id !== clubId);
        });

        if (!isSelected) {
            setSelectedDivisionByClub((prev) => {
                if (!(clubId in prev)) return prev;
                const next = { ...prev };
                delete next[clubId];
                return next;
            });
        }
    };

    const toggleAllClubs = () => {
        if (selectedClubs.length === clubs.length) {
            setSelectedClubs([]);
            setSelectedDivisionByClub({});
            return;
        }
        setSelectedClubs(clubs.map((club) => club.id));
    };

    const handleSportChange = (sportId: string) => {
        const d = sportDefaults[sportId] || { duration: 60, win: 1, draw: 0, loss: 0 };
        setFormData(prev => ({
            ...prev,
            sport: sportId,
            rules: {
                ...prev.rules,
                ...(d ? { pointsWin: d.win, pointsDraw: d.draw, pointsLoss: d.loss } : {})
            }
        }));
    };

    const handlePublicAudienceChange = (audience: TournamentAudience) => {
        setFormData((prev) => ({
            ...prev,
            publicAudience: audience,
            ageGrade: syncAgeGradeWithAudience(prev.ageGrade, audience),
        }));
    };

    const handleAgeGradeChange = (ageGrade: string) => {
        setFormData((prev) => ({
            ...prev,
            ageGrade,
            publicAudience: resolveTournamentAudience({ ageGrade, category: prev.category }),
        }));
    };

    const handleFormatChange = (format: string) => {
        const normalizedFormat = normalizeTournamentFormat(format);
        const nextPhaseType = mapFormatToPhaseType(normalizedFormat);

        setFormData((prev) => ({ ...prev, format: normalizedFormat }));
        setPhaseConfig((current) => {
            const baseConfig = current || createDefaultPhaseConfig(nextPhaseType, selectedClubs, formData.rules);
            return { ...baseConfig, phaseType: nextPhaseType };
        });
    };

    /* ============== Mantener phaseConfig sincronizado con equipos seleccionados ============== */
    useEffect(() => {
        setPhaseConfig((current) => {
            if (!current || sameIdList(current.selectedTeamIds, selectedClubs)) return current;
            return { ...current, selectedTeamIds: selectedClubs };
        });
    }, [selectedClubs]);

    /* ============== Cargar planteles por club seleccionado ============== */
    useEffect(() => {
        let isCancelled = false;
        const missingClubIds = selectedClubs.filter(
            (clubId) => !(clubId in clubSquadsByClub) && !loadingSquadsByClub[clubId]
        );

        if (missingClubIds.length === 0) return;

        missingClubIds.forEach((clubId) => {
            if (isTournamentAdmin) {
                // El alta por panel de torneos inscribe por club (sin división);
                // evitamos el endpoint super y tratamos como "sin planteles".
                setClubSquadsByClub((prev) => ({ ...prev, [clubId]: [] }));
                return;
            }

            setLoadingSquadsByClub((prev) => ({ ...prev, [clubId]: true }));

            fetch(`/api/admin/clubs/${clubId}/squads`, { cache: 'no-store' })
                .then(async (response) => {
                    const payload = await response.json().catch(() => []);
                    if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar los planteles del club');
                    return Array.isArray(payload) ? payload as SquadRecord[] : [];
                })
                .then((squads) => {
                    if (isCancelled) return;
                    setClubSquadsByClub((prev) => ({ ...prev, [clubId]: squads }));
                })
                .catch((error) => {
                    if (isCancelled) return;
                    console.error(`Error loading squads for club ${clubId}:`, error);
                    setClubSquadsByClub((prev) => ({ ...prev, [clubId]: [] }));
                })
                .finally(() => {
                    if (isCancelled) return;
                    setLoadingSquadsByClub((prev) => ({ ...prev, [clubId]: false }));
                });
        });

        return () => { isCancelled = true; };
    }, [clubSquadsByClub, loadingSquadsByClub, selectedClubs, isTournamentAdmin]);

    /* ============== Auto-seleccionar plantel único ============== */
    useEffect(() => {
        setSelectedDivisionByClub((current) => {
            let changed = false;
            const next = { ...current };

            Object.keys(next).forEach((clubId) => {
                if (!selectedClubs.includes(clubId)) {
                    delete next[clubId];
                    changed = true;
                }
            });

            selectedClubs.forEach((clubId) => {
                const squads = clubSquadsByClub[clubId] || [];
                const selectedDivisionId = next[clubId];

                if (selectedDivisionId && squads.length > 0 && !squads.some((squad) => squad.id === selectedDivisionId)) {
                    delete next[clubId];
                    changed = true;
                }
                if (!next[clubId] && squads.length === 1) {
                    next[clubId] = squads[0].id;
                    changed = true;
                }
            });

            return changed ? next : current;
        });
    }, [clubSquadsByClub, selectedClubs]);

    /* ============== PhaseCreator integration ============== */
    const phaseTeams: PhaseTeam[] = clubs
        .filter((club) => selectedClubs.includes(club.id))
        .map((club) => ({
            id: club.id,
            name: club.name,
            short: getClubShortName(club),
            color: club.primary_color || '#00A365',
        }));

    const resolvedPhaseType = phaseConfig?.phaseType || mapFormatToPhaseType(formData.format);
    const effectivePhaseConfig = phaseConfig || createDefaultPhaseConfig(resolvedPhaseType, selectedClubs, formData.rules);
    const phaseConfigToPersist: PhaseConfiguration = { ...effectivePhaseConfig, selectedTeamIds: selectedClubs };

    const selectedSport = sportsCatalog.find((sport) => sport.id === formData.sport);
    const selectedCountryOption = countryOptions.find((option) => option.id === formData.country) || null;

    const applyPhaseConfig = (nextConfig: PhaseConfiguration) => {
        setPhaseConfig(nextConfig);
        const nextFormat = mapPhaseTypeToFormat(nextConfig.phaseType, formData.format);
        setFormData((prev) => prev.format === nextFormat ? prev : { ...prev, format: nextFormat });
        if (!sameIdList(selectedClubs, nextConfig.selectedTeamIds)) {
            setSelectedClubs(nextConfig.selectedTeamIds);
        }
    };

    /* ============== Inline union creator ============== */
    const handleUnionCreateSlugChange = (value: string) => {
        setUnionCreateForm((prev) => ({ ...prev, slug: slugify(value), slugManuallyEdited: true }));
    };

    const handleToggleUnionCreator = () => {
        setUnionCreateError(null);
        setUnionCreateSuccess(null);
        setShowUnionCreator((prev) => {
            const nextOpen = !prev;
            if (nextOpen) {
                setUnionCreateForm((current) => ({
                    ...current,
                    country: current.country || selectedCountryOption?.label || formData.country || 'Argentina',
                }));
            }
            return nextOpen;
        });
    };

    const handleCreateUnion = async () => {
        const unionName = unionCreateForm.name.trim();
        const unionSlug = slugify(unionCreateForm.slug || unionName);

        if (unionName.length < 2) { setUnionCreateError('Ingresá un nombre válido para la unión.'); return; }
        if (!unionSlug) { setUnionCreateError('Ingresá un slug válido para la unión.'); return; }

        setCreatingUnion(true);
        setUnionCreateError(null);
        setUnionCreateSuccess(null);

        try {
            const result = await createUnion({
                name: unionName,
                slug: unionSlug,
                country: unionCreateForm.country || selectedCountryOption?.label || formData.country || null,
                sport: formData.sport || null,
                union_level: unionCreateForm.unionLevel || 'regional',
            });

            if (!result.success || !result.union) {
                setUnionCreateError(result.error || 'No se pudo crear la unión.');
                return;
            }

            const createdUnion: UnionOption = {
                id: result.union.id,
                name: result.union.name,
                country: result.union.country || unionCreateForm.country || null,
            };

            setAvailableUnions((prev) => sortUnionOptions([
                ...prev.filter((union) => union.id !== createdUnion.id),
                createdUnion,
            ]));
            setFormData((prev) => ({ ...prev, unionId: createdUnion.id }));
            invalidateCache('unions_list');
            refresh('unions');
            setUnionCreateSuccess('Unión creada y seleccionada.');
            setShowUnionCreator(false);
            setUnionCreateForm({
                name: '',
                slug: '',
                country: selectedCountryOption?.label || formData.country || 'Argentina',
                unionLevel: 'regional',
                slugManuallyEdited: false,
            });
        } catch (error) {
            setUnionCreateError(error instanceof Error ? error.message : 'No se pudo crear la unión.');
        } finally {
            setCreatingUnion(false);
        }
    };

    /* ============== Plantilla → defaults ============== */
    const handleTemplateSelect = (template: TournamentTemplate) => {
        setSelectedTemplate(template.id);
        const nextPhaseType = mapFormatToPhaseType(template.format);

        setFormData((prev) => ({
            ...prev,
            format: template.format,
        }));

        setPhaseConfig((current) => {
            const baseConfig = current || createDefaultPhaseConfig(nextPhaseType, selectedClubs, formData.rules);
            return { ...baseConfig, phaseType: nextPhaseType };
        });

        if (template.advanced) {
            setStage('advanced');
        } else {
            setStage('basics');
        }
    };

    /* ============== Validación inline del nombre ============== */
    const trimmedName = formData.name.trim();
    const nameStatus: 'idle' | 'too-short' | 'ok' = useMemo(() => {
        if (!trimmedName) return 'idle';
        if (trimmedName.length < 3) return 'too-short';
        return 'ok';
    }, [trimmedName]);

    const computedSlug = useMemo(() => trimmedName ? slugify(trimmedName) : '', [trimmedName]);

    /* ============== Filtro de catálogo de clubes ============== */
    const normalizedClubSearch = searchTerm.trim().toLowerCase();
    const filteredClubs = useMemo(() => {
        return clubs.filter((club) => {
            if (entityFilter !== 'all' && getClubEntityTypeSlug(club.entity_type) !== entityFilter) return false;
            if (!normalizedClubSearch) return true;
            return [
                club.name, club.short_name, club.shortName, club.slug,
                club.city, club.region, club.country,
                getClubEntityTypeLabel(club.entity_type),
            ].some((value) => String(value || '').toLowerCase().includes(normalizedClubSearch));
        });
    }, [clubs, entityFilter, normalizedClubSearch]);

    const entityCounts = useMemo(() => {
        const counts: Record<EntityFilter, number> = { all: clubs.length, club: 0, seleccion: 0, franquicia: 0, academia: 0 };
        clubs.forEach((club) => {
            const slug = getClubEntityTypeSlug(club.entity_type);
            counts[slug]++;
        });
        return counts;
    }, [clubs]);

    /* ============== Navegación entre stages ============== */
    const canAdvanceFromBasics = nameStatus === 'ok' && Boolean(formData.sport);
    const canAdvanceFromStructure = formData.teamCount >= 2;

    const goNext = async () => {
        if (stage === 'basics') {
            if (!canAdvanceFromBasics) return;
            setStage('structure');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        if (stage === 'structure') {
            if (!canAdvanceFromStructure) return;
            setStage('participants');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return;
        }
        if (stage === 'participants' || stage === 'advanced') {
            await handleFinalize();
        }
    };

    const goPrev = () => {
        if (stage === 'basics') setStage('template');
        else if (stage === 'structure') setStage('basics');
        else if (stage === 'participants') setStage('structure');
        else if (stage === 'advanced') setStage('participants');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    /* ============== Persistir la fase (idéntico al wizard original) ============== */
    const saveQuickPhase = async (savedId: string, config: PhaseConfiguration) => {
        const existingPhasesResponse = await fetch(`/api/tournaments/${savedId}/phases`);
        let existingPhaseId: string | null = null;

        if (existingPhasesResponse.ok) {
            const existingPhasesPayload = await existingPhasesResponse.json();
            existingPhaseId = existingPhasesPayload?.data?.[0]?.id || null;
        }

        const phaseResponse = await fetch(
            existingPhaseId
                ? `/api/tournaments/${savedId}/phases/${existingPhaseId}`
                : `/api/tournaments/${savedId}/phases`,
            {
                method: existingPhaseId ? 'PATCH' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(buildQuickPhasePayload(config)),
            }
        );

        if (!phaseResponse.ok) {
            const phaseError = await phaseResponse.json().catch(() => null);
            throw new Error(phaseError?.error || 'No se pudo guardar la fase inicial.');
        }
    };

    /* ============== Finalizar (crear o actualizar) ============== */
    const handleFinalize = async () => {
        setSaving(true);
        try {
            const ruleset = {
                pointsWin: formData.rules.pointsWin,
                pointsDraw: formData.rules.pointsDraw,
                pointsLoss: formData.rules.pointsLoss,
                ...(formData.sport === 'rugby' ? {
                    pointsBonusTry: formData.rules.pointsBonusTry,
                    pointsBonusLoss: formData.rules.pointsBonusLoss,
                } : {})
            };

            if (isTournamentAdmin) {
                // Panel de Admin de Torneos: una sola llamada a la API scoped, que
                // crea el torneo (con created_by + membership), temporada,
                // participantes y fase inicial, y lo deja a tu nombre.
                const participantClubIds = Array.from(new Set(selectedClubs.filter(Boolean)));
                const response = await fetch('/api/admin/torneo/tournaments', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        name: formData.name,
                        display_name: formData.name,
                        sport_id: formData.sport,
                        season_id: formData.season || '2026',
                        category: formData.category || null,
                        age_grade: formData.ageGrade || null,
                        format: mapPhaseTypeToFormat(phaseConfigToPersist.phaseType, formData.format) || 'league',
                        country: formData.country ? (selectedCountryOption?.label || formData.country) : null,
                        country_id: formData.country ? (selectedCountryOption?.id || formData.country) : null,
                        union_id: formData.unionId || null,
                        logo_url: formData.logoUrl || null,
                        primary_color: null,
                        status: formData.visibility === 'public' ? 'published' : 'draft',
                        is_visible: formData.visibility === 'public',
                        ruleset,
                        team_count: formData.teamCount || participantClubIds.length || 2,
                        league_rounds: formData.leagueRounds || 1,
                        participant_club_ids: participantClubIds,
                        create_phase: true,
                        create_season: true,
                    }),
                });
                const result = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(result?.error || 'No se pudo crear el torneo.');
                }

                if (typeof window !== 'undefined') {
                    try { window.localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* noop */ }
                }

                // The API creates the tournament even when sub-steps (season,
                // participants, phases, membership) only partially succeed. Don't
                // swallow those warnings — the user must know the tournament may
                // need manual completion in the gestor.
                const warnings: string[] = Array.isArray(result?.warnings)
                    ? result.warnings.filter((w: unknown): w is string => typeof w === 'string' && w.trim().length > 0)
                    : [];
                if (warnings.length > 0 && typeof window !== 'undefined') {
                    window.alert(
                        `El torneo se creó, pero con avisos:\n\n- ${warnings.join('\n- ')}\n\n` +
                        'Revisalo en el gestor para completar lo que falte.',
                    );
                }

                router.push(tournamentsHomeHref);
                return;
            }

            const payload: Record<string, unknown> = {
                name: formData.name,
                sport_id: formData.sport,
                season_id: formData.season || '2026',
                category: formData.category || null,
                age_grade: formData.ageGrade || null,
                format: mapPhaseTypeToFormat(phaseConfigToPersist.phaseType, formData.format) || null,
                country: formData.country ? (selectedCountryOption?.label || formData.country) : null,
                country_id: formData.country ? (selectedCountryOption?.id || formData.country) : null,
                union_id: formData.unionId || null,
                logo_url: formData.logoUrl || null,
                status: formData.visibility === 'public' ? 'published' : 'draft',
                is_visible: formData.visibility === 'public',
                ruleset: {
                    ...ruleset,
                    competition: buildTournamentCompetitionConfig(formData.format, {
                        champion_mode: formData.circuitChampionMode,
                    }),
                },
            };

            let savedId: string;

            if (isEdit && tournamentId) {
                const result = await updateEntitySafe('tournament', tournamentId, payload);
                if (result.success === false) throw new Error(result.error);
                savedId = tournamentId;
            } else {
                payload.slug = `${slugify(formData.name)}-${Date.now()}`;
                const result = await createEntitySafe('tournament', payload);
                if (result.success === false) throw new Error(result.error);
                savedId = result.id;
            }

            const participantClubIds = Array.from(new Set(selectedClubs.filter(Boolean)));
            const clubsMissingDivisionSelection = participantClubIds.filter((clubId) => {
                const squads = clubSquadsByClub[clubId] || [];
                return squads.length > 1 && !selectedDivisionByClub[clubId];
            });

            if (clubsMissingDivisionSelection.length > 0) {
                const missingClubNames = clubs
                    .filter((club) => clubsMissingDivisionSelection.includes(club.id))
                    .map((club) => club.name)
                    .slice(0, 3)
                    .join(', ');
                throw new Error(`Seleccioná el plantel participante para: ${missingClubNames}`);
            }

            // Persistir participantes
            if (isEdit) {
                await supabase.from('tournament_participants').delete().eq('tournament_id', savedId);
            }
            if (participantClubIds.length > 0) {
                await Promise.all(
                    participantClubIds.map(async (clubId) => {
                        const selectedDivisionId = selectedDivisionByClub[clubId] || null;
                        const response = await fetch(`/api/tournaments/${savedId}/participants`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                club_id: clubId,
                                division_id: selectedDivisionId,
                                type: 'club',
                                status: 'active',
                            }),
                        });

                        const payload = await response.json().catch(() => null);
                        if (!response.ok) {
                            throw new Error(payload?.error || 'No se pudo agregar un participante al torneo.');
                        }
                    })
                );
            }

            await saveQuickPhase(savedId, phaseConfigToPersist);

            // Limpiar borrador
            if (typeof window !== 'undefined') {
                try { window.localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* noop */ }
            }

            // Forzar re-fetch del listado para que el torneo recién guardado aparezca.
            // El SuperConsole cache es client-side, revalidatePath del server action no lo limpia.
            invalidateCache('tournaments_list');
            refresh('tournaments');

            router.push(tournamentsHomeHref);
        } catch (err: unknown) {
            alert('Error al guardar el torneo: ' + (err instanceof Error ? err.message : String(err)));
        } finally {
            setSaving(false);
        }
    };

    /* =====================================================
       RENDER: switch por stage
       ===================================================== */

    const stageIndex = STAGE_ORDER.indexOf(stage);
    const progress = stageIndex >= 0 ? ((stageIndex) / (STAGE_ORDER.length - 1)) * 100 : 0;

    return (
        <div className="creation-body">
            <div className="creation-container">

                {/* ===================== Header ===================== */}
                <header className="creation-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <button
                            onClick={() => router.push(tournamentsHomeHref)}
                            className="btn btn-outline"
                            style={{ padding: '8px 16px', marginBottom: '16px', height: 'auto', width: 'auto' }}
                        >
                            <ChevronLeft size={16} /> Volver a torneos
                        </button>
                        <h1>{isEdit ? 'Editar torneo' : 'Crear torneo'}</h1>
                        <p>
                            {stage === 'template' && 'Elegí una plantilla para empezar rápido o configurá todo desde cero.'}
                            {stage === 'basics' && 'Lo básico: identidad y categorización.'}
                            {stage === 'structure' && 'Cantidad de equipos, formato y reglas.'}
                            {stage === 'participants' && 'Buscá clubes y planteles del catálogo.'}
                            {stage === 'advanced' && 'Modo avanzado: configurador completo de fases.'}
                        </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {!isEdit && stage !== 'template' && (
                            <div className="mode-switch">
                                <button
                                    className={stage !== 'advanced' ? 'active' : ''}
                                    onClick={() => stage === 'advanced' && setStage('participants')}
                                    disabled={stage === 'advanced' && false}
                                >Rápido</button>
                                <button
                                    className={stage === 'advanced' ? 'active' : ''}
                                    onClick={() => setStage('advanced')}
                                >Avanzado</button>
                            </div>
                        )}
                        {!isEdit && stage !== 'template' && autosaveLabel && (
                            <span className={`autosave-pill ${autosaveState === 'saving' ? 'saving' : 'saved'}`}>
                                {autosaveState === 'saving' ? 'Guardando...' : autosaveLabel}
                            </span>
                        )}
                    </div>
                </header>

                {/* ===================== Stepper ===================== */}
                {stage !== 'template' && stage !== 'advanced' && (
                    <div className="stepper-bar">
                        <div className="stepper-progress-row">
                            <span>Paso <strong>{stageIndex} de {STAGE_ORDER.length - 1}</strong></span>
                            <span>
                                {stage === 'basics' && 'Lo básico'}
                                {stage === 'structure' && 'Estructura'}
                                {stage === 'participants' && 'Participantes'}
                            </span>
                        </div>
                        <div className="stepper-progress-bar">
                            <span className="stepper-progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                )}

                {/* ===================== STAGE 0 · TEMPLATE PICKER ===================== */}
                {stage === 'template' && !isEdit && (
                    <section className="tplpick-wrap">
                        <h2 style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em', marginBottom: '6px' }}>
                            ¿Qué tipo de torneo querés crear?
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                            Elegí una plantilla y completá lo esencial. Después podés ajustar cualquier detalle.
                        </p>

                        <div className="tplpick-grid">
                            {TOURNAMENT_TEMPLATES.map((tpl) => (
                                <button
                                    key={tpl.id}
                                    type="button"
                                    className={`tplpick-card ${tpl.popular ? 'popular' : ''} ${tpl.dashed ? 'dashed' : ''}`}
                                    onClick={() => handleTemplateSelect(tpl)}
                                >
                                    <div className="tplpick-icon">{tpl.icon}</div>
                                    <h3>{tpl.title}</h3>
                                    <p>{tpl.description}</p>
                                </button>
                            ))}
                        </div>

                        <div className="tplpick-callout">
                            💡 <strong>Tip:</strong> 8 de cada 10 torneos usan &quot;Liga · todos contra todos&quot;. Si no estás seguro, empezá ahí — podés cambiar el formato más tarde sin perder participantes ni partidos cargados.
                        </div>
                    </section>
                )}

                {/* ===================== STAGE 1 · LO BÁSICO ===================== */}
                {stage === 'basics' && (
                    <>
                        <article className="partition">
                            <div className="partition-header">
                                <h2>Información del torneo</h2>
                                <p>Solo lo imprescindible. Logo y publicación se configuran después.</p>
                            </div>
                            <div className="partition-body">
                                <div className="form-grid">
                                    <div className="field-group">
                                        <label>Nombre del torneo *</label>
                                        <input
                                            className={`form-input ${nameStatus === 'ok' ? 'is-ok' : nameStatus === 'too-short' ? 'is-error' : ''}`}
                                            type="text"
                                            value={formData.name}
                                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                                            placeholder="Ej: Torneo del Interior A 2026"
                                            autoFocus
                                        />
                                        {nameStatus === 'ok' && (
                                            <div className="field-help-ok">
                                                <CheckCircle2 size={14} />
                                                URL: <code style={{ fontFamily: 'ui-monospace, monospace', marginLeft: 4 }}>/torneos/{computedSlug}</code>
                                            </div>
                                        )}
                                        {nameStatus === 'too-short' && (
                                            <div className="field-help-error">Ingresá al menos 3 caracteres.</div>
                                        )}
                                    </div>

                                    <div className="field-group">
                                        <label>Deporte *</label>
                                        <div className="sport-pick-grid">
                                            {sportsCatalog.map(sport => (
                                                <button
                                                    key={sport.id}
                                                    type="button"
                                                    className={formData.sport === sport.id ? 'selected' : ''}
                                                    onClick={() => handleSportChange(sport.id)}
                                                >
                                                    <span className="emo">{sport.icon}</span>
                                                    <span>{sport.nameEs}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label>Temporada</label>
                                            <select
                                                className="form-select"
                                                value={formData.season}
                                                onChange={e => setFormData({ ...formData, season: e.target.value })}
                                            >
                                                <option value="2026">2026</option>
                                                <option value="2025">2025</option>
                                                <option value="2024">2024</option>
                                            </select>
                                        </div>
                                        <div className="field-group">
                                            <label>Categoría</label>
                                            <input
                                                className="form-input"
                                                type="text"
                                                value={formData.category}
                                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                placeholder="Ej: Primera, Juveniles, Reserva..."
                                            />
                                        </div>
                                    </div>

                                    <div className="field-group">
                                        <label>Audiencia pública</label>
                                        <div className="choice-pair">
                                            {(['mayores', 'juveniles'] as TournamentAudience[]).map((audience) => (
                                                <button
                                                    key={audience}
                                                    type="button"
                                                    className={formData.publicAudience === audience ? 'selected' : ''}
                                                    onClick={() => handlePublicAudienceChange(audience)}
                                                >
                                                    {audience === 'mayores' ? 'Mayores' : 'Juveniles'}
                                                    <span className="small">
                                                        {audience === 'mayores' ? 'Aparece en la portada principal' : 'Sección juvenil'}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <details className="tg-disclosure">
                                        <summary>Más opciones · país, unión, clasificación de edad y logo</summary>
                                        <div className="tg-disclosure-body">
                                            <div className="grid-2">
                                                <div className="field-group">
                                                    <label>País / Región</label>
                                                    <select
                                                        className="form-select"
                                                        value={formData.country}
                                                        onChange={e => setFormData({ ...formData, country: e.target.value })}
                                                    >
                                                        <option value="">No especificado</option>
                                                        {countryOptions.map((country) => (
                                                            <option key={country.id} value={country.id}>{country.label}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div className="field-group">
                                                    <label>Unión vinculada</label>
                                                    <select
                                                        className="form-select"
                                                        value={formData.unionId}
                                                        onChange={e => setFormData({ ...formData, unionId: e.target.value })}
                                                    >
                                                        <option value="">Independiente (sin vínculo)</option>
                                                        {availableUnions.map(u => (
                                                            <option key={u.id} value={u.id}>{u.name}</option>
                                                        ))}
                                                    </select>
                                                    <div className="inline-union-toolbar">
                                                        <p className="field-help">
                                                            {superConsoleLoading.unions && availableUnions.length === 0
                                                                ? 'Cargando uniones...'
                                                                : availableUnions.length > 0
                                                                    ? `${availableUnions.length} uniones disponibles.`
                                                                    : 'No hay uniones cargadas todavía.'}
                                                        </p>
                                                        <div className="inline-union-actions">
                                                            <button type="button" className="btn btn-outline btn-inline" onClick={() => refresh('unions')}>
                                                                <RefreshCw size={14} /> Refrescar
                                                            </button>
                                                            <button type="button" className="btn btn-outline btn-inline" onClick={handleToggleUnionCreator}>
                                                                <Plus size={14} /> {showUnionCreator ? 'Cancelar' : 'Crear unión'}
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {showUnionCreator && (
                                                        <div className="inline-union-form">
                                                            <div className="grid-2">
                                                                <div className="field-group">
                                                                    <label>Nombre</label>
                                                                    <input
                                                                        className="form-input"
                                                                        type="text"
                                                                        value={unionCreateForm.name}
                                                                        onChange={(e) => setUnionCreateForm((prev) => ({ ...prev, name: e.target.value, slugManuallyEdited: prev.slugManuallyEdited }))}
                                                                        placeholder="Ej: Unión de Rugby de Buenos Aires"
                                                                    />
                                                                </div>
                                                                <div className="field-group">
                                                                    <label>Slug</label>
                                                                    <input
                                                                        className="form-input"
                                                                        type="text"
                                                                        value={unionCreateForm.slug}
                                                                        onChange={(e) => handleUnionCreateSlugChange(e.target.value)}
                                                                        placeholder="union-rugby-buenos-aires"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="grid-2">
                                                                <div className="field-group">
                                                                    <label>País</label>
                                                                    <input
                                                                        className="form-input"
                                                                        type="text"
                                                                        value={unionCreateForm.country}
                                                                        onChange={(e) => setUnionCreateForm((prev) => ({ ...prev, country: e.target.value }))}
                                                                    />
                                                                </div>
                                                                <div className="field-group">
                                                                    <label>Nivel</label>
                                                                    <select
                                                                        className="form-select"
                                                                        value={unionCreateForm.unionLevel}
                                                                        onChange={(e) => setUnionCreateForm((prev) => ({ ...prev, unionLevel: e.target.value }))}
                                                                    >
                                                                        <option value="regional">Regional</option>
                                                                        <option value="provincial">Provincial</option>
                                                                        <option value="nacional">Nacional</option>
                                                                        <option value="internacional">Internacional</option>
                                                                    </select>
                                                                </div>
                                                            </div>
                                                            {unionCreateError && <p className="field-error">{unionCreateError}</p>}
                                                            {unionCreateSuccess && <p className="field-success">{unionCreateSuccess}</p>}
                                                            <button type="button" className="btn btn-primary btn-inline" onClick={handleCreateUnion} disabled={creatingUnion}>
                                                                {creatingUnion ? <><Loader2 className="spinning" size={14} /> Creando...</> : 'Crear unión'}
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="field-group">
                                                <label>Clasificación de edad</label>
                                                <select
                                                    className="form-select"
                                                    value={formData.ageGrade}
                                                    onChange={e => handleAgeGradeChange(e.target.value)}
                                                >
                                                    {AGE_GRADE_OPTIONS.map((option) => (
                                                        <option key={option} value={option}>{option}</option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="field-group">
                                                <LogoUploader
                                                    currentLogo={formData.logoUrl || ''}
                                                    label="Logo del torneo"
                                                    onUpload={(url) => setFormData((prev) => ({ ...prev, logoUrl: url }))}
                                                />
                                            </div>
                                        </div>
                                    </details>
                                </div>
                            </div>
                        </article>
                    </>
                )}

                {/* ===================== STAGE 2 · ESTRUCTURA ===================== */}
                {stage === 'structure' && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>¿Cómo se juega?</h2>
                            <p>Confirmá formato, cantidad de equipos y reglas. Tu plantilla ya viene precargada.</p>
                        </div>
                        <div className="partition-body">

                            <div className="field-group">
                                <label>Formato</label>
                                <div className="choice-grid">
                                    <button
                                        type="button"
                                        className={`choice-btn ${formData.format === 'league' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('league')}
                                    >
                                        <ListOrdered className="choice-icon" />
                                        <span className="choice-label">Liga (todos contra todos)</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`choice-btn ${formData.format === 'knockout' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('knockout')}
                                    >
                                        <GitMerge className="choice-icon" />
                                        <span className="choice-label">Eliminación directa</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`choice-btn ${formData.format === 'groups' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('groups')}
                                    >
                                        <LayoutGrid className="choice-icon" />
                                        <span className="choice-label">Grupos + Playoff</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={`choice-btn ${formData.format === 'circuit' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('circuit')}
                                    >
                                        <Trophy className="choice-icon" />
                                        <span className="choice-label">Circuito por eventos</span>
                                    </button>
                                </div>
                            </div>

                            {formData.format === 'circuit' && (
                                <div className="field-group">
                                    <label>Modo del circuito</label>
                                    <select
                                        className="form-select"
                                        value={formData.circuitChampionMode}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, circuitChampionMode: e.target.value as CircuitChampionMode }))}
                                    >
                                        <option value="accumulation">Acumulación de puntos (tabla agregada)</option>
                                        <option value="final">Final / playoff decisivo</option>
                                    </select>
                                </div>
                            )}

                            <div className="grid-2">
                                <div className="field-group">
                                    <label>Cantidad de equipos</label>
                                    <div className="tg-counter">
                                        <button type="button" onClick={() => setFormData((p) => ({ ...p, teamCount: Math.max(2, p.teamCount - 1) }))}>−</button>
                                        <input
                                            type="number"
                                            min={2}
                                            max={64}
                                            value={formData.teamCount}
                                            onChange={(e) => setFormData((p) => ({ ...p, teamCount: Math.max(2, Math.min(64, Number(e.target.value) || 2)) }))}
                                        />
                                        <button type="button" onClick={() => setFormData((p) => ({ ...p, teamCount: Math.min(64, p.teamCount + 1) }))}>+</button>
                                    </div>
                                    <p className="field-help">Podés agregar o quitar después.</p>
                                </div>

                                {formData.format === 'league' && (
                                    <div className="field-group">
                                        <label>Modalidad</label>
                                        <div className="choice-pair">
                                            <button
                                                type="button"
                                                className={formData.leagueRounds === 1 ? 'selected' : ''}
                                                onClick={() => setFormData((p) => ({ ...p, leagueRounds: 1 }))}
                                            >
                                                Solo ida
                                                <span className="small">{Math.max(0, formData.teamCount - 1)} fechas</span>
                                            </button>
                                            <button
                                                type="button"
                                                className={formData.leagueRounds === 2 ? 'selected' : ''}
                                                onClick={() => setFormData((p) => ({ ...p, leagueRounds: 2 }))}
                                            >
                                                Ida y vuelta
                                                <span className="small">{Math.max(0, (formData.teamCount - 1) * 2)} fechas</span>
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Live preview */}
                            {formData.format === 'league' && (
                                <div className="live-preview-chip">
                                    <div className="kicker">Vista previa</div>
                                    <strong>
                                        {formData.teamCount} equipos · {Math.max(0, (formData.teamCount - 1) * formData.leagueRounds)} fechas · {Math.max(0, (formData.teamCount * (formData.teamCount - 1) / 2) * formData.leagueRounds)} partidos
                                    </strong>
                                    <div className="meta">Editable después. Las fechas se generan al crear el torneo.</div>
                                </div>
                            )}

                            <details className="tg-disclosure">
                                <summary>Puntos por partido</summary>
                                <div className="tg-disclosure-body">
                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label>Victoria</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                value={formData.rules.pointsWin}
                                                onChange={(e) => setFormData((p) => ({ ...p, rules: { ...p.rules, pointsWin: parseInt(e.target.value) || 0 } }))}
                                            />
                                        </div>
                                        <div className="field-group">
                                            <label>Empate</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                value={formData.rules.pointsDraw}
                                                onChange={(e) => setFormData((p) => ({ ...p, rules: { ...p.rules, pointsDraw: parseInt(e.target.value) || 0 } }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label>Derrota</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                value={formData.rules.pointsLoss}
                                                onChange={(e) => setFormData((p) => ({ ...p, rules: { ...p.rules, pointsLoss: parseInt(e.target.value) || 0 } }))}
                                            />
                                        </div>
                                        {formData.sport === 'rugby' && (
                                            <div className="field-group">
                                                <label>Bonus try (4 o más)</label>
                                                <input
                                                    className="form-input"
                                                    type="number"
                                                    value={formData.rules.pointsBonusTry}
                                                    onChange={(e) => setFormData((p) => ({ ...p, rules: { ...p.rules, pointsBonusTry: parseInt(e.target.value) || 0 } }))}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {formData.sport === 'rugby' && (
                                        <div className="field-group">
                                            <label>Bonus defensivo (perder por ≤7)</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                value={formData.rules.pointsBonusLoss}
                                                onChange={(e) => setFormData((p) => ({ ...p, rules: { ...p.rules, pointsBonusLoss: parseInt(e.target.value) || 0 } }))}
                                            />
                                            <p className="field-help">El editor profesional de bonus (con reglas evaluables) llega en la próxima versión. Por ahora estos campos siguen escribiendo a <code style={{ fontFamily: 'ui-monospace, monospace' }}>ruleset.pointsBonusTry / pointsBonusLoss</code>.</p>
                                        </div>
                                    )}
                                </div>
                            </details>

                            <div className="tplpick-callout" style={{ marginTop: '14px' }}>
                                <Settings2 size={16} style={{ color: 'var(--info)', flexShrink: 0 }} />
                                <div>
                                    Para multi-fase (ej: clasificación + playoff), criterios de desempate funcionales, tags por posición y fixture importado, usá el botón <strong>&quot;Avanzado&quot;</strong> arriba a la derecha. Toda tu configuración se preserva.
                                </div>
                            </div>
                        </div>
                    </article>
                )}

                {/* ===================== STAGE 3 · PARTICIPANTES ===================== */}
                {stage === 'participants' && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Participantes</h2>
                            <p>Buscá clubes, selecciones, franquicias o academias en el catálogo y elegí su plantel.</p>
                        </div>
                        <div className="partition-body">

                            <div className="club-search-wrap">
                                <div className="club-summary-bar">
                                    <div>
                                        <strong>{selectedClubs.length}</strong> equipos seleccionados
                                        {formData.teamCount > 0 && (
                                            <> · objetivo de la plantilla: <strong>{formData.teamCount}</strong></>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-outline btn-inline"
                                        onClick={toggleAllClubs}
                                        style={{ padding: '4px 10px', fontSize: '11px' }}
                                    >
                                        {selectedClubs.length === clubs.length && clubs.length > 0 ? 'Limpiar selección' : 'Seleccionar todos'}
                                    </button>
                                </div>

                                <div className="search-box" style={{ position: 'relative' }}>
                                    <Search className="icon" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre, tipo o ubicación..."
                                        className="form-input"
                                        value={searchTerm}
                                        onChange={e => setSearchTerm(e.target.value)}
                                    />
                                </div>

                                <div className="club-filter-chips">
                                    {(['all', 'club', 'seleccion', 'franquicia', 'academia'] as EntityFilter[]).map((f) => (
                                        <button
                                            key={f}
                                            type="button"
                                            className={`club-filter-chip ${entityFilter === f ? 'active' : ''}`}
                                            onClick={() => setEntityFilter(f)}
                                        >
                                            {f === 'all' && 'Todos'}
                                            {f === 'club' && 'Clubes'}
                                            {f === 'seleccion' && 'Selecciones'}
                                            {f === 'franquicia' && 'Franquicias'}
                                            {f === 'academia' && 'Academias'}
                                            <span className="count">{entityCounts[f]}</span>
                                        </button>
                                    ))}
                                </div>

                                <div className="club-meta-row">
                                    <span>
                                        {loadingClubs
                                            ? 'Cargando catálogo...'
                                            : clubsError
                                                ? clubsError
                                                : `${filteredClubs.length} de ${clubs.length} equipos disponibles`}
                                    </span>
                                </div>
                            </div>

                            <div className="club-list-grid">
                                {loadingClubs && (
                                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
                                        <Loader2 className="spinning" size={24} style={{ marginBottom: '8px' }} />
                                        <div>Cargando catálogo completo...</div>
                                    </div>
                                )}

                                {!loadingClubs && filteredClubs.length === 0 && (
                                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-dim)' }}>
                                        No hay equipos que coincidan con la búsqueda.
                                    </div>
                                )}

                                {!loadingClubs && filteredClubs.map((club) => {
                                    const added = selectedClubs.includes(club.id);
                                    const squads = clubSquadsByClub[club.id] || [];
                                    const isLoadingSquads = Boolean(loadingSquadsByClub[club.id]);
                                    const selectedDivisionId = selectedDivisionByClub[club.id] || '';
                                    const entitySlug = getClubEntityTypeSlug(club.entity_type);

                                    return (
                                        <div key={club.id} className={`club-row ${added ? 'added' : ''}`}>
                                            <div className="row-check" onClick={() => setClubSelection(club.id, !added)}>
                                                {added ? '✓' : ''}
                                            </div>
                                            <div className="row-logo">
                                                {club.logo_url ? (
                                                    <img src={club.logo_url} alt="" />
                                                ) : (
                                                    <span>{getClubShortName(club)}</span>
                                                )}
                                            </div>
                                            <div className="row-info">
                                                <div className="row-name">
                                                    {club.name}
                                                    <span className={`entity-pill ${entitySlug}`}>
                                                        {getClubEntityTypeLabel(club.entity_type)}
                                                    </span>
                                                </div>
                                                <div className="row-meta">
                                                    <Flag size={11} style={{ display: 'inline', marginRight: 4 }} />
                                                    {[club.city, club.region, club.country].filter(Boolean).join(' · ') || 'Sin ubicación'}
                                                </div>

                                                {added && (
                                                    <div className="squad-picker-row">
                                                        <label>Plantel a inscribir</label>
                                                        <select
                                                            value={selectedDivisionId}
                                                            onChange={(e) => setSelectedDivisionByClub((prev) => ({ ...prev, [club.id]: e.target.value }))}
                                                            disabled={isLoadingSquads}
                                                        >
                                                            <option value="">
                                                                {isLoadingSquads
                                                                    ? 'Cargando planteles...'
                                                                    : squads.length === 0
                                                                        ? 'Sin planteles vinculados'
                                                                        : squads.length === 1
                                                                            ? 'Plantel detectado automáticamente'
                                                                            : 'Seleccioná un plantel'}
                                                            </option>
                                                            {squads.map((squad) => (
                                                                <option key={squad.id} value={squad.id}>
                                                                    {formatSquadLabel(squad)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                        {!isLoadingSquads && squads.length === 0 && (
                                                            <span className="squad-hint legacy">
                                                                Competirá en modo legacy hasta que tenga planteles vinculados.
                                                            </span>
                                                        )}
                                                        {squads.length > 1 && !selectedDivisionId && (
                                                            <span className="squad-hint warn">
                                                                Elegí cuál plantel querés inscribir.
                                                            </span>
                                                        )}
                                                        {squads.length === 1 && selectedDivisionId && (
                                                            <span className="squad-hint info">
                                                                ✓ Plantel único · {formatSquadLabel(squads[0])}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                className="row-action"
                                                onClick={() => setClubSelection(club.id, !added)}
                                            >
                                                {added ? 'Quitar' : 'Añadir'}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>

                            <div className="tplpick-callout" style={{ marginTop: '14px' }}>
                                💡 <div>
                                    Si el equipo no está en el catálogo, podés crearlo desde la sección de Clubes y volver a este wizard. El borrador se guarda automáticamente.
                                </div>
                            </div>

                            {/* Visibilidad final + acciones */}
                            <div className="field-group" style={{ marginTop: '24px' }}>
                                <label>Al crear</label>
                                <div className="choice-pair">
                                    <button
                                        type="button"
                                        className={formData.visibility === 'private' ? 'selected' : ''}
                                        onClick={() => setFormData((p) => ({ ...p, visibility: 'private' }))}
                                    >
                                        Borrador
                                        <span className="small">Solo visible para admins</span>
                                    </button>
                                    <button
                                        type="button"
                                        className={formData.visibility === 'public' ? 'selected' : ''}
                                        onClick={() => setFormData((p) => ({ ...p, visibility: 'public' }))}
                                    >
                                        Público
                                        <span className="small">Visible en la app al instante</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </article>
                )}

                {/* ===================== ADVANCED · PhaseCreator ===================== */}
                {stage === 'advanced' && (
                    <article className="partition">
                        <div className="partition-header">
                            <h2>Configurador avanzado de fases</h2>
                            <p>Multi-fase, criterios de desempate, tags y fixture. Toda tu configuración previa se preserva.</p>
                        </div>
                        <div className="partition-body" style={{ padding: 0 }}>
                            <PhaseCreator
                                key={`adv-phase-${formData.format}-${effectivePhaseConfig.phaseType}`}
                                phaseIndex={1}
                                totalPhases={1}
                                teams={phaseTeams}
                                initialConfig={effectivePhaseConfig}
                                onPrev={() => setStage('participants')}
                                onChange={applyPhaseConfig}
                                onSaveDraft={applyPhaseConfig}
                                onNext={(config) => {
                                    applyPhaseConfig(config);
                                    handleFinalize();
                                }}
                            />
                        </div>
                    </article>
                )}

                {/* ===================== Footer actions ===================== */}
                {stage !== 'template' && stage !== 'advanced' && (
                    <footer className="actions-footer">
                        <button
                            className="btn btn-outline"
                            disabled={saving}
                            onClick={goPrev}
                        >
                            Atrás
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={goNext}
                            disabled={
                                saving ||
                                (stage === 'basics' && !canAdvanceFromBasics) ||
                                (stage === 'structure' && !canAdvanceFromStructure)
                            }
                        >
                            {saving ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Loader2 className="spinning" size={18} />
                                    {isEdit ? 'Guardando...' : 'Creando...'}
                                </span>
                            ) : stage === 'participants' ? (
                                isEdit ? 'Guardar cambios' : `Crear torneo${selectedClubs.length > 0 ? ` con ${selectedClubs.length} equipos` : ''}`
                            ) : (
                                <>Siguiente <Globe size={14} style={{ marginLeft: 4 }} /></>
                            )}
                        </button>
                    </footer>
                )}
            </div>
        </div>
    );
}
