'use client';

import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ChevronLeft, Search, Loader2, Plus, RefreshCw,
    LayoutGrid, ListOrdered, GitMerge, Flag, Settings2, CheckCircle2,
    ArrowRight, Check, Lightbulb, type LucideIcon,
} from 'lucide-react';
import PhaseCreator, { type PhaseConfiguration, type Team as PhaseTeam } from '@/app/admin/components/PhaseCreator';
import LogoUploader from '@/components/LogoUploader';
import { useOptionalSuperConsole } from '../../SuperConsoleContext';
import { createClient } from '@/lib/supabase/client';
import { updateEntitySafe } from '@/app/admin/entities/actions';
import { invalidateCache } from '@/lib/cache/superAdminCache';
import { getTournamentCountryOptions, type TournamentCountryOption } from '@/lib/data/countries';
import { getAllSports, getSportById } from '@/lib/data/sports';
import {
    DEFAULT_OFFENSIVE_BONUS_THRESHOLD,
    normalizeOffensiveBonusMode,
    type OffensiveBonusMode,
} from '@/lib/bonusRuleMetrics';
import { useSport } from '@/context/SportContext';
import type { Sport } from '@/lib/types';
import { createUnion } from '@/lib/services/unionService';
import { persistTournamentLogo } from '@/lib/utils/persistTournamentLogo';
import { mapExternalSportToInternalSport } from '@/lib/sports';
import {
    AMERICAN_FOOTBALL_DISCIPLINE_LABELS,
    AMERICAN_FOOTBALL_FIRST_DOWN_LABELS,
    AMERICAN_FOOTBALL_OVERTIME_LABELS,
    CUSTOM_AMERICAN_FOOTBALL_PRESET_ID,
    DEFAULT_AMERICAN_FOOTBALL_PRESET_ID,
    createAmericanFootballRuleset,
    describeAmericanFootballRuleset,
    getAmericanFootballPreset,
    getAmericanFootballPresetsByDiscipline,
    getDefaultAmericanFootballPreset,
    normalizeAmericanFootballRuleset,
    type AmericanFootballDiscipline,
    type AmericanFootballOvertimeFormat,
    type AmericanFootballRuleset,
} from '@/lib/americanFootballRules';
import {
    buildTournamentCompetitionConfig,
    getTournamentFormatFromPhaseType,
    getTournamentFormatLabel,
    getTournamentFormatPhaseType,
    normalizeTournamentFormat,
    type CircuitChampionMode,
} from '@/lib/utils/tournamentFormat';
import { AUDIENCE_LABELS, resolveTournamentAudience, syncAgeGradeWithAudience, type TournamentAudience } from '@/lib/utils/tournamentAudience';
import '../../creation-forms.css';

const sportsCatalog = getAllSports();

/**
 * Los deportes en los que se puede CREAR un torneo.
 *
 * No es lo mismo que "los deportes visibles". `activeSports` del contexto es lo
 * que el super admin dejó a la vista en la portada, y ahí entra `motorsport`,
 * que llega por ESPN como lectura: una carrera no es un partido, no tiene
 * catálogo de eventos ni reloj. Un torneo suyo sería una fila que ninguna
 * pantalla sabe dibujar.
 *
 * El discriminador sale del dato, no de una lista a mano: `matchRules` es lo
 * que tienen los cinco deportes con el modelo completo (torneo → fase →
 * partido → eventos) y lo único que le falta a `motorsport`. Si mañana se
 * activa vóley con sus reglas, aparece acá solo.
 */
function isCreatableSport(sport: Sport): boolean {
    return Boolean(sport.matchRules);
}

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
    /* SVG, no emoji: el mismo juego de íconos (lucide) que usa el selector de
       formato del paso 2, así la plantilla y el formato se reconocen entre sí. */
    icon: LucideIcon;
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
        icon: ListOrdered,
        title: 'Liga · todos contra todos',
        description: 'Round-robin. Sumás puntos por victoria, empate y derrota. Ida o ida y vuelta.',
        format: 'league',
        advanced: false,
        popular: true,
    },
    {
        id: 'knockout',
        icon: GitMerge,
        title: 'Eliminación directa',
        description: 'Llaves. Cuartos → semis → final. Sin segunda chance.',
        format: 'knockout',
        advanced: false,
    },
    {
        id: 'groups',
        icon: LayoutGrid,
        title: 'Grupos + Playoff',
        description: 'Fase de grupos seguida de eliminación. Ideal con muchos equipos.',
        format: 'groups',
        advanced: false,
    },
    {
        id: 'circuit',
        icon: Flag,
        title: 'Circuito por eventos',
        description: 'Varias paradas en la temporada con tabla acumulada o final decisiva.',
        format: 'circuit',
        advanced: false,
    },
    {
        id: 'custom',
        icon: Settings2,
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
    'Reserva',
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
        pointsBonusTryMode?: string;
        pointsBonusLoss?: number;
        bonus?: { offensive?: { mode?: string } | null } | null;
        americanFootball?: unknown;
    } | null;
};

type ParticipantRow = {
    id?: string | null;
    club_id: string;
    division_id?: string | null;
    division?: SquadRecord | null;
};

/** Foto de los participantes tal como estaban al abrir la edición. Es contra
 *  esto que se calcula el diferencial al guardar, en vez de borrar y reponer. */
type ExistingParticipant = { id: string; clubId: string; divisionId: string | null };

type EntityFilter = 'all' | 'club' | 'seleccion' | 'franquicia' | 'academia';

const ENTITY_FILTER_LABELS: Record<EntityFilter, string> = {
    all: 'Todos',
    club: 'Clubes',
    seleccion: 'Selecciones',
    franquicia: 'Franquicias',
    academia: 'Academias',
};

function formatSquadLabel(squad: SquadRecord): string {
    const suffix = [squad.sport, squad.gender, squad.category]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' / ');

    const seasonLabel = squad.season ? ` · ${squad.season}` : '';
    return `${squad.name}${suffix ? ` (${suffix})` : ''}${seasonLabel}`;
}

/** Vuelve arriba al cambiar de paso. `smooth` solo si el sistema no pidió
 *  movimiento reducido: el CSS apaga las transiciones, esto apaga el scroll. */
function scrollWizardToTop() {
    if (typeof window === 'undefined') return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
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

function buildPhaseName(phaseType: string): string {
    if (phaseType === 'league') return 'Regular Season';
    if (phaseType === 'playoff') return 'Playoffs';
    return 'Fase de grupos';
}

/**
 * Lo que va a salir con la configuración elegida, en el idioma del deporte.
 *
 * Antes esto existía sólo para la liga: elegir "Eliminación directa" o "Grupos"
 * dejaba el panel vacío, justo en el paso donde hay que entender qué se está
 * armando. Son cuentas de una línea; no había motivo para no mostrarlas.
 */
function describeFormat(format: string, teamCount: number, leagueRounds: number): { title: string; meta: string } {
    const teams = Math.max(2, teamCount);

    if (format === 'knockout') {
        const rondas = Math.ceil(Math.log2(teams));
        const arranque = teams > 16 ? '32avos' : teams > 8 ? 'octavos' : teams > 4 ? 'cuartos' : teams > 2 ? 'semifinales' : 'la final';
        return {
            title: `${teams} equipos · ${rondas} ${rondas === 1 ? 'ronda' : 'rondas'} · ${teams - 1} partidos`,
            meta: `Arranca en ${arranque}. Sin repechaje: el que pierde queda afuera.`,
        };
    }

    if (format === 'groups') {
        const grupos = Math.max(2, Math.round(teams / 4));
        const porGrupo = Math.ceil(teams / grupos);
        const partidosGrupo = grupos * (porGrupo * (porGrupo - 1) / 2);
        return {
            title: `${grupos} grupos de ~${porGrupo} · ${Math.round(partidosGrupo)} partidos de grupo`,
            meta: 'Los grupos y cuántos clasifican se afinan después, en el gestor.',
        };
    }

    if (format === 'circuit') {
        return {
            title: `${teams} equipos · varias paradas`,
            meta: 'Las fechas del circuito se cargan una por una desde el gestor.',
        };
    }

    const fechas = Math.max(0, (teams - 1) * leagueRounds);
    const partidos = Math.max(0, (teams * (teams - 1) / 2) * leagueRounds);
    return {
        title: `${teams} equipos · ${fechas} fechas · ${partidos} partidos`,
        meta: leagueRounds === 2
            ? 'Todos contra todos, ida y vuelta.'
            : 'Todos contra todos, una sola rueda.',
    };
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

/** Arriba de esto, "seleccionar todos los visibles" pide un segundo clic. */
const BULK_SELECT_CONFIRM_AT = 50;

/** Planteles que se piden a la vez. Cada club es un fetch: sin tanda, elegir
 *  200 clubes abre 200 conexiones de una y la pestaña se traba. */
const SQUAD_FETCH_BATCH = 6;

/** Altas/bajas de participantes por tanda al guardar. */
const PARTICIPANT_WRITE_BATCH = 8;

/**
 * Corre `task` sobre `items` de a `size`. Cualquier error corta: al guardar un
 * torneo preferimos frenar y avisar antes que seguir escribiendo sobre un
 * estado que ya sabemos incompleto.
 */
async function runInBatches<T>(items: T[], size: number, task: (item: T) => Promise<void>): Promise<void> {
    for (let index = 0; index < items.length; index += size) {
        await Promise.all(items.slice(index, index + size).map(task));
    }
}

async function fetchAdminClubPage(offset: number): Promise<ClubRecord[]> {
    const response = await fetch(`/api/admin/clubs?limit=${ADMIN_CLUB_PAGE_SIZE}&offset=${offset}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
        const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
        const message = record ? String(record.error || '') : '';
        // El detalle del servidor va a la vista: sin él, el cartel dice que algo
        // falló pero no qué, y hay que ir a mirar la terminal.
        const details = record?.details ? ` (${String(record.details)})` : '';
        throw new Error(`${message || 'No se pudieron cargar los equipos.'}${details}`);
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
async function fetchTournamentAdminClubPage(offset: number): Promise<ClubRecord[]> {
    const response = await fetch(
        `/api/admin/torneo/clubs?limit=${ADMIN_CLUB_PAGE_SIZE}&offset=${offset}&divisions=0`,
        { cache: 'no-store', credentials: 'include' },
    );
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
        const message = payload && typeof payload === 'object' && 'error' in payload
            ? String(payload.error || '')
            : '';
        throw new Error(message || 'No se pudieron cargar los equipos.');
    }
    return Array.isArray(payload?.data) ? payload.data as ClubRecord[] : [];
}

// Mismo motivo que arriba: PostgREST no devuelve más de 1000 filas por
// respuesta, así que un admin sin límite de alcance veía el catálogo cortado.
async function fetchTournamentAdminClubs(): Promise<ClubRecord[]> {
    const allClubs: ClubRecord[] = [];
    for (let offset = 0; ; offset += ADMIN_CLUB_PAGE_SIZE) {
        const page = await fetchTournamentAdminClubPage(offset);
        allClubs.push(...page);
        if (page.length < ADMIN_CLUB_PAGE_SIZE) return allClubs;
    }
}

function createDefaultPhaseConfig(
    phaseType: PhaseConfiguration['phaseType'],
    selectedTeamIds: string[],
    rules: {
        pointsWin: number;
        pointsDraw: number;
        pointsLoss: number;
        pointsBonusTry: number;
        pointsBonusTryMode: OffensiveBonusMode;
        pointsBonusLoss: number;
    },
    // Viene del paso 2. Antes estaba en duro en 1, así que "Ida y vuelta" no
    // llegaba nunca a `settings.legs` y el fixture salía siempre de una rueda.
    leagueRounds = 1,
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
            pointsBonusTryMode: rules.pointsBonusTryMode,
            pointsBonusLoss: String(rules.pointsBonusLoss),
            leagueRounds,
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

function buildQuickPhasePayload(config: PhaseConfiguration, plannedTeamCount?: number) {
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
            // El objetivo del paso 2, aparte de los que se inscribieron de
            // verdad. Son cosas distintas —una liga de 8 puede arrancar con 5
            // anotados— y el gestor necesita saber a cuántos apunta.
            ...(plannedTeamCount ? { plannedTeamCount } : {}),
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
                // Contra qué se mide el bonus ofensivo. El motor lo lee de acá
                // cuando la fase no trae `bonus.offensive` (la forma vieja).
                bonusTryMode: normalizeOffensiveBonusMode(config.config?.pointsBonusTryMode) ?? 'count',
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
    /* Los participantes también son borrador. Antes sólo se guardaba el
       formulario: retomabas en el paso 3 con la selección en cero y sin que
       nada te avisara que se había perdido. */
    selectedClubs?: string[];
    selectedDivisionByClub?: Record<string, string>;
}

/** Pasado este plazo el borrador se descarta solo en vez de seguir ofreciéndose. */
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** "hace 3 horas" en vez de un ISO. Sirve para decidir si el borrador vale. */
function formatDraftAge(savedAt: string): string {
    const saved = Date.parse(savedAt);
    if (!Number.isFinite(saved)) return 'hace un rato';

    const minutes = Math.max(0, Math.round((Date.now() - saved) / 60000));
    if (minutes < 1) return 'recién';
    if (minutes < 60) return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;

    const hours = Math.round(minutes / 60);
    if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;

    const days = Math.round(hours / 24);
    return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

/**
 * Grupo de opciones excluyentes.
 *
 * El anuncio ya estaba bien —`role="radiogroup"` con `role="radio"` y
 * `aria-checked`—, pero faltaba la otra mitad del patrón y eso lo dejaba peor
 * que botones pelados en un punto: el lector anuncia un grupo y le enseña al
 * usuario a moverse con flechas, y las flechas scrolleaban la página. Medido:
 * con el foco en "Solo ida", ArrowDown dejaba la selección igual, el foco igual
 * y bajaba la página 920 px.
 *
 * Va acá y no en cada botón porque los cinco grupos de esta pantalla están
 * escritos de dos formas distintas (uno mapeado, cuatro a mano) y son quince
 * botones: el comportamiento es del grupo, no de cada opción.
 */
/**
 * Reglamento de futbol americano del torneo: disciplina (tackle o flag),
 * preset de partida y todos los campos editables. Tocar un campo deja el
 * reglamento en "Personalizado"; elegir un preset lo pisa entero.
 *
 * Vive en este archivo porque usa `RadioGroup` y las clases del formulario
 * de creacion; los datos y su validacion estan en lib/americanFootballRules.
 */
function AmericanFootballRulesEditor({
    value,
    onChange,
}: {
    value: AmericanFootballRuleset;
    onChange: (next: AmericanFootballRuleset) => void;
}) {
    const flag = value.discipline === 'flag';
    const presets = getAmericanFootballPresetsByDiscipline(value.discipline);
    const isCustom = value.preset === CUSTOM_AMERICAN_FOOTBALL_PRESET_ID;
    const presetDescription = isCustom
        ? 'Reglas editadas a mano para este torneo.'
        : getAmericanFootballPreset(value.preset).description;

    const patch = (changes: Partial<AmericanFootballRuleset>) => (
        onChange({ ...value, ...changes, preset: CUSTOM_AMERICAN_FOOTBALL_PRESET_ID })
    );
    const patchScoring = (changes: Partial<AmericanFootballRuleset['scoring']>) => patch({ scoring: { ...value.scoring, ...changes } });
    const patchKicking = (changes: Partial<AmericanFootballRuleset['kicking']>) => patch({ kicking: { ...value.kicking, ...changes } });
    const patchOvertime = (changes: Partial<AmericanFootballRuleset['overtime']>) => patch({ overtime: { ...value.overtime, ...changes } });
    const patchRoster = (changes: Partial<AmericanFootballRuleset['roster']>) => patch({ roster: { ...value.roster, ...changes } });
    const int = (raw: string, fallback: number) => {
        const parsed = parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : fallback;
    };
    const nullableInt = (raw: string) => (raw.trim() === '' ? null : int(raw, 0));

    const selectDiscipline = (discipline: AmericanFootballDiscipline) => {
        if (discipline === value.discipline) return;
        onChange(createAmericanFootballRuleset(getDefaultAmericanFootballPreset(discipline).id));
    };
    const selectPreset = (presetId: string) => {
        if (presetId === CUSTOM_AMERICAN_FOOTBALL_PRESET_ID) {
            onChange({ ...value, preset: CUSTOM_AMERICAN_FOOTBALL_PRESET_ID });
            return;
        }
        onChange(createAmericanFootballRuleset(presetId));
    };

    const checkbox = (id: string, label: string, checked: boolean, onToggle: (next: boolean) => void) => (
        <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input id={id} type="checkbox" checked={checked} onChange={(e) => onToggle(e.target.checked)} />
            <span>{label}</span>
        </label>
    );

    return (
        <div className="tg-disclosure-body">
            <div className="field-group">
                <label id="tg-amfoot-discipline-label">Disciplina</label>
                <RadioGroup className="sport-pick-grid" labelledBy="tg-amfoot-discipline-label">
                    {(['tackle', 'flag'] as AmericanFootballDiscipline[]).map((discipline) => (
                        <button
                            key={discipline}
                            type="button"
                            role="radio"
                            aria-checked={value.discipline === discipline}
                            className={value.discipline === discipline ? 'selected' : ''}
                            onClick={() => selectDiscipline(discipline)}
                        >
                            <span className="emo">{discipline === 'flag' ? '🚩' : '🏈'}</span>
                            <span>{AMERICAN_FOOTBALL_DISCIPLINE_LABELS[discipline]}</span>
                        </button>
                    ))}
                </RadioGroup>
                <p className="field-help">
                    {flag
                        ? 'Sin contacto ni bloqueo: la jugada termina al sacar la bandera. No hay patadas y el primer down es cruzar la mitad.'
                        : 'Con tackle: cuatro downs para diez yardas, patadas y kickoff. Elegí el reglamento de la competencia y ajustá lo que haga falta.'}
                </p>
            </div>

            <div className="field-group">
                <label htmlFor="tg-amfoot-preset">Reglamento de partida</label>
                <select
                    className="form-input"
                    id="tg-amfoot-preset"
                    value={isCustom ? CUSTOM_AMERICAN_FOOTBALL_PRESET_ID : value.preset}
                    onChange={(e) => selectPreset(e.target.value)}
                >
                    {presets.map((preset) => (
                        <option key={preset.id} value={preset.id}>{preset.label}</option>
                    ))}
                    <option value={CUSTOM_AMERICAN_FOOTBALL_PRESET_ID}>Personalizado</option>
                </select>
                <p className="field-help">{presetDescription}</p>
            </div>

            <div className="grid-2">
                <div className="field-group">
                    <label htmlFor="tg-amfoot-periods">Períodos</label>
                    <select
                        className="form-input"
                        id="tg-amfoot-periods"
                        value={String(value.periods)}
                        onChange={(e) => patch({ periods: e.target.value === '2' ? 2 : 4 })}
                    >
                        <option value="4">4 cuartos</option>
                        <option value="2">2 tiempos</option>
                    </select>
                </div>
                <div className="field-group">
                    <label htmlFor="tg-amfoot-period-minutes">Minutos por período</label>
                    <input
                        className="form-input"
                        type="number"
                        min={1}
                        max={90}
                        id="tg-amfoot-period-minutes"
                        value={value.periodDurationMinutes}
                        onChange={(e) => patch({ periodDurationMinutes: Math.max(1, int(e.target.value, value.periodDurationMinutes)) })}
                    />
                </div>
            </div>

            <div className="grid-2">
                <div className="field-group">
                    <label htmlFor="tg-amfoot-play-clock">Play clock (segundos)</label>
                    <input
                        className="form-input"
                        type="number"
                        min={5}
                        max={120}
                        id="tg-amfoot-play-clock"
                        value={value.playClockSeconds}
                        onChange={(e) => patch({ playClockSeconds: Math.max(5, int(e.target.value, value.playClockSeconds)) })}
                    />
                </div>
                <div className="field-group">
                    <label htmlFor="tg-amfoot-downs">Downs por serie</label>
                    <input
                        className="form-input"
                        type="number"
                        min={1}
                        max={10}
                        id="tg-amfoot-downs"
                        value={value.downs}
                        onChange={(e) => patch({ downs: Math.max(1, int(e.target.value, value.downs)) })}
                    />
                </div>
            </div>

            <div className="grid-2">
                <div className="field-group">
                    <label htmlFor="tg-amfoot-first-down">Primer down</label>
                    <select
                        className="form-input"
                        id="tg-amfoot-first-down"
                        value={value.firstDownRule}
                        onChange={(e) => patch({ firstDownRule: e.target.value === 'midfield' ? 'midfield' : 'yards' })}
                    >
                        {(Object.keys(AMERICAN_FOOTBALL_FIRST_DOWN_LABELS) as Array<keyof typeof AMERICAN_FOOTBALL_FIRST_DOWN_LABELS>).map((rule) => (
                            <option key={rule} value={rule}>{AMERICAN_FOOTBALL_FIRST_DOWN_LABELS[rule]}</option>
                        ))}
                    </select>
                </div>
                <div className="field-group">
                    <label htmlFor="tg-amfoot-first-down-yards">Yardas para el primer down</label>
                    <input
                        className="form-input"
                        type="number"
                        min={0}
                        max={100}
                        id="tg-amfoot-first-down-yards"
                        value={value.firstDownYards}
                        disabled={value.firstDownRule === 'midfield'}
                        onChange={(e) => patch({ firstDownYards: Math.max(0, int(e.target.value, value.firstDownYards)) })}
                    />
                </div>
            </div>

            <div className="grid-2">
                <div className="field-group">
                    <label htmlFor="tg-amfoot-td">Touchdown (puntos)</label>
                    <input className="form-input" type="number" min={0} id="tg-amfoot-td" value={value.scoring.touchdown} onChange={(e) => patchScoring({ touchdown: Math.max(0, int(e.target.value, value.scoring.touchdown)) })} />
                </div>
                <div className="field-group">
                    <label htmlFor="tg-amfoot-safety">Safety (puntos)</label>
                    <input className="form-input" type="number" min={0} id="tg-amfoot-safety" value={value.scoring.safety} onChange={(e) => patchScoring({ safety: Math.max(0, int(e.target.value, value.scoring.safety)) })} />
                </div>
            </div>
            <div className="grid-2">
                <div className="field-group">
                    <label htmlFor="tg-amfoot-try-one">{flag ? 'Try de 1 (desde la 5)' : 'Punto extra'}</label>
                    <input className="form-input" type="number" min={0} id="tg-amfoot-try-one" value={value.scoring.tryOne} onChange={(e) => patchScoring({ tryOne: Math.max(0, int(e.target.value, value.scoring.tryOne)) })} />
                </div>
                <div className="field-group">
                    <label htmlFor="tg-amfoot-try-two">{flag ? 'Try de 2 (desde la 10)' : 'Conversión de 2'}</label>
                    <input className="form-input" type="number" min={0} id="tg-amfoot-try-two" value={value.scoring.tryTwo} onChange={(e) => patchScoring({ tryTwo: Math.max(0, int(e.target.value, value.scoring.tryTwo)) })} />
                </div>
            </div>

            {!flag && (
                <div className="grid-2">
                    <div className="field-group">
                        <label htmlFor="tg-amfoot-fg">Field goal (puntos)</label>
                        <input className="form-input" type="number" min={0} id="tg-amfoot-fg" value={value.scoring.fieldGoal} disabled={!value.kicking.fieldGoal} onChange={(e) => patchScoring({ fieldGoal: Math.max(0, int(e.target.value, value.scoring.fieldGoal)) })} />
                    </div>
                    <div className="field-group">
                        <label>Patadas en juego</label>
                        <div style={{ display: 'grid', gap: '0.35rem' }}>
                            {checkbox('tg-amfoot-kick-fg', 'Field goal', value.kicking.fieldGoal, (next) => patchKicking({ fieldGoal: next }))}
                            {checkbox('tg-amfoot-kick-punt', 'Punt', value.kicking.punt, (next) => patchKicking({ punt: next }))}
                            {checkbox('tg-amfoot-kick-kickoff', 'Kickoff', value.kicking.kickoff, (next) => patchKicking({ kickoff: next }))}
                        </div>
                    </div>
                </div>
            )}

            <div className="field-group">
                {checkbox('tg-amfoot-fumbles', 'El balón suelto sigue en juego (fumble)', value.fumbles, (next) => patch({ fumbles: next }))}
                {flag && <p className="field-help">En la mayoría de los formatos de flag el balón que toca el suelo es balón muerto: sin fumble.</p>}
            </div>

            <div className="grid-2">
                <div className="field-group">
                    <label htmlFor="tg-amfoot-ot-format">Tiempo extra</label>
                    <select
                        className="form-input"
                        id="tg-amfoot-ot-format"
                        value={value.overtime.format}
                        onChange={(e) => patchOvertime({ format: e.target.value as AmericanFootballOvertimeFormat })}
                    >
                        {(Object.keys(AMERICAN_FOOTBALL_OVERTIME_LABELS) as AmericanFootballOvertimeFormat[]).map((format) => (
                            <option key={format} value={format}>{AMERICAN_FOOTBALL_OVERTIME_LABELS[format]}</option>
                        ))}
                    </select>
                </div>
                <div className="field-group">
                    <label htmlFor="tg-amfoot-ot-minutes">Minutos por período extra</label>
                    <input
                        className="form-input"
                        type="number"
                        min={0}
                        max={60}
                        id="tg-amfoot-ot-minutes"
                        value={value.overtime.periodDurationMinutes}
                        disabled={value.overtime.format === 'none'}
                        onChange={(e) => patchOvertime({ periodDurationMinutes: Math.max(0, int(e.target.value, value.overtime.periodDurationMinutes)) })}
                    />
                </div>
            </div>
            <div className="grid-2">
                <div className="field-group">
                    <label htmlFor="tg-amfoot-ot-max">Períodos extra como máximo</label>
                    <input
                        className="form-input"
                        type="number"
                        min={1}
                        max={20}
                        id="tg-amfoot-ot-max"
                        placeholder="Sin tope"
                        value={value.overtime.maxPeriods ?? ''}
                        disabled={value.overtime.format === 'none'}
                        onChange={(e) => patchOvertime({ maxPeriods: nullableInt(e.target.value) })}
                    />
                </div>
                {!flag && (
                    <div className="field-group">
                        <label htmlFor="tg-amfoot-ot-two">Conversión de 2 obligatoria desde el período extra</label>
                        <input
                            className="form-input"
                            type="number"
                            min={1}
                            max={20}
                            id="tg-amfoot-ot-two"
                            placeholder="Nunca"
                            value={value.overtime.twoPointAfterPeriod ?? ''}
                            disabled={value.overtime.format === 'none'}
                            onChange={(e) => patchOvertime({ twoPointAfterPeriod: nullableInt(e.target.value) })}
                        />
                    </div>
                )}
            </div>

            <div className="grid-2">
                <div className="field-group">
                    <label htmlFor="tg-amfoot-timeouts">Tiempos muertos por mitad</label>
                    <input className="form-input" type="number" min={0} max={10} id="tg-amfoot-timeouts" value={value.timeoutsPerHalf} onChange={(e) => patch({ timeoutsPerHalf: Math.max(0, int(e.target.value, value.timeoutsPerHalf)) })} />
                </div>
                <div className="field-group">
                    <label htmlFor="tg-amfoot-roster-size">Plantel por partido</label>
                    <input className="form-input" type="number" min={1} max={120} id="tg-amfoot-roster-size" value={value.roster.size} onChange={(e) => patchRoster({ size: Math.max(1, int(e.target.value, value.roster.size)) })} />
                </div>
            </div>
            <div className="grid-2">
                <div className="field-group">
                    <label htmlFor="tg-amfoot-roster-starters">Titulares en la planilla</label>
                    <input className="form-input" type="number" min={1} max={120} id="tg-amfoot-roster-starters" value={value.roster.starters} onChange={(e) => patchRoster({ starters: Math.max(1, int(e.target.value, value.roster.starters)) })} />
                </div>
                {flag && (
                    <div className="field-group">
                        <label htmlFor="tg-amfoot-no-run">No-run zone (yardas antes del ingoal)</label>
                        <input className="form-input" type="number" min={0} max={50} id="tg-amfoot-no-run" placeholder="No aplica" value={value.noRunZoneYards ?? ''} onChange={(e) => patch({ noRunZoneYards: nullableInt(e.target.value) })} />
                    </div>
                )}
            </div>
            {flag && (
                <div className="grid-2">
                    <div className="field-group">
                        <label htmlFor="tg-amfoot-blitz">Blitz desde (yardas)</label>
                        <input className="form-input" type="number" min={0} max={50} id="tg-amfoot-blitz" placeholder="Sin restricción" value={value.blitzYards ?? ''} onChange={(e) => patch({ blitzYards: nullableInt(e.target.value) })} />
                    </div>
                    <div className="field-group">
                        <label htmlFor="tg-amfoot-qb-seconds">Segundos del QB para lanzar</label>
                        <input className="form-input" type="number" min={1} max={60} id="tg-amfoot-qb-seconds" placeholder="Sin límite" value={value.qbSecondsToThrow ?? ''} onChange={(e) => patch({ qbSecondsToThrow: nullableInt(e.target.value) })} />
                    </div>
                </div>
            )}

            <p className="field-help">
                Estos números viajan con el torneo. El panel de partido arma con ellos el reloj, los períodos,
                los eventos disponibles, la planilla y los tiempos muertos. Downs, play clock, no-run zone y blitz
                quedan guardados para cuando el panel lleve el drive jugada por jugada.
            </p>
        </div>
    );
}

function RadioGroup({
    className,
    labelledBy,
    children,
}: {
    className?: string;
    labelledBy: string;
    children: React.ReactNode;
}) {
    const ref = useRef<HTMLDivElement>(null);

    /* Tabulador rotativo: el grupo es UNA parada de tabulador y adentro se
       mueve con flechas. Se sincroniza desde `aria-checked`, que ya es la
       única verdad sobre qué está elegido — así no hay un segundo estado que
       se pueda desfasar. */
    useEffect(() => {
        const group = ref.current;
        if (!group) return;

        const sync = () => {
            const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
            if (radios.length === 0) return;
            const checked = radios.findIndex((radio) => radio.getAttribute('aria-checked') === 'true');
            const focusable = checked === -1 ? 0 : checked;
            radios.forEach((radio, index) => { radio.tabIndex = index === focusable ? 0 : -1; });
        };

        sync();
        const observer = new MutationObserver(sync);
        observer.observe(group, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-checked'] });
        return () => observer.disconnect();
    }, []);

    const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
        const step: Record<string, number> = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
        const isEdge = event.key === 'Home' || event.key === 'End';
        if (!(event.key in step) && !isEdge) return;

        const radios = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])'),
        );
        if (radios.length === 0) return;

        const active = document.activeElement;
        const current = radios.findIndex((radio) => radio === active || radio.contains(active));
        if (current === -1) return;

        event.preventDefault();
        const next = isEdge
            ? (event.key === 'Home' ? 0 : radios.length - 1)
            : (current + step[event.key] + radios.length) % radios.length;

        radios[next].focus();
        // En un radiogroup mover el foco ES elegir: no hace falta un Enter aparte.
        radios[next].click();
    };

    return (
        <div ref={ref} className={className} role="radiogroup" aria-labelledby={labelledBy} onKeyDown={onKeyDown}>
            {children}
        </div>
    );
}

/** Referencia estable para los clubes sin planteles cargados: un `[]` literal
 *  por fila sería un objeto nuevo en cada render y anularía el `memo`. */
const EMPTY_SQUADS: SquadRecord[] = [];

type ClubCatalogRowProps = {
    club: ClubRecord;
    added: boolean;
    squads: SquadRecord[];
    isLoadingSquads: boolean;
    selectedDivisionId: string;
    onToggle: (clubId: string, isSelected: boolean) => void;
    onDivisionChange: (clubId: string, divisionId: string) => void;
};

/**
 * Una fila del catálogo, memoizada.
 *
 * La lista se dibuja ENTERA, sin tope: con 2.976 clubes, un clic no puede
 * costar reconciliar las 2.976 filas. Con `memo` y callbacks estables, React
 * sólo vuelve a dibujar la fila cuyas props cambiaron.
 *
 * La fila ENTERA es el objetivo tocable: un solo `<button>` con
 * `aria-pressed`, y el selector de plantel queda AFUERA para no anidar un
 * control adentro de otro.
 */
const ClubCatalogRow = memo(function ClubCatalogRow({
    club,
    added,
    squads,
    isLoadingSquads,
    selectedDivisionId,
    onToggle,
    onDivisionChange,
}: ClubCatalogRowProps) {
    const entitySlug = getClubEntityTypeSlug(club.entity_type);

    return (
        <div className={`club-row ${added ? 'added' : ''}`}>
            <button
                type="button"
                className="row-main"
                aria-pressed={added}
                onClick={() => onToggle(club.id, !added)}
            >
                <span className="row-check" aria-hidden="true">
                    {added ? '✓' : ''}
                </span>
                <span className="row-logo">
                    {club.logo_url ? (
                        <img src={club.logo_url} alt="" loading="lazy" decoding="async" />
                    ) : (
                        <span>{getClubShortName(club)}</span>
                    )}
                </span>
                <span className="row-info">
                    <span className="row-name">
                        {club.name}
                        <span className={`entity-pill ${entitySlug}`}>
                            {getClubEntityTypeLabel(club.entity_type)}
                        </span>
                    </span>
                    <span className="row-meta">
                        <Flag size={11} style={{ display: 'inline', marginRight: 4 }} />
                        {[club.city, club.region, club.country].filter(Boolean).join(' · ') || 'Sin ubicación'}
                    </span>
                </span>
                <span className="row-action" aria-hidden="true">
                    {added ? 'Quitar' : 'Añadir'}
                </span>
            </button>

            {added && (
                <div className="squad-picker-row">
                    <label htmlFor={`squad-${club.id}`}>Plantel a inscribir</label>
                    <select
                        id={`squad-${club.id}`}
                        value={selectedDivisionId}
                        onChange={(e) => onDivisionChange(club.id, e.target.value)}
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
    );
});

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

    // La visibilidad real de los deportes la escribe el super admin en la tabla
    // `sports`; el contexto ya la resuelve y cae a `isActive` si Supabase no
    // contesta. `ConditionalLayout` monta el provider en todas las ramas, así
    // que acá siempre está.
    const { activeSports } = useSport();

    /* ============== Estado del wizard ============== */
    const [stage, setStage] = useState<WizardStage>('template');
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateId | null>(null);
    // La plantilla "Personalizado" pide el configurador de fases, pero recien
    // despues de completar lo basico y elegir participantes.
    const [wantsAdvanced, setWantsAdvanced] = useState(false);
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
    const [bulkConfirmPending, setBulkConfirmPending] = useState(false);
    const [existingParticipants, setExistingParticipants] = useState<ExistingParticipant[]>([]);
    // El resultado del guardado va a la PANTALLA, no a un alert(). Un aviso de
    // "la fase quedo pendiente" que hay que despachar con OK antes de que la
    // navegacion te lo lleve puesto no se lee: se cierra.
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveWarnings, setSaveWarnings] = useState<string[] | null>(null);
    const [pendingDraft, setPendingDraft] = useState<DraftPayload | null>(null);
    // Retomar PISA lo que tengas cargado. Si ya hay trabajo en curso pide un
    // segundo clic, igual que la seleccion en bloque del catalogo.
    const [draftConfirmPending, setDraftConfirmPending] = useState(false);
    /* Foto del formulario tal como quedo al entrar al paso 1. El autosave se
       guia por esto y no por `pendingDraft`: la oferta ya vive en memoria, asi
       que escribir en localStorage no la pisa. Lo unico que hay que evitar es
       que el formulario VACIO se guarde encima del borrador que se esta
       ofreciendo, y eso lo dice la foto, no la barra. */
    const pristineSnapshotRef = useRef<string | null>(null);
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
            pointsBonusTryMode: 'count' as OffensiveBonusMode,
            pointsBonusLoss: 1,
        },
        // Solo se guarda cuando el deporte es futbol americano. Arranca en NFL
        // para que el bloque nunca aparezca vacio.
        americanFootball: createAmericanFootballRuleset(DEFAULT_AMERICAN_FOOTBALL_PRESET_ID),
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
    /* "Refrescar" tiene que refrescar en los DOS paneles. En el panel de
       torneos no hay SuperConsole y `refresh` es un no-op: el boton se apretaba
       y no pasaba nada. El tick relanza el fetch del catalogo local. */
    const [unionsRefreshTick, setUnionsRefreshTick] = useState(0);
    const refreshUnions = () => {
        if (isTournamentAdmin) setUnionsRefreshTick((tick) => tick + 1);
        else refresh('unions');
    };

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
    }, [isTournamentAdmin, superConsole?.unions, unionsRefreshTick]);

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
                    americanFootball: normalizeAmericanFootballRuleset(data.ruleset?.americanFootball) ?? prev.americanFootball,
                    rules: {
                        ...prev.rules,
                        pointsWin: data.ruleset?.pointsWin ?? defaults.win ?? prev.rules.pointsWin,
                        pointsDraw: data.ruleset?.pointsDraw ?? defaults.draw ?? prev.rules.pointsDraw,
                        pointsLoss: data.ruleset?.pointsLoss ?? defaults.loss ?? prev.rules.pointsLoss,
                        pointsBonusTry: data.ruleset?.pointsBonusTry ?? prev.rules.pointsBonusTry,
                        pointsBonusTryMode:
                            normalizeOffensiveBonusMode(data.ruleset?.pointsBonusTryMode ?? data.ruleset?.bonus?.offensive?.mode)
                            ?? prev.rules.pointsBonusTryMode,
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
                setExistingParticipants(
                    participants
                        .filter((participant) => participant.id && participant.club_id)
                        .map((participant) => ({
                            id: String(participant.id),
                            clubId: participant.club_id,
                            divisionId: participant.division_id ?? null,
                        })),
                );
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

                // Al editar hay que repoblar el paso 2 con lo guardado. Sin
                // esto la pantalla mostraba siempre "8 equipos · solo ida" —los
                // valores iniciales— sin importar cómo se había creado, y al
                // guardar los pisaba.
                const savedRounds = Number(savedQuickConfig?.config?.leagueRounds ?? firstPhase?.settings?.legs);
                const savedPlanned = Number(firstPhase?.settings?.plannedTeamCount ?? firstPhase?.settings?.teamsCount);
                setFormData((prev) => ({
                    ...prev,
                    leagueRounds: savedRounds === 2 ? 2 : 1,
                    teamCount: Number.isFinite(savedPlanned) && savedPlanned >= 2
                        ? Math.min(64, Math.trunc(savedPlanned))
                        : prev.teamCount,
                }));
            })
            .catch((error) => console.error('Error loading phase config:', error));
    }, [countryOptions, supabase, tournamentId]);

    /* ============== Autosave a localStorage (solo en creación) ============== */
    useEffect(() => {
        if (isEdit || stage === 'template') return;
        if (typeof window === 'undefined') return;

        /* Antes acá había un `if (pendingDraft) return`. Protegía de más: la
           oferta se lee una sola vez al montar y vive en el estado de React, así
           que escribir en localStorage no la borra. Lo que sí hacía era apagar
           el autosave DURANTE TODA la sesión de quien ignoraba la barra —y la
           barra sólo se va si tocás uno de sus dos botones—, así que se podía
           llenar el wizard entero sin que nada se guardara. Medido: nombre,
           formato y un club elegido, y el borrador seguía siendo el viejo.

           Lo único que había que evitar es que el formulario VACÍO se guarde
           encima del borrador ofrecido. Eso se responde comparando contra la
           foto de entrada, no mirando la barra. */
        const snapshot = JSON.stringify({ formData, selectedTemplate, selectedClubs, selectedDivisionByClub });
        if (pristineSnapshotRef.current === null) {
            pristineSnapshotRef.current = snapshot;
            return;
        }
        if (snapshot === pristineSnapshotRef.current) return;

        setAutosaveState('saving');
        const handle = window.setTimeout(() => {
            try {
                const payload: DraftPayload = {
                    formData,
                    selectedTemplate,
                    stage,
                    savedAt: new Date().toISOString(),
                    selectedClubs,
                    selectedDivisionByClub,
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
    }, [formData, selectedTemplate, stage, isEdit, selectedClubs, selectedDivisionByClub]);

    /* ============== Restaurar borrador al cargar (en create) ============== */
    useEffect(() => {
        if (isEdit || tournamentId) return;
        if (typeof window === 'undefined') return;

        try {
            const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
            if (!raw) return;
            const payload = JSON.parse(raw) as DraftPayload;
            if (!payload || !payload.formData) return;

            // Un borrador viejo no sirve de nada y te abría un cartel cada vez
            // que entrabas a la pantalla. Pasado el plazo se descarta solo.
            const savedAt = payload.savedAt ? Date.parse(payload.savedAt) : NaN;
            if (Number.isFinite(savedAt) && Date.now() - savedAt > DRAFT_MAX_AGE_MS) {
                window.localStorage.removeItem(DRAFT_STORAGE_KEY);
                return;
            }

            // Se ofrece, no se impone: nada se restaura hasta que toques
            // "Retomar" en la barra. Antes era un `confirm()` nativo que
            // aparecía antes de que la pantalla terminara de dibujarse.
            setPendingDraft(payload);
        } catch (error) {
            console.warn('No se pudo restaurar borrador local:', error);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* Trabajo en curso = el formulario dejó de ser el que había al entrar.
       Se mide contra la misma foto que usa el autosave, así no hay dos
       verdades sobre "ya empezaste". */
    const hasWorkInProgress = useMemo(() => {
        if (pristineSnapshotRef.current === null) return false;
        return JSON.stringify({ formData, selectedTemplate, selectedClubs, selectedDivisionByClub })
            !== pristineSnapshotRef.current;
    }, [formData, selectedTemplate, selectedClubs, selectedDivisionByClub]);

    const acceptPendingDraft = () => {
        if (!pendingDraft) return;
        // Retomar reemplaza nombre, formato, plantilla y participantes. Si ya
        // cargaste algo, eso es una pérdida: se pide un segundo clic.
        if (hasWorkInProgress && !draftConfirmPending) {
            setDraftConfirmPending(true);
            return;
        }
        setDraftConfirmPending(false);
        setFormData((prev) => ({ ...prev, ...(pendingDraft.formData as object) }));
        setSelectedTemplate(pendingDraft.selectedTemplate);
        if (Array.isArray(pendingDraft.selectedClubs)) setSelectedClubs(pendingDraft.selectedClubs);
        if (pendingDraft.selectedDivisionByClub) setSelectedDivisionByClub(pendingDraft.selectedDivisionByClub);
        setStage(pendingDraft.stage || 'basics');
        setPendingDraft(null);
    };

    const discardPendingDraft = () => {
        setPendingDraft(null);
        setDraftConfirmPending(false);
        /* Sólo se borra el guardado si no empezaste nada. Si ya cargaste algo,
           el autosave viene escribiendo TU trabajo en esa misma clave desde el
           primer cambio: borrarla acá te lo llevaría puesto. */
        if (hasWorkInProgress) return;
        try { window.localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* sin localStorage */ }
    };

    /* ============== Helpers de cambio ============== */
    /* Estables (`useCallback` sin dependencias: sólo usan setters): son las
       props que reciben las 2.976 filas memoizadas del catálogo. */
    const setClubSelection = useCallback((clubId: string, isSelected: boolean) => {
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
    }, []);

    const handleDivisionChange = useCallback((clubId: string, divisionId: string) => {
        setSelectedDivisionByClub((prev) => ({ ...prev, [clubId]: divisionId }));
    }, []);

    const handleAmericanFootballChange = useCallback((next: AmericanFootballRuleset) => {
        setFormData((prev) => ({ ...prev, americanFootball: next }));
    }, []);

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
            const baseConfig = current || createDefaultPhaseConfig(nextPhaseType, selectedClubs, formData.rules, formData.leagueRounds);
            return { ...baseConfig, phaseType: nextPhaseType };
        });
    };

    /*
     * La modalidad escribe en los DOS lados. `formData.leagueRounds` es lo que
     * dibuja la vista previa; `phaseConfig.config.leagueRounds` es lo que
     * `buildQuickPhasePayload` convierte en `settings.legs`, que es el único
     * valor que llega a la base. Antes sólo se tocaba el primero: la pantalla
     * decía "14 fechas" y la fase se guardaba con una sola rueda.
     */
    const handleLeagueRoundsChange = (leagueRounds: number) => {
        setFormData((prev) => ({ ...prev, leagueRounds }));
        setPhaseConfig((current) => {
            const base = current || createDefaultPhaseConfig(
                mapFormatToPhaseType(formData.format), selectedClubs, formData.rules, leagueRounds,
            );
            return { ...base, config: { ...base.config, leagueRounds } };
        });
    };

    /* ============== Mantener phaseConfig sincronizado con equipos seleccionados ============== */
    useEffect(() => {
        setPhaseConfig((current) => {
            if (!current || sameIdList(current.selectedTeamIds, selectedClubs)) return current;
            return { ...current, selectedTeamIds: selectedClubs };
        });
    }, [selectedClubs]);

    /* ============== Cargar planteles por club seleccionado ==============
     *
     * El guard de desmontaje va en un ref, NO en un `let` por corrida.
     *
     * Con `let isCancelled` adentro del efecto pasaba esto: el efecto escribe
     * `loadingSquadsByClub`, que es una de sus propias dependencias; React
     * corre el cleanup de la corrida anterior antes de la siguiente, así que
     * `isCancelled` quedaba en `true` para la corrida que había disparado los
     * fetch. Cuando el pedido volvía, el `.then` y el `.finally` se salían
     * temprano: el plantel NUNCA se guardaba y el `loading` del club quedaba
     * prendido para siempre.
     *
     * Se verificó en React 19: `dataByKey = {}` y `loadingByKey = {a:true,
     * b:true}` después de que los dos fetch resolvieran. En pantalla eso era el
     * selector de plantel clavado en "Cargando planteles..." y deshabilitado, y
     * todos los participantes guardados con `division_id: null`.
     */
    const squadsUnmountedRef = useRef(false);
    useEffect(() => {
        // Se REINICIA al montar, no sólo se marca al desmontar. En dev,
        // StrictMode monta, desmonta y vuelve a montar: sin esta línea el
        // cleanup del primer montaje deja el ref en `true` para siempre y el
        // arreglo reproduce el bug que venía a resolver — pedidos que vuelven
        // 200 y resultados que se descartan igual.
        squadsUnmountedRef.current = false;
        return () => { squadsUnmountedRef.current = true; };
    }, []);

    useEffect(() => {
        const missingClubIds = selectedClubs.filter(
            (clubId) => !(clubId in clubSquadsByClub) && !loadingSquadsByClub[clubId]
        );

        if (missingClubIds.length === 0) return;

        if (isTournamentAdmin) {
            // El alta por panel de torneos inscribe por club (sin división):
            // evitamos el endpoint super y los marcamos "sin planteles". Va en
            // UNA escritura, no una por club: con 200 seleccionados eran 200
            // renders encadenados.
            setClubSquadsByClub((prev) => {
                const next = { ...prev };
                missingClubIds.forEach((clubId) => { next[clubId] = []; });
                return next;
            });
            return;
        }

        // Puerta de concurrencia. El efecto vuelve a correr cada vez que un
        // pedido termina (`loadingSquadsByClub` cambia), así que alcanza con
        // arrancar los que entren en los lugares libres: la cola se drena sola.
        // Sin esto, seleccionar 200 clubes abría 200 conexiones de una.
        const inFlight = Object.values(loadingSquadsByClub).filter(Boolean).length;
        const freeSlots = Math.max(0, SQUAD_FETCH_BATCH - inFlight);
        if (freeSlots === 0) return;

        missingClubIds.slice(0, freeSlots).forEach((clubId) => {
            setLoadingSquadsByClub((prev) => ({ ...prev, [clubId]: true }));

            fetch(`/api/admin/clubs/${clubId}/squads`, { cache: 'no-store' })
                .then(async (response) => {
                    const payload = await response.json().catch(() => []);
                    if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar los planteles del club');
                    return Array.isArray(payload) ? payload as SquadRecord[] : [];
                })
                .then((squads) => {
                    if (squadsUnmountedRef.current) return;
                    setClubSquadsByClub((prev) => ({ ...prev, [clubId]: squads }));
                })
                .catch((error) => {
                    if (squadsUnmountedRef.current) return;
                    console.error(`Error loading squads for club ${clubId}:`, error);
                    setClubSquadsByClub((prev) => ({ ...prev, [clubId]: [] }));
                })
                .finally(() => {
                    if (squadsUnmountedRef.current) return;
                    setLoadingSquadsByClub((prev) => ({ ...prev, [clubId]: false }));
                });
        });
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
    const effectivePhaseConfig = phaseConfig || createDefaultPhaseConfig(resolvedPhaseType, selectedClubs, formData.rules, formData.leagueRounds);
    const phaseConfigToPersist: PhaseConfiguration = { ...effectivePhaseConfig, selectedTeamIds: selectedClubs };

    const formatPreview = useMemo(
        () => describeFormat(formData.format, formData.teamCount, formData.leagueRounds),
        [formData.format, formData.teamCount, formData.leagueRounds],
    );

    const selectedSport = sportsCatalog.find((sport) => sport.id === formData.sport);

    /*
     * Lo que se pinta en el selector. Dos reglas:
     *
     * 1. Sólo deportes en los que se puede crear (`isCreatableSport`). Antes se
     *    listaba `getAllSports()` entero: 35 botones, 29 de ellos deportes que
     *    la app todavía no dibuja. Un torneo de Kabaddi se guardaba igual.
     * 2. Si estás EDITANDO un torneo cuyo deporte ya no es creable —o nunca lo
     *    fue— ese deporte se agrega igual, marcado. Sacarlo dejaría la grilla
     *    sin ninguna opción seleccionada y el editor no sabría en qué deporte
     *    está parado; peor, el primer clic se lo cambiaría sin querer.
     */
    const availableSports = useMemo(() => {
        const creatable = activeSports.filter(isCreatableSport);
        if (creatable.some((sport) => sport.id === formData.sport)) return creatable;

        const current = selectedSport ?? getSportById(formData.sport as Sport['id']);
        return current ? [...creatable, current] : creatable;
    }, [activeSports, formData.sport, selectedSport]);

    const currentSportIsLegacy = Boolean(
        formData.sport && !activeSports.some((sport) => sport.id === formData.sport && isCreatableSport(sport)),
    );
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
            refreshUnions();
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
            const baseConfig = current || createDefaultPhaseConfig(nextPhaseType, selectedClubs, formData.rules, formData.leagueRounds);
            return { ...baseConfig, phaseType: nextPhaseType };
        });

        // Incluso la plantilla avanzada arranca por "Lo basico": el nombre es
        // obligatorio y saltearlo dejaba al usuario en el configurador de fases
        // con el torneo sin nombre y sin participantes, para terminar en un
        // error de validacion al confirmar. `wantsAdvanced` se recuerda y el
        // wizard abre el modo avanzado cuando ya hay con que trabajar.
        setWantsAdvanced(Boolean(template.advanced));
        setStage('basics');
    };

    /* ============== Validación inline del nombre ============== */
    const trimmedName = formData.name.trim();
    const nameStatus: 'idle' | 'too-short' | 'ok' = useMemo(() => {
        if (!trimmedName) return 'idle';
        if (trimmedName.length < 3) return 'too-short';
        return 'ok';
    }, [trimmedName]);


    /* ============== Filtro de catálogo de clubes ==============
     *
     * El texto donde se busca se arma UNA vez por club, cuando llega el
     * catálogo. Antes cada tecla reconstruía ocho strings por club y los
     * pasaba a minúsculas: 2.976 x 8 = casi 24.000 operaciones por pulsación,
     * y todas daban el mismo resultado que la tecla anterior.
     */
    const clubHaystacks = useMemo(() => {
        const map = new Map<string, string>();
        clubs.forEach((club) => {
            map.set(club.id, [
                club.name, club.short_name, club.shortName, club.slug,
                club.city, club.region, club.country,
                getClubEntityTypeLabel(club.entity_type),
            ].filter(Boolean).join(' ').toLowerCase());
        });
        return map;
    }, [clubs]);

    /* ============== Filtro de catálogo de clubes ============== */
    /*
     * El input escribe `searchTerm`; la LISTA se filtra con el valor diferido.
     * React deja que la tecla se pinte primero y recalcula la lista después, sin
     * un debounce a mano que haya que ajustar. `searchIsStale` es el momento en
     * que lo que ves todavía no corresponde a lo que escribiste: se dice, no se
     * disimula.
     */
    const deferredSearchTerm = useDeferredValue(searchTerm);
    const normalizedClubSearch = deferredSearchTerm.trim().toLowerCase();
    const searchIsStale = searchTerm !== deferredSearchTerm;
    const filteredClubs = useMemo(() => {
        return clubs.filter((club) => {
            if (entityFilter !== 'all' && getClubEntityTypeSlug(club.entity_type) !== entityFilter) return false;
            if (!normalizedClubSearch) return true;
            return (clubHaystacks.get(club.id) || '').includes(normalizedClubSearch);
        });
    }, [clubHaystacks, clubs, entityFilter, normalizedClubSearch]);

    /* Los contadores cuentan lo que la BUSQUEDA deja pasar, no el catalogo
       entero: el chip decia "Clubes 2003" mientras la lista mostraba cuatro. El
       filtro de tipo NO se aplica aca a proposito — si no, el chip activo seria
       el unico con numero y el resto quedaria en cero. */
    const entityCounts = useMemo(() => {
        const searched = normalizedClubSearch
            ? clubs.filter((club) => (clubHaystacks.get(club.id) || '').includes(normalizedClubSearch))
            : clubs;

        const counts: Record<EntityFilter, number> = { all: searched.length, club: 0, seleccion: 0, franquicia: 0, academia: 0 };
        searched.forEach((club) => {
            counts[getClubEntityTypeSlug(club.entity_type)]++;
        });
        return counts;
    }, [clubHaystacks, clubs, normalizedClubSearch]);

    /* ============== Selección en bloque ==============
     *
     * Opera sobre lo FILTRADO, no sobre el catálogo entero. Antes hacía
     * `clubs.map(...)`: filtrabas por "Selecciones" —el chip decía 64— tocabas
     * el botón y te llevabas los 2.976. Y no era sólo una selección grande: el
     * efecto de planteles dispara un fetch por club y el alta un POST por
     * participante, así que un clic se convertía en miles de requests.
     *
     * Arriba del tope pide un segundo clic. No es un `confirm()` nativo: el
     * botón cambia de texto y dice cuántos va a agregar.
     */
    /* La lista se dibuja ENTERA. Antes había un tope de 120 filas porque cada
       tecla reconciliaba las 2.976; ahora la fila es un componente memoizado y
       React sólo vuelve a dibujar la que cambió. `content-visibility: auto` en
       el CSS hace que el navegador tampoco pinte las que están fuera de vista. */
    const selectedClubSet = useMemo(() => new Set(selectedClubs), [selectedClubs]);

    /* Los elegidos, resueltos a su ficha. El orden es el de selección, no el
       del catálogo: es el orden en que el usuario los pensó. */
    const selectedClubRecords = useMemo(() => {
        const byId = new Map(clubs.map((club) => [club.id, club]));
        return selectedClubs
            .map((id) => byId.get(id))
            .filter((club): club is ClubRecord => Boolean(club));
    }, [clubs, selectedClubs]);

    const filteredClubIds = useMemo(() => filteredClubs.map((club) => club.id), [filteredClubs]);
    const selectedFilteredCount = useMemo(() => {
        const selected = new Set(selectedClubs);
        return filteredClubIds.reduce((total, id) => (selected.has(id) ? total + 1 : total), 0);
    }, [filteredClubIds, selectedClubs]);

    const allFilteredSelected = filteredClubIds.length > 0 && selectedFilteredCount === filteredClubIds.length;
    const bulkNeedsConfirm = !allFilteredSelected && filteredClubIds.length > BULK_SELECT_CONFIRM_AT;

    // El pedido de confirmación se cae solo si cambiás el filtro o la búsqueda:
    // el "¿Añadir 2.976?" de hace dos filtros ya no es sobre lo que estás viendo.
    useEffect(() => { setBulkConfirmPending(false); }, [entityFilter, normalizedClubSearch]);

    const toggleAllFilteredClubs = () => {
        if (allFilteredSelected) {
            const toRemove = new Set(filteredClubIds);
            setSelectedClubs((prev) => prev.filter((id) => !toRemove.has(id)));
            setSelectedDivisionByClub((prev) => {
                const next = { ...prev };
                toRemove.forEach((id) => delete next[id]);
                return next;
            });
            setBulkConfirmPending(false);
            return;
        }

        if (bulkNeedsConfirm && !bulkConfirmPending) {
            setBulkConfirmPending(true);
            return;
        }

        setSelectedClubs((prev) => Array.from(new Set([...prev, ...filteredClubIds])));
        setBulkConfirmPending(false);
    };

    /* ============== Navegación entre stages ============== */
    const canAdvanceFromBasics = nameStatus === 'ok' && Boolean(formData.sport);
    const canAdvanceFromStructure = formData.teamCount >= 2;

    /* El botón deshabilitado siempre dice qué falta para habilitarse. Es la
       convención de la casa —el ejemplo que cita la guía es `CreatePlayer.tsx`,
       con «Elegí una nacionalidad y una posición para empezar.»— y acá no se
       cumplía: el "Siguiente" quedaba en `opacity: .3` sin `title`, sin
       `aria-describedby` y sin nada al lado. En el paso 0 se agrava porque la
       tarjeta recomendada ya viene con borde e ícono verdes: parece elegida sin
       estarlo, así que el botón apagado no tenía ninguna explicación visible. */
    const advanceBlockedReason: string | null = useMemo(() => {
        if (saving) return null;
        if (stage === 'template') {
            return selectedTemplate ? null : 'Elegí un tipo de torneo para seguir.';
        }
        if (stage === 'basics') {
            if (nameStatus === 'idle') return 'Ponele un nombre al torneo para seguir.';
            if (nameStatus === 'too-short') return 'El nombre necesita al menos 3 caracteres.';
            if (!formData.sport) return 'Elegí un deporte para seguir.';
        }
        if (stage === 'structure' && !canAdvanceFromStructure) {
            return 'Un torneo necesita al menos 2 equipos.';
        }
        return null;
    }, [stage, saving, selectedTemplate, nameStatus, formData.sport, canAdvanceFromStructure]);

    const goNext = async () => {
        if (stage === 'basics') {
            if (!canAdvanceFromBasics) return;
            setStage('structure');
            scrollWizardToTop();
            return;
        }
        if (stage === 'structure') {
            if (!canAdvanceFromStructure) return;
            setStage('participants');
            scrollWizardToTop();
            return;
        }
        if (stage === 'participants') {
            if (wantsAdvanced) {
                setWantsAdvanced(false);
                setStage('advanced');
                scrollWizardToTop();
                return;
            }
            await handleFinalize();
            return;
        }
        if (stage === 'advanced') {
            await handleFinalize();
        }
    };

    const goPrev = () => {
        if (stage === 'basics') setStage('template');
        else if (stage === 'structure') setStage('basics');
        else if (stage === 'participants') setStage('structure');
        else if (stage === 'advanced') setStage('participants');
        scrollWizardToTop();
    };

    /* ============== Persistir la fase (idéntico al wizard original) ============== */
    const saveQuickPhase = async (savedId: string, config: PhaseConfiguration, plannedTeamCount?: number) => {
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
                body: JSON.stringify(buildQuickPhasePayload(config, plannedTeamCount)),
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
        setSaveError(null);
        try {
            const ruleset = {
                pointsWin: formData.rules.pointsWin,
                pointsDraw: formData.rules.pointsDraw,
                pointsLoss: formData.rules.pointsLoss,
                ...(formData.sport === 'rugby' ? {
                    pointsBonusTry: formData.rules.pointsBonusTry,
                    pointsBonusTryMode: formData.rules.pointsBonusTryMode,
                    pointsBonusLoss: formData.rules.pointsBonusLoss,
                } : {}),
                // El reglamento (tackle/flag, cuartos, patadas, plantel) viaja
                // con el torneo y lo lee el match center. En otro deporte no
                // se escribe: un torneo de rugby no lleva reglas de downs.
                ...(formData.sport === 'american-football' ? {
                    americanFootball: formData.americanFootball,
                } : {}),
            };

            // Lo escriben los dos caminos (crear y editar), asi que vive
            // arriba de la bifurcacion.
            let logoWarning: string | null = null;

            // La validacion de planteles corre ANTES de escribir nada. Antes
            // vivia despues del alta del torneo: el error llegaba con la fila
            // ya creada y el usuario reintentaba contra un torneo duplicado.
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

            if (!isEdit) {
                /*
                 * ALTA UNIFICADA. Una sola llamada server-side crea todo lo que
                 * un torneo necesita para FUNCIONAR: la fila de `tournaments`
                 * (con membership del creador), la temporada, los participantes
                 * en sus TRES tablas (participante + entrada de temporada +
                 * roster de fase) y las fases con grupos, cuadro playoff y
                 * tabla de posiciones sembrada.
                 *
                 * Antes el camino super hacia esto a mano desde el navegador:
                 * `createEntitySafe` + un POST por participante + la fase al
                 * final. Ese camino no creaba temporada ni roster de fase, asi
                 * que el torneo se veia bien en el gestor y la tabla publica
                 * quedaba vacia para siempre (el sintoma exacto de Damas B).
                 */
                const participantDivisions = participantClubIds.reduce<Record<string, string>>((accumulator, clubId) => {
                    const divisionId = selectedDivisionByClub[clubId];
                    if (divisionId) accumulator[clubId] = divisionId;
                    return accumulator;
                }, {});

                // Lo que el creador rapido/avanzado configuro y el endpoint no
                // deriva solo: se funde en los settings de la primera fase para
                // que editar el torneo restaure esta misma pantalla.
                const quickSettings = buildQuickPhasePayload(phaseConfigToPersist, formData.teamCount).settings;
                const phaseSettingsExtra = {
                    quickCreator: quickSettings.quickCreator,
                    plannedTeamCount: formData.teamCount,
                    tiebreakers: quickSettings.tiebreakers,
                    tableTags: quickSettings.tableTags,
                    groupAssignments: quickSettings.groupAssignments,
                    fixturePreview: quickSettings.fixturePreview,
                    playoffThirdPlace: quickSettings.playoffThirdPlace,
                };

                // `LogoUploader` devuelve un data URI y este POST lo mandaba
                // crudo a `tournaments.logo_url`. Aca todavia no hay id, asi
                // que el torneo nace sin logo y se completa apenas se conoce.
                const inlineLogo = Boolean(formData.logoUrl && formData.logoUrl.startsWith('data:'));
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
                        logo_url: inlineLogo ? null : (formData.logoUrl || null),
                        status: formData.visibility === 'public' ? 'published' : 'draft',
                        is_visible: formData.visibility === 'public',
                        ruleset: {
                            ...ruleset,
                            // Sin esto un torneo de circuito se guardaba sin
                            // `competition.format_type`, y `isCircuitRuleset()`
                            // no lo reconocia como circuito.
                            competition: buildTournamentCompetitionConfig(formData.format, {
                                champion_mode: formData.circuitChampionMode,
                            }),
                        },
                        team_count: formData.teamCount || participantClubIds.length || 2,
                        league_rounds: formData.leagueRounds || 1,
                        group_count: Number(effectivePhaseConfig.config?.groupsCount) || undefined,
                        qualifiers_per_group: Number(effectivePhaseConfig.config?.qualifiersPerGroup) || undefined,
                        participant_club_ids: participantClubIds,
                        participant_divisions: participantDivisions,
                        phase_settings_extra: phaseSettingsExtra,
                        create_phase: true,
                        create_season: true,
                    }),
                });
                const result = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(result?.error || 'No se pudo crear el torneo.');
                }

                // El alta scoped contesta `{ data: {...}, warnings }`.
                const createdId = typeof result?.data?.id === 'string' ? result.data.id : null;

                if (inlineLogo && createdId) {
                    try {
                        const uploadedUrl = await persistTournamentLogo(createdId, formData.logoUrl);
                        if (uploadedUrl && !uploadedUrl.startsWith('data:')) {
                            const patch = await fetch(`/api/admin/torneo/tournaments/${createdId}`, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ logo_url: uploadedUrl }),
                            });
                            if (!patch.ok) logoWarning = 'El torneo se creo pero el logo quedo sin guardar. Cargalo desde el gestor.';
                        } else {
                            logoWarning = 'El logo no se pudo subir a Storage. El torneo quedo sin logo: volve a cargarlo desde el gestor.';
                        }
                    } catch (error) {
                        logoWarning = error instanceof Error ? error.message : String(error);
                    }
                }

                if (typeof window !== 'undefined') {
                    try { window.localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* noop */ }
                }

                // El cache del SuperConsole es client-side: sin esto el torneo
                // recien creado no aparece en el listado al volver. En el panel
                // de torneos `refresh` es un no-op y no molesta.
                invalidateCache('tournaments_list');
                refresh('tournaments');

                // The API creates the tournament even when sub-steps (season,
                // participants, phases, membership) only partially succeed. Don't
                // swallow those warnings — the user must know the tournament may
                // need manual completion in the gestor.
                const warnings: string[] = Array.isArray(result?.warnings)
                    ? result.warnings.filter((w: unknown): w is string => typeof w === 'string' && w.trim().length > 0)
                    : [];
                const allWarnings = logoWarning ? [...warnings, logoWarning] : warnings;
                if (allWarnings.length > 0) {
                    setSaveWarnings(allWarnings);
                    return;
                }

                router.push(tournamentsHomeHref);
                return;
            }

            /*
             * EDICIÓN. El diferencial de participantes y el PATCH de la fase
             * siguen del lado del cliente: acá el torneo ya existe y solo se
             * toca lo que cambió.
             */
            if (!tournamentId) {
                throw new Error('No se encontró el torneo a editar. Volvé al listado e intentá de nuevo.');
            }

            /*
             * El logo se manda a Storage ANTES de escribir la fila.
             *
             * `LogoUploader` no sube nada: convierte el archivo a un data URI y
             * lo devuelve por `onUpload`. Ese string entraba crudo en
             * `tournaments.logo_url`; de ahí salió el
             * `TOURNAMENT_LOGOS_BASE64_BACKUP.jsonl` de 7,8 MB que hubo que
             * limpiar a mano.
             */
            let persistedLogoUrl: string | null = formData.logoUrl || null;
            const logoIsInline = Boolean(formData.logoUrl && formData.logoUrl.startsWith('data:'));

            if (logoIsInline) {
                try {
                    persistedLogoUrl = await persistTournamentLogo(tournamentId, formData.logoUrl);
                } catch (error) {
                    logoWarning = error instanceof Error ? error.message : String(error);
                    persistedLogoUrl = formData.logoUrl;
                }
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
                logo_url: persistedLogoUrl,
                status: formData.visibility === 'public' ? 'published' : 'draft',
                is_visible: formData.visibility === 'public',
                ruleset: {
                    ...ruleset,
                    competition: buildTournamentCompetitionConfig(formData.format, {
                        champion_mode: formData.circuitChampionMode,
                    }),
                },
            };

            const updateResult = await updateEntitySafe('tournament', tournamentId, payload);
            if (updateResult.success === false) throw new Error(updateResult.error);
            const savedId = tournamentId;

            /*
             * Participantes: DIFERENCIAL, no borrar y reponer.
             *
             * Antes la edición hacía `delete().eq('tournament_id', …)` desde el
             * cliente y recién después el alta de todos. Si cualquiera de esas
             * altas fallaba —una conexión cortada, un rechazo de RLS— el torneo
             * se quedaba con menos participantes de los que tenía y sin forma de
             * volver atrás. Ahora sólo se toca lo que efectivamente cambió: dar
             * de baja los que salieron, alta a los que entraron, y actualizar el
             * plantel de los que siguen pero cambiaron de división.
             *
             * Y va en tandas. `Promise.all` sobre la lista entera abría un POST
             * por participante de una sola vez: con una selección grande eran
             * miles de conexiones simultáneas desde una pestaña.
             */
            const byClub = new Map(existingParticipants.map((participant) => [participant.clubId, participant]));
            const selectedSet = new Set(participantClubIds);

            const toRemove = existingParticipants.filter((participant) => !selectedSet.has(participant.clubId));
            const toAdd = participantClubIds.filter((clubId) => !byClub.has(clubId));
            const toUpdate = participantClubIds
                .map((clubId) => ({ existing: byClub.get(clubId), clubId }))
                .filter((entry): entry is { existing: ExistingParticipant; clubId: string } => Boolean(entry.existing))
                .filter(({ existing, clubId }) => (selectedDivisionByClub[clubId] || null) !== existing.divisionId);

            await runInBatches(toRemove, PARTICIPANT_WRITE_BATCH, async (participant) => {
                const response = await fetch(
                    `/api/tournaments/${savedId}/participants?id=${encodeURIComponent(participant.id)}`,
                    { method: 'DELETE' },
                );
                if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    throw new Error(body?.error || 'No se pudo quitar un participante del torneo.');
                }
            });

            await runInBatches(toUpdate, PARTICIPANT_WRITE_BATCH, async ({ existing, clubId }) => {
                const response = await fetch(
                    `/api/tournaments/${savedId}/participants?id=${encodeURIComponent(existing.id)}`,
                    {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ division_id: selectedDivisionByClub[clubId] || null }),
                    },
                );
                if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    throw new Error(body?.error || 'No se pudo actualizar el plantel de un participante.');
                }
            });

            await runInBatches(toAdd, PARTICIPANT_WRITE_BATCH, async (clubId) => {
                const response = await fetch(`/api/tournaments/${savedId}/participants`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        club_id: clubId,
                        division_id: selectedDivisionByClub[clubId] || null,
                        type: 'club',
                        status: 'active',
                    }),
                });

                const body = await response.json().catch(() => null);
                if (!response.ok) {
                    throw new Error(body?.error || 'No se pudo agregar un participante al torneo.');
                }
            });

            // La fase inicial es opcional: el torneo ya está creado. Sin
            // participantes (o con formato playoff que exige >=2 equipos) la
            // fase no se puede generar todavía. No bloqueamos la creación:
            // avisamos y se completa luego en el gestor, igual que hace el
            // camino del panel de gestor con sus warnings.
            let phaseWarning: string | null = null;
            try {
                await saveQuickPhase(savedId, phaseConfigToPersist, formData.teamCount);
            } catch (phaseError: unknown) {
                phaseWarning = phaseError instanceof Error ? phaseError.message : String(phaseError);
                console.warn('[torneos/crear] fase inicial pendiente:', phaseWarning);
            }

            // Limpiar borrador
            if (typeof window !== 'undefined') {
                try { window.localStorage.removeItem(DRAFT_STORAGE_KEY); } catch { /* noop */ }
            }

            // Forzar re-fetch del listado para que el torneo recién guardado aparezca.
            // El SuperConsole cache es client-side, revalidatePath del server action no lo limpia.
            invalidateCache('tournaments_list');
            refresh('tournaments');

            const pendingWarnings = [
                phaseWarning
                    ? `La fase inicial quedo pendiente: ${phaseWarning}. Agrega participantes y configurala desde el gestor.`
                    : null,
                logoWarning,
            ].filter((warning): warning is string => Boolean(warning));

            if (pendingWarnings.length > 0) {
                setSaveWarnings(pendingWarnings);
                return;
            }

            router.push(tournamentsHomeHref);
        } catch (err: unknown) {
            setSaveError(err instanceof Error ? err.message : String(err));
            scrollWizardToTop();
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

                {/* ============ Borrador sin terminar (reemplaza al confirm nativo) ============ */}
                {pendingDraft && (
                    <div className="notice notice-draft" role="status">
                        <div className="notice-body">
                            <strong>Tenés un borrador sin terminar</strong>
                            <p>
                                {pendingDraft.formData && typeof pendingDraft.formData === 'object' && 'name' in pendingDraft.formData && (pendingDraft.formData as { name?: string }).name
                                    ? `«${(pendingDraft.formData as { name?: string }).name}» · `
                                    : ''}
                                guardado {formatDraftAge(pendingDraft.savedAt)}
                                {Array.isArray(pendingDraft.selectedClubs) && pendingDraft.selectedClubs.length > 0
                                    ? ` · ${pendingDraft.selectedClubs.length} equipos elegidos`
                                    : ''}
                            </p>
                            {hasWorkInProgress && (
                                <p className="notice-sub">
                                    {draftConfirmPending
                                        ? 'Retomar reemplaza el nombre, el formato y los participantes que cargaste recién.'
                                        : 'Lo que cargaste recién ya se está guardando: podés ignorar este aviso.'}
                                </p>
                            )}
                        </div>
                        <div className="notice-actions">
                            <button
                                type="button"
                                className="btn btn-outline btn-inline"
                                onClick={draftConfirmPending ? () => setDraftConfirmPending(false) : discardPendingDraft}
                            >
                                {draftConfirmPending ? 'Mejor no' : 'Descartar'}
                            </button>
                            <button
                                type="button"
                                className={`btn btn-inline ${draftConfirmPending ? 'btn-danger' : 'btn-primary'}`}
                                onClick={acceptPendingDraft}
                            >
                                {draftConfirmPending ? 'Confirmar: reemplazar lo cargado' : 'Retomar'}
                            </button>
                        </div>
                    </div>
                )}

                {/* ============ Error de guardado (reemplaza al alert nativo) ============ */}
                {saveError && (
                    <div className="notice notice-error" role="alert">
                        <div className="notice-body">
                            <strong>No se pudo guardar el torneo</strong>
                            <p>{saveError}</p>
                        </div>
                        <div className="notice-actions">
                            <button type="button" className="btn btn-outline btn-inline" onClick={() => setSaveError(null)}>Entendido</button>
                        </div>
                    </div>
                )}

                {/* ============ Creado con avisos ============ */}
                {saveWarnings && (
                    <div className="notice notice-warn" role="status">
                        <div className="notice-body">
                            <strong>El torneo se {isEdit ? 'guardó' : 'creó'}, pero quedó algo pendiente</strong>
                            <ul>
                                {saveWarnings.map((warning) => <li key={warning}>{warning}</li>)}
                            </ul>
                        </div>
                        <div className="notice-actions">
                            <button
                                type="button"
                                className="btn btn-primary btn-inline"
                                onClick={() => { setSaveWarnings(null); router.push(tournamentsHomeHref); }}
                            >
                                Ir a torneos
                            </button>
                        </div>
                    </div>
                )}

                {/* ===================== Stepper ===================== */}
                {/* Los tres pasos con nombre, no un "Paso 2 de 3" anónimo: se ve
                    dónde estás, qué falta, y los pasos ya visitados son atajos de
                    vuelta. A los futuros se llega con "Siguiente", que valida. */}
                {stage !== 'template' && stage !== 'advanced' && (
                    <nav className="stepper-bar" aria-label="Pasos del asistente">
                        <ol className="stepper-steps">
                            {([
                                ['basics', 'Lo básico'],
                                ['structure', 'Estructura'],
                                ['participants', 'Participantes'],
                            ] as const).map(([stepId, label], index) => {
                                const stepNumber = index + 1;
                                const isDone = stepNumber < stageIndex;
                                const isActive = stage === stepId;
                                return (
                                    <li key={stepId}>
                                        <button
                                            type="button"
                                            className={`stepper-step ${isActive ? 'is-active' : ''} ${isDone ? 'is-done' : ''}`}
                                            aria-current={isActive ? 'step' : undefined}
                                            disabled={!isDone && !isActive}
                                            onClick={() => {
                                                if (!isDone) return;
                                                setStage(stepId);
                                                scrollWizardToTop();
                                            }}
                                        >
                                            <span className="stepper-step-dot" aria-hidden>
                                                {isDone ? <Check size={12} /> : stepNumber}
                                            </span>
                                            <span className="stepper-step-label">{label}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                        <div className="stepper-progress-bar">
                            <span className="stepper-progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                    </nav>
                )}

                {/* ===================== STAGE 0 · TEMPLATE PICKER ===================== */}
                {stage === 'template' && !isEdit && (
                    <section className="tplpick-wrap">
                        <h2 id="tg-template" style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em', marginBottom: '6px' }}>
                            ¿Qué tipo de torneo querés crear?
                        </h2>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                            Elegí una plantilla y completá lo esencial. Después podés ajustar cualquier detalle.
                        </p>

                        {/* Era la única elección excluyente del wizard modelada como cinco
                            interruptores sueltos (`aria-pressed`) en un `<section>` sin rol:
                            el lector decía «botón, no presionado» cinco veces, sin grupo y
                            sin «1 de 5». Los otros cinco grupos ya son radiogroup. */}
                        <RadioGroup className="tplpick-grid" labelledBy="tg-template">
                            {TOURNAMENT_TEMPLATES.map((tpl) => {
                                const TemplateIcon = tpl.icon;
                                return (
                                    <button
                                        key={tpl.id}
                                        type="button"
                                        role="radio"
                                        className={`tplpick-card ${tpl.popular ? 'popular' : ''} ${tpl.dashed ? 'dashed' : ''} ${selectedTemplate === tpl.id ? 'selected' : ''}`}
                                        aria-checked={selectedTemplate === tpl.id}
                                        onClick={() => setSelectedTemplate(tpl.id)}
                                    >
                                        <div className="tplpick-icon"><TemplateIcon size={22} aria-hidden /></div>
                                        <h3>{tpl.title}</h3>
                                        <p>{tpl.description}</p>
                                        {tpl.popular && <span className="tplpick-tag">Más usado</span>}
                                    </button>
                                );
                            })}
                        </RadioGroup>

                        <div className="tplpick-callout">
                            <Lightbulb size={16} style={{ color: 'var(--info)', flexShrink: 0 }} aria-hidden />
                            <div><strong>Tip:</strong> si no estás seguro, empezá con &quot;Liga · todos contra todos&quot;: es el formato más simple y podés cambiarlo más tarde sin perder participantes ni partidos cargados.</div>
                        </div>
                    </section>
                )}

                {/* Footer sticky del paso de plantillas (mockup) */}
                {stage === 'template' && !isEdit && (
                    <footer className="actions-footer tplpick-footer">
                        {advanceBlockedReason && (
                            <p className="footer-blocked" id="tplpick-blocked">{advanceBlockedReason}</p>
                        )}
                        <button
                            className="btn btn-primary"
                            disabled={!selectedTemplate}
                            aria-describedby={advanceBlockedReason ? 'tplpick-blocked' : undefined}
                            onClick={() => {
                                const tpl = TOURNAMENT_TEMPLATES.find((t) => t.id === selectedTemplate);
                                if (tpl) handleTemplateSelect(tpl);
                            }}
                        >
                            Siguiente
                            <ArrowRight size={16} aria-hidden />
                        </button>
                    </footer>
                )}

                {/* ===================== STAGE 1 · LO BÁSICO ===================== */}
                {stage === 'basics' && (
                    <>
                        <article className="partition">
                            <div className="partition-header">
                                <h2>Información del torneo</h2>
                                <p>Solo lo imprescindible. País, unión, edad y logo viven en «Más opciones».</p>
                            </div>
                            <div className="partition-body form-column">
                                <div className="form-grid">
                                    <div className="field-group">
                                        <label htmlFor="tg-name">Nombre del torneo *</label>
                                        <input id="tg-name"
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
Listo para continuar
                                            </div>
                                        )}
                                        {nameStatus === 'too-short' && (
                                            <div className="field-help-error">Ingresá al menos 3 caracteres.</div>
                                        )}
                                    </div>

                                    <div className="field-group">
                                        <label id="tg-sport-label">Deporte *</label>
                                        <RadioGroup className="sport-pick-grid" labelledBy="tg-sport-label">
                                            {availableSports.map(sport => (
                                                <button
                                                    key={sport.id}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={formData.sport === sport.id}
                                                    className={formData.sport === sport.id ? 'selected' : ''}
                                                    onClick={() => handleSportChange(sport.id)}
                                                >
                                                    <span className="emo">{sport.icon}</span>
                                                    <span>{sport.nameEs}</span>
                                                </button>
                                            ))}
                                        </RadioGroup>
                                        {currentSportIsLegacy && (
                                            <p className="field-help">
                                                Este torneo está en un deporte que ya no admite altas nuevas. Podés dejarlo como está o pasarlo a uno de los habilitados.
                                            </p>
                                        )}
                                    </div>

                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label htmlFor="tg-season">Temporada</label>
                                            <select id="tg-season"
                                                className="form-select"
                                                value={formData.season}
                                                onChange={e => setFormData({ ...formData, season: e.target.value })}
                                            >
                                                {/* Del año próximo hacia atrás, más el valor guardado si es
                                                    de otra época: un torneo viejo en edición no puede quedar
                                                    con el select apuntando a una opción que no existe. */}
                                                {Array.from(new Set([
                                                    ...Array.from({ length: 4 }, (_, index) => String(new Date().getFullYear() + 1 - index)),
                                                    formData.season,
                                                ])).map((year) => (
                                                    <option key={year} value={year}>{year}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="field-group">
                                            <label htmlFor="tg-category">Categoría</label>
                                            <input id="tg-category"
                                                className="form-input"
                                                type="text"
                                                value={formData.category}
                                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                placeholder="Ej: Primera, Juveniles, Reserva..."
                                            />
                                        </div>
                                    </div>

                                    <div className="field-group">
                                        <label id="tg-audience">Audiencia pública</label>
                                        <RadioGroup className="choice-pair" labelledBy="tg-audience">
                                            {(['mayores', 'juveniles'] as TournamentAudience[]).map((audience) => (
                                                <button
                                                    key={audience}
                                                    type="button"
                                                    role="radio"
                                                    aria-checked={formData.publicAudience === audience}
                                                    className={formData.publicAudience === audience ? 'selected' : ''}
                                                    onClick={() => handlePublicAudienceChange(audience)}
                                                >
                                                    {AUDIENCE_LABELS[audience]}
                                                    <span className="small">
                                                        {audience === 'mayores'
                                                            ? 'Aparece en la portada principal'
                                                            : 'Menores, juveniles e Intermedia / Preintermedia'}
                                                    </span>
                                                </button>
                                            ))}
                                        </RadioGroup>
                                    </div>

                                    <details className="tg-disclosure">
                                        <summary>Más opciones · país, unión, clasificación de edad y logo</summary>
                                        <div className="tg-disclosure-body">
                                            <div className="grid-2">
                                                <div className="field-group">
                                                    <label htmlFor="tg-country">País / Región</label>
                                                    <select id="tg-country"
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
                                                    <label htmlFor="tg-union">Unión vinculada</label>
                                                    <select id="tg-union"
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
                                                            <button type="button" className="btn btn-outline btn-inline" onClick={refreshUnions}>
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
                                                                    <label htmlFor="tg-union-name">Nombre</label>
                                                                    <input
                                                                        className="form-input"
                                                                        type="text"
                                                                        id="tg-union-name"
                                                                        value={unionCreateForm.name}
                                                                        onChange={(e) => setUnionCreateForm((prev) => ({ ...prev, name: e.target.value, slugManuallyEdited: prev.slugManuallyEdited }))}
                                                                        placeholder="Ej: Unión de Rugby de Buenos Aires"
                                                                    />
                                                                </div>
                                                                <div className="field-group">
                                                                    <label htmlFor="tg-union-slug">Slug</label>
                                                                    <input
                                                                        className="form-input"
                                                                        type="text"
                                                                        id="tg-union-slug"
                                                                        value={unionCreateForm.slug}
                                                                        onChange={(e) => handleUnionCreateSlugChange(e.target.value)}
                                                                        placeholder="union-rugby-buenos-aires"
                                                                    />
                                                                </div>
                                                            </div>
                                                            <div className="grid-2">
                                                                <div className="field-group">
                                                                    <label htmlFor="tg-union-country">País</label>
                                                                    <input
                                                                        className="form-input"
                                                                        type="text"
                                                                        id="tg-union-country"
                                                                        value={unionCreateForm.country}
                                                                        onChange={(e) => setUnionCreateForm((prev) => ({ ...prev, country: e.target.value }))}
                                                                    />
                                                                </div>
                                                                <div className="field-group">
                                                                    <label htmlFor="tg-union-level">Nivel</label>
                                                                    <select
                                                                        className="form-select"
                                                                        id="tg-union-level"
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
                                                <label htmlFor="tg-agegrade">Clasificación de edad</label>
                                                <select id="tg-agegrade"
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
                        {/* Dos columnas en escritorio: los controles a la izquierda y, al
                            lado, lo que se está armando. Antes la vista previa quedaba
                            debajo del pliegue en una pantalla de 900 px de alto —justo el
                            dato que dice si la configuración es la que querés—. */}
                        <div className="partition-body structure-split">
                          <div className="structure-main">

                            <div className="field-group">
                                <label id="tg-format">Formato</label>
                                <RadioGroup className="choice-grid" labelledBy="tg-format">
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={formData.format === 'league'}
                                        className={`choice-btn ${formData.format === 'league' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('league')}
                                    >
                                        <ListOrdered className="choice-icon" />
                                        <span className="choice-label">Liga (todos contra todos)</span>
                                    </button>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={formData.format === 'knockout'}
                                        className={`choice-btn ${formData.format === 'knockout' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('knockout')}
                                    >
                                        <GitMerge className="choice-icon" />
                                        <span className="choice-label">Eliminación directa</span>
                                    </button>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={formData.format === 'groups'}
                                        className={`choice-btn ${formData.format === 'groups' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('groups')}
                                    >
                                        <LayoutGrid className="choice-icon" />
                                        <span className="choice-label">Grupos + Playoff</span>
                                    </button>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={formData.format === 'circuit'}
                                        className={`choice-btn ${formData.format === 'circuit' ? 'selected' : ''}`}
                                        onClick={() => handleFormatChange('circuit')}
                                    >
                                        <Flag className="choice-icon" />
                                        <span className="choice-label">Circuito por eventos</span>
                                    </button>
                                </RadioGroup>
                            </div>

                            {formData.format === 'circuit' && (
                                <div className="field-group">
                                    <label htmlFor="tg-circuit">Modo del circuito</label>
                                    <select id="tg-circuit"
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
                                    <label htmlFor="tg-teamcount">Cantidad de equipos</label>
                                    <div className="tg-counter">
                                        <button type="button" aria-label="Quitar un equipo" onClick={() => setFormData((p) => ({ ...p, teamCount: Math.max(2, p.teamCount - 1) }))}>−</button>
                                        <input
                                            id="tg-teamcount"
                                            type="number"
                                            min={2}
                                            max={64}
                                            value={formData.teamCount}
                                            onChange={(e) => setFormData((p) => ({ ...p, teamCount: Math.max(2, Math.min(64, Number(e.target.value) || 2)) }))}
                                        />
                                        <button type="button" aria-label="Sumar un equipo" onClick={() => setFormData((p) => ({ ...p, teamCount: Math.min(64, p.teamCount + 1) }))}>+</button>
                                    </div>
                                    <p className="field-help">Podés agregar o quitar después.</p>
                                </div>

                                {formData.format === 'league' && (
                                    <div className="field-group">
                                        <label id="tg-legs">Modalidad</label>
                                        <RadioGroup className="choice-pair" labelledBy="tg-legs">
                                            <button
                                                type="button"
                                                role="radio"
                                                aria-checked={formData.leagueRounds === 1}
                                                className={formData.leagueRounds === 1 ? 'selected' : ''}
                                                onClick={() => handleLeagueRoundsChange(1)}
                                            >
                                                Solo ida
                                                <span className="small">{Math.max(0, formData.teamCount - 1)} fechas</span>
                                            </button>
                                            <button
                                                type="button"
                                                role="radio"
                                                aria-checked={formData.leagueRounds === 2}
                                                className={formData.leagueRounds === 2 ? 'selected' : ''}
                                                onClick={() => handleLeagueRoundsChange(2)}
                                            >
                                                Ida y vuelta
                                                <span className="small">{Math.max(0, (formData.teamCount - 1) * 2)} fechas</span>
                                            </button>
                                        </RadioGroup>
                                    </div>
                                )}
                            </div>

                            {formData.sport === 'american-football' && (
                                <details className="tg-disclosure" open>
                                    <summary>Reglamento de fútbol americano</summary>
                                    <AmericanFootballRulesEditor
                                        value={formData.americanFootball}
                                        onChange={handleAmericanFootballChange}
                                    />
                                </details>
                            )}

                            <details className="tg-disclosure">
                                <summary>Puntos por partido</summary>
                                <div className="tg-disclosure-body">
                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label htmlFor="tg-points-win">Victoria</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                id="tg-points-win"
                                                value={formData.rules.pointsWin}
                                                onChange={(e) => setFormData((p) => ({ ...p, rules: { ...p.rules, pointsWin: parseInt(e.target.value) || 0 } }))}
                                            />
                                        </div>
                                        <div className="field-group">
                                            <label htmlFor="tg-points-draw">Empate</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                id="tg-points-draw"
                                                value={formData.rules.pointsDraw}
                                                onChange={(e) => setFormData((p) => ({ ...p, rules: { ...p.rules, pointsDraw: parseInt(e.target.value) || 0 } }))}
                                            />
                                        </div>
                                    </div>
                                    <div className="grid-2">
                                        <div className="field-group">
                                            <label htmlFor="tg-points-loss">Derrota</label>
                                            <input
                                                className="form-input"
                                                type="number"
                                                id="tg-points-loss"
                                                value={formData.rules.pointsLoss}
                                                onChange={(e) => setFormData((p) => ({ ...p, rules: { ...p.rules, pointsLoss: parseInt(e.target.value) || 0 } }))}
                                            />
                                        </div>
                                        {formData.sport === 'rugby' && (
                                            <div className="field-group">
                                                <label htmlFor="tg-bonus-try">Bonus ofensivo (puntos)</label>
                                                <input
                                                    className="form-input"
                                                    type="number"
                                                    id="tg-bonus-try"
                                                    value={formData.rules.pointsBonusTry}
                                                    onChange={(e) => setFormData((p) => ({ ...p, rules: { ...p.rules, pointsBonusTry: parseInt(e.target.value) || 0 } }))}
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {formData.sport === 'rugby' && (
                                        <div className="grid-2">
                                            {/* Dos reglamentos vivos para el mismo bonus por tries: el
                                                clásico de 4 anotados y el de World Rugby (2016) de 3
                                                más que el rival. Un torneo elige uno. */}
                                            <div className="field-group">
                                                <label htmlFor="tg-bonus-try-mode">Se otorga por</label>
                                                <select
                                                    className="form-input"
                                                    id="tg-bonus-try-mode"
                                                    value={formData.rules.pointsBonusTryMode}
                                                    onChange={(e) => {
                                                        const mode: OffensiveBonusMode = e.target.value === 'difference' ? 'difference' : 'count';
                                                        setFormData((p) => ({ ...p, rules: { ...p.rules, pointsBonusTryMode: mode } }));
                                                    }}
                                                >
                                                    <option value="count">4 tries o más</option>
                                                    <option value="difference">3 tries de diferencia</option>
                                                </select>
                                            </div>
                                            <div className="field-group">
                                                <label htmlFor="tg-bonus-loss">Bonus defensivo (perder por ≤7)</label>
                                                <input
                                                    className="form-input"
                                                    type="number"
                                                    id="tg-bonus-loss"
                                                    value={formData.rules.pointsBonusLoss}
                                                    onChange={(e) => setFormData((p) => ({ ...p, rules: { ...p.rules, pointsBonusLoss: parseInt(e.target.value) || 0 } }))}
                                                />
                                            </div>
                                        </div>
                                    )}
                                    {formData.sport === 'rugby' && (
                                        <p className="field-help">
                                            {formData.rules.pointsBonusTryMode === 'difference'
                                                ? 'Los bonus se suman a los puntos del partido cuando se cumplen: ofensivo al anotar 3 tries más que el rival (3-0, 4-1, 5-2), defensivo al perder por 7 o menos.'
                                                : 'Los bonus se suman a los puntos del partido cuando se cumplen: ofensivo con 4 o más tries, defensivo al perder por 7 o menos.'}
                                        </p>
                                    )}
                                </div>
                            </details>

                          </div>

                          <aside className="structure-aside" aria-label="Resumen de la configuración">
                            <div className="live-preview-chip">
                                <div className="kicker">Lo que se va a crear</div>
                                <strong>{formatPreview.title}</strong>
                                <div className="meta">{formatPreview.meta}</div>
                                <dl className="preview-facts">
                                    <div><dt>Formato</dt><dd>{getTournamentFormatLabel(formData.format)}</dd></div>
                                    <div><dt>Victoria</dt><dd>{formData.rules.pointsWin} pts</dd></div>
                                    <div><dt>Empate</dt><dd>{formData.rules.pointsDraw} pts</dd></div>
                                    {formData.sport === 'american-football' && (
                                        <div><dt>Reglamento</dt><dd>{describeAmericanFootballRuleset(formData.americanFootball)}</dd></div>
                                    )}
                                    {formData.sport === 'rugby' && (
                                        <div>
                                            <dt>Bonus</dt>
                                            <dd>
                                                {formData.rules.pointsBonusTry} por {formData.rules.pointsBonusTryMode === 'difference'
                                                    ? `${DEFAULT_OFFENSIVE_BONUS_THRESHOLD.difference}+ tries de diferencia`
                                                    : `${DEFAULT_OFFENSIVE_BONUS_THRESHOLD.count}+ tries`} · {formData.rules.pointsBonusLoss} def
                                            </dd>
                                        </div>
                                    )}
                                </dl>
                            </div>

                            <div className="tplpick-callout" style={{ marginTop: '14px' }}>
                                <Settings2 size={16} style={{ color: 'var(--info)', flexShrink: 0 }} />
                                <div>
                                    Para multi-fase, criterios de desempate y fixture importado, usá <strong>&quot;Avanzado&quot;</strong> arriba a la derecha. Tu configuración se preserva.
                                </div>
                            </div>
                          </aside>
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
                        {/* El catálogo a la izquierda y, al lado, QUIÉNES quedaron
                            elegidos. El medidor decía "4 de 8" pero no había forma de
                            ver cuáles cuatro sin cazarlos entre 2.976 filas. */}
                        <div className="partition-body participants-split">
                          <div className="participants-main">

                            <div className="club-search-wrap">
                                <div className="club-summary-bar">
                                    <div className="pick-progress">
                                        <div className="pick-progress-head">
                                            <strong>{selectedClubs.length}</strong>
                                            <span>de {formData.teamCount} equipos</span>
                                            {selectedClubs.length > formData.teamCount && (
                                                <em className="pick-over">{selectedClubs.length - formData.teamCount} de más</em>
                                            )}
                                            {selectedClubs.length === formData.teamCount && (
                                                <em className="pick-done">completo</em>
                                            )}
                                        </div>
                                        {/* El objetivo del paso 2 se veía como una frase al final de un
                                            renglón. Acá es una barra: cuánto falta se lee sin leer. */}
                                        <div
                                            className="pick-progress-track"
                                            role="progressbar"
                                            aria-valuenow={selectedClubs.length}
                                            aria-valuemin={0}
                                            aria-valuemax={Math.max(formData.teamCount, selectedClubs.length)}
                                            aria-label="Equipos seleccionados sobre el objetivo"
                                        >
                                            <span
                                                className={`pick-progress-fill ${selectedClubs.length >= formData.teamCount ? 'is-complete' : ''}`}
                                                style={{ width: `${Math.min(100, formData.teamCount ? (selectedClubs.length / formData.teamCount) * 100 : 0)}%` }}
                                            />
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className={`btn btn-outline btn-inline bulk-select-btn ${bulkConfirmPending ? 'is-confirming' : ''}`}
                                        onClick={toggleAllFilteredClubs}
                                        disabled={filteredClubIds.length === 0}
                                    >
                                        {allFilteredSelected
                                            ? `Quitar los ${filteredClubIds.length} visibles`
                                            : bulkConfirmPending
                                                ? `Confirmar: añadir ${filteredClubIds.length}`
                                                : `Seleccionar los ${filteredClubIds.length} visibles`}
                                    </button>
                                </div>

                                <div className="search-box" style={{ position: 'relative' }}>
                                    <Search className="icon" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre, tipo o ubicación..."
                                        aria-label="Buscar equipos en el catálogo"
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
                                            {ENTITY_FILTER_LABELS[f]}
                                            <span className="count">{entityCounts[f]}</span>
                                        </button>
                                    ))}
                                </div>

                                <div className="club-meta-row" aria-live="polite">
                                    <span>
                                        {loadingClubs
                                            ? 'Cargando catálogo...'
                                            : clubsError
                                                ? clubsError
                                                : `${filteredClubs.length} de ${clubs.length} equipos`}
                                    </span>
                                    {searchIsStale && <span className="club-meta-stale">filtrando…</span>}
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
                                    /* Antes era un callejón: "No hay equipos que coincidan" y nada más.
                                       Ahora dice qué filtro lo está tapando y ofrece salir de él. */
                                    <div className="club-empty">
                                        <p className="club-empty-title">
                                            Ningún equipo coincide con «{searchTerm.trim()}»
                                            {entityFilter !== 'all' && <> en <strong>{ENTITY_FILTER_LABELS[entityFilter]}</strong></>}
                                        </p>
                                        <div className="club-empty-actions">
                                            {entityFilter !== 'all' && (
                                                <button type="button" className="btn btn-outline btn-inline" onClick={() => setEntityFilter('all')}>
                                                    Buscar en todos los tipos
                                                </button>
                                            )}
                                            {searchTerm && (
                                                <button type="button" className="btn btn-outline btn-inline" onClick={() => setSearchTerm('')}>
                                                    Limpiar la búsqueda
                                                </button>
                                            )}
                                        </div>
                                        <p className="club-empty-hint">
                                            Si el equipo no existe todavía, creálo en Clubes y volvé: el borrador se guarda solo.
                                        </p>
                                    </div>
                                )}

                                {!loadingClubs && filteredClubs.map((club) => (
                                    <ClubCatalogRow
                                        key={club.id}
                                        club={club}
                                        added={selectedClubSet.has(club.id)}
                                        squads={clubSquadsByClub[club.id] || EMPTY_SQUADS}
                                        isLoadingSquads={Boolean(loadingSquadsByClub[club.id])}
                                        selectedDivisionId={selectedDivisionByClub[club.id] || ''}
                                        onToggle={setClubSelection}
                                        onDivisionChange={handleDivisionChange}
                                    />
                                ))}
                            </div>

                            <div className="tplpick-callout" style={{ marginTop: '14px' }}>
                                <Lightbulb size={16} style={{ color: 'var(--info)', flexShrink: 0 }} aria-hidden />
                                <div>
                                    Si el equipo no está en el catálogo, podés crearlo desde la sección de Clubes y volver a este wizard. El borrador se guarda automáticamente.
                                </div>
                            </div>

                            {/* Visibilidad final */}
                            <div className="field-group" style={{ marginTop: '24px' }}>
                                <label id="tg-visibility">Al crear</label>
                                <RadioGroup className="choice-pair" labelledBy="tg-visibility">
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={formData.visibility === 'private'}
                                        className={formData.visibility === 'private' ? 'selected' : ''}
                                        onClick={() => setFormData((p) => ({ ...p, visibility: 'private' }))}
                                    >
                                        Borrador
                                        <span className="small">Solo visible para admins</span>
                                    </button>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={formData.visibility === 'public'}
                                        className={formData.visibility === 'public' ? 'selected' : ''}
                                        onClick={() => setFormData((p) => ({ ...p, visibility: 'public' }))}
                                    >
                                        Público
                                        <span className="small">Visible en la app al instante</span>
                                    </button>
                                </RadioGroup>
                            </div>
                          </div>

                          <aside className="participants-aside" aria-label="Resumen y equipos elegidos">
                            {/* El paso donde vive el botón "Crear" es también el de
                                confirmar: acá se relee TODO lo configurado sin volver
                                atrás. Los pasos del stepper quedan como atajo si algo
                                no cierra. */}
                            <div className="final-summary">
                                <div className="final-summary-kicker">{isEdit ? 'Se va a guardar' : 'Se va a crear'}</div>
                                <strong className="final-summary-name" title={formData.name}>
                                    {formData.name.trim() || 'Torneo sin nombre'}
                                </strong>
                                <dl className="preview-facts">
                                    <div><dt>Deporte</dt><dd>{selectedSport?.nameEs || formData.sport}</dd></div>
                                    {formData.sport === 'american-football' && (
                                        <div><dt>Reglamento</dt><dd>{describeAmericanFootballRuleset(formData.americanFootball)}</dd></div>
                                    )}
                                    <div><dt>Temporada</dt><dd>{formData.season}</dd></div>
                                    <div><dt>Formato</dt><dd>{getTournamentFormatLabel(formData.format)}</dd></div>
                                    <div><dt>Equipos</dt><dd>{selectedClubs.length} de {formData.teamCount}</dd></div>
                                    <div><dt>{isEdit ? 'Estado' : 'Al crear'}</dt><dd>{formData.visibility === 'public' ? 'Público' : 'Borrador'}</dd></div>
                                </dl>
                            </div>

                            <div className="picked-panel">
                                <div className="picked-head">
                                    <h3>Elegidos</h3>
                                    <span className="picked-count">{selectedClubs.length}</span>
                                </div>

                                {selectedClubRecords.length === 0 ? (
                                    <p className="picked-empty">
                                        Todavía no elegiste ninguno. Buscá en el catálogo y tocá la fila para sumarlo.
                                    </p>
                                ) : (
                                    <>
                                        <ul className="picked-list">
                                            {selectedClubRecords.map((club) => {
                                                const squads = clubSquadsByClub[club.id] || [];
                                                const falta = squads.length > 1 && !selectedDivisionByClub[club.id];
                                                return (
                                                    <li key={club.id} className={falta ? 'needs-squad' : ''}>
                                                        <span className="picked-name" title={club.name}>{club.name}</span>
                                                        {falta && <span className="picked-flag" title="Falta elegir el plantel">plantel</span>}
                                                        <button
                                                            type="button"
                                                            className="picked-remove"
                                                            aria-label={`Quitar ${club.name}`}
                                                            onClick={() => setClubSelection(club.id, false)}
                                                        >
                                                            &times;
                                                        </button>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        <button
                                            type="button"
                                            className="btn btn-outline btn-inline picked-clear"
                                            onClick={() => { setSelectedClubs([]); setSelectedDivisionByClub({}); }}
                                        >
                                            Vaciar la selección
                                        </button>
                                    </>
                                )}
                            </div>
                          </aside>
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
                        {advanceBlockedReason && (
                            <p className="footer-blocked" id="advance-blocked">{advanceBlockedReason}</p>
                        )}
                        <button
                            className="btn btn-outline"
                            disabled={saving}
                            onClick={goPrev}
                        >
                            <ChevronLeft size={16} aria-hidden /> Atrás
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={goNext}
                            aria-describedby={advanceBlockedReason ? 'advance-blocked' : undefined}
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
                                <>Siguiente <ArrowRight size={16} aria-hidden /></>
                            )}
                        </button>
                    </footer>
                )}
            </div>
        </div>
    );
}
