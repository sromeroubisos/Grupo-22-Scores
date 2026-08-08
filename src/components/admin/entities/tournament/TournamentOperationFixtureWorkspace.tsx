'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import ProtectedLink from '@/components/ProtectedLink';
import {
  AlertTriangle,
  Calendar,
  CalendarPlus2,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Grip,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  PlusCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  WandSparkles,
  X,
  Zap,
} from 'lucide-react';
import type { Database } from '@/lib/database.types';
import type { MatchStatus, MatchWithClubs, RoundWithMatches } from '@/lib/types/fixture';
import type { FixtureImportPreviewResult } from '@/lib/types/fixture-import';
import { resolveMatchPointsRules, type MatchPointsRules } from '@/lib/standings/matchPointsPreview';
import { explainMatchPoints, type MatchPointsExplain } from '@/lib/standings/matchPointsExplain';
import {
  getSecondaryScoreKeys,
  getSecondaryScoreMetric,
  type SecondaryScoreMetric,
} from '@/lib/sportMatchProfile';
import {
  APP_TIMEZONE,
  combineLocalDateTimeToUtcIso,
  formatDateInTimeZone,
  toInputDateInTimeZone,
  toInputTimeInTimeZone,
} from '@/lib/timezone';
import { FixtureImportWizard } from './FixtureImportWizard';
import { useFixture } from './FixtureContext';
import { useAnimatedDisclosure } from './useAnimatedDisclosure';
import { Crest } from './Crest';
import './fixture-management.css';
import './operation-console.css';

type TournamentRow = Database['public']['Tables']['tournaments']['Row'];
type MethodId = 'manual_match' | 'structure_only' | 'berger_algorithm' | 'import_fixture';
type WorkspaceSubtabId = 'add_matches' | 'manage_fixture';
type ManageViewMode = 'cards' | 'list';
type ManageGroupingMode = 'rounds' | 'groups' | 'orphans';
type ValidationResult = { isValid?: boolean; diagnostics?: Array<{ type?: string; message?: string; context?: string }> } | null;
/**
 * El reglamento completo de la fase, bonus incluidos.
 *
 * Antes acá vivía un `PointsRules` propio que sólo guardaba win/draw/loss y el
 * shootout: los bonus se descartaban al resolver las reglas. Por eso
 * «Autocompletar» nunca podía calcular el bonus por 4+ tries y había que
 * ponerlo a mano — en Super Rugby Americas, 34 de 59 partidos terminaron con
 * los puntos editados manualmente. Ahora se usa el mismo tipo que el motor.
 */
type PointsRules = MatchPointsRules;
type RulesConfig = {
  points?: {
    win?: number;
    draw?: number;
    loss?: number;
  };
} & Record<string, unknown>;

type ManualFormState = {
  roundMode: 'existing' | 'new';
  roundId: string;
  roundLabel: string;
  groupId: string;
  homeClubId: string;
  awayClubId: string;
  matchDate: string;
  matchTime: string;
  venue: string;
  status: MatchStatus;
};

type RoundDraftState = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  notes: string;
};

type ManageEntry = {
  match: MatchWithClubs;
  round: RoundWithMatches;
};

type QuickResultFormState = {
  status: MatchStatus;
  homeScore: string;
  awayScore: string;
  // La SEGUNDA cifra del marcador, la que el resultado no contiene. En rugby
  // son los tries: el bonus ofensivo se define por cantidad (4+ en la mayoría
  // de los torneos) y sin ese dato el reglamento no lo puede calcular solo.
  //
  // Qué cifra es —y si el deporte tiene alguna— lo dice
  // `getSecondaryScoreMetric`. En hockey y fútbol es `null`: cada gol vale 1,
  // así que el marcador YA es el conteo y un campo aparte sería un segundo
  // número para lo mismo, capaz de contradecirlo.
  homeSecondary: string;
  awaySecondary: string;
  homePenalties: string;
  awayPenalties: string;
  homeBasePoints: string;
  awayBasePoints: string;
  homeBonusPoints: string;
  awayBonusPoints: string;
  pointsAutocalculated: boolean;
  pointsOverrideReason: string;
  scheduledDate: string;
  scheduledTime: string;
};

type ManageContainer = {
  id: string;
  title: string;
  subtitle: string;
  matches: ManageEntry[];
  roundId: string | null;
  editable: boolean;
  tone: 'empty' | 'complete' | 'active';
};

const STATUS_OPTIONS: Array<{ value: MatchStatus; label: string }> = [
  { value: 'scheduled', label: 'Programado' },
  { value: 'live', label: 'En vivo' },
  { value: 'final', label: 'Finalizado' },
  { value: 'postponed', label: 'Reprogramado' },
  { value: 'suspended', label: 'Suspendido' },
  { value: 'cancelled', label: 'Cancelado' },
];

const METHOD_OPTIONS: Array<{
  id: MethodId;
  icon: typeof PlusCircle;
  title: string;
  description: string;
  tone: 'accent-primary' | 'accent-neutral' | 'accent-accent';
}> = [
  { id: 'manual_match', icon: PlusCircle, title: 'Crear partido manual', description: 'Agregar un partido individual con fecha, hora, jornada, sede y equipos.', tone: 'accent-primary' },
  { id: 'import_fixture', icon: Upload, title: 'Importar fixture', description: 'Cargar partidos desde Excel, CSV, PDF o texto pegado.', tone: 'accent-accent' },
  { id: 'structure_only', icon: LayoutGrid, title: 'Generar estructura', description: 'Crear jornadas vacias para completar despues.', tone: 'accent-neutral' },
  { id: 'berger_algorithm', icon: Zap, title: 'Generacion Berger', description: 'Crear automaticamente cruces Round Robin.', tone: 'accent-neutral' },
];

// El `label` es el botón del segmento y la `description` la línea que lo
// acompaña en el riel. No hay `title`: era el mismo texto que el label, escrito
// dos veces para un hero que ya no existe.
const WORKSPACE_SUBTABS = [
  { id: 'add_matches' as const, label: 'Agregar', description: 'Alta manual, importacion y generacion en un solo lugar.' },
  { id: 'manage_fixture' as const, label: 'Gestionar fixture', description: 'Cards, filtros y acciones rapidas sobre lo ya cargado.' },
];

/**
 * Cuántos partidos se dibujan por bloque antes de pedir «mostrar más».
 * Veinticuatro es una jornada larga entera y, en un teléfono, poco más de
 * tres pantallas: se llega al final del bloque sin que aparezca el botón.
 * Recién se nota cuando el bloque es de verdad grande —una fase sin jornadas
 * asignadas, con el fixture entero adentro—, que es justo el caso que hacía
 * inusable la pantalla.
 */
const MANAGE_PAGE_SIZE = 24;

const GROUPING_OPTIONS: Array<{ id: ManageGroupingMode; label: string }> = [
  { id: 'rounds', label: 'Por jornada' },
  { id: 'groups', label: 'Por grupo' },
  { id: 'orphans', label: 'Sin jornada' },
];

// Los dos primeros pasos LEEN, los dos últimos DECIDEN y escriben. El rótulo
// lo dice, porque el orden de los cuatro no alcanza para saber en cuál se
// vuelve atrás gratis y en cuál ya no.
const IMPORT_STEPS = [
  { id: 'source', label: 'Fuente' },
  { id: 'analysis', label: 'Análisis' },
  { id: 'preview', label: 'Preview' },
  { id: 'confirmation', label: 'Confirmación' },
];

function todayInputValue() {
  return toInputDateInTimeZone(new Date(), APP_TIMEZONE);
}

function defaultManualForm(): ManualFormState {
  return {
    roundMode: 'existing',
    roundId: '',
    roundLabel: '',
    groupId: '',
    homeClubId: '',
    awayClubId: '',
    matchDate: '',
    matchTime: '',
    venue: '',
    status: 'scheduled',
  };
}

// Native <input type="date"> shows its value using the browser/OS locale, which
// renders MM/DD/YYYY on English systems regardless of the page lang. These helpers
// back a custom field that always displays dd/mm/aaaa while storing the ISO value.
function isoToDdMmYyyy(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

function ddMmYyyyToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1000) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) {
    return null;
  }
  return `${match[3]}-${match[2]}-${match[1]}`;
}

/**
 * Date field that always shows dd/mm/aaaa (typed or via the native calendar
 * picker), independent of the browser locale. `value`/`onChange` use the ISO
 * yyyy-mm-dd format expected by the rest of the form.
 */
function DdMmYyyyDateField({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  // El editor de resultado viste sus inputs desde el contenedor (`.op-field
  // input`); el alta manual necesita la clase puesta a mano. Por eso es opcional
  // en vez de tener un valor por defecto que rompería al primero.
  className?: string;
}) {
  const nativeRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string>(() => isoToDdMmYyyy(value));

  useEffect(() => {
    setText(isoToDdMmYyyy(value));
  }, [value]);

  const handleText = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setText(formatted);
    if (formatted === '') {
      onChange('');
      return;
    }
    const iso = ddMmYyyyToIso(formatted);
    if (iso) onChange(iso);
  };

  const openPicker = () => {
    const el = nativeRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      try {
        el.showPicker();
        return;
      } catch {
        /* showPicker not allowed here — fall back to focus/click */
      }
    }
    el.focus();
    el.click();
  };

  return (
    <div className="fixture-quick-datefield">
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        className={className}
        value={text}
        maxLength={10}
        onChange={(event) => handleText(event.target.value)}
      />
      <button
        type="button"
        className="fixture-quick-date-trigger"
        onClick={openPicker}
        aria-label="Abrir calendario"
      >
        <Calendar size={15} />
      </button>
      <input
        ref={nativeRef}
        type="date"
        className="fixture-quick-date-native"
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        tabIndex={-1}
        aria-hidden="true"
      />
    </div>
  );
}

function formatDateLabel(value: string | null | undefined) {
  return formatDateInTimeZone(value, 'es-AR', { day: '2-digit', month: 'short' }, APP_TIMEZONE) || 'Sin fecha';
}

function formatLongDateLabel(value: string | null | undefined) {
  return formatDateInTimeZone(value, 'es-AR', { day: '2-digit', month: 'short', year: 'numeric' }, APP_TIMEZONE) || 'Sin fecha definida';
}

function formatTimeLabel(value: string | null | undefined) {
  return formatDateInTimeZone(value, 'es-AR', { hour: '2-digit', minute: '2-digit', hour12: false }, APP_TIMEZONE) || '--:--';
}

function toInputDate(value: string | null | undefined) {
  return toInputDateInTimeZone(value, APP_TIMEZONE);
}

function toInputTime(value: string | null | undefined) {
  return toInputTimeInTimeZone(value, APP_TIMEZONE);
}

function buildDateTime(date: string, time: string) {
  return combineLocalDateTimeToUtcIso(date, time || '00:00', APP_TIMEZONE);
}

function getStorageKey(tournamentId: string) {
  return `operation-fixture-subtab:${tournamentId}`;
}

function getStatusLabel(status: MatchStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

function formatGroupLabel(groupId: string | null | undefined, groupLabelById?: Map<string, string>) {
  if (!groupId) return 'Sin grupo';
  return groupLabelById?.get(groupId) || `Grupo ${groupId.slice(0, 8)}`;
}

function resolvePointsRules(phaseSettings: RulesConfig | null | undefined, tournamentRuleset: RulesConfig | null | undefined): PointsRules {
  return resolveMatchPointsRules(
    phaseSettings as Record<string, unknown> | null | undefined,
    tournamentRuleset as Record<string, unknown> | null | undefined,
  );
}

function parseQuickNumber(value: string, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseOptionalQuickNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
}

function parseQuickPointNumber(value: string, fallback = 0) {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatQuickNumber(value: number | null | undefined, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? String(normalized) : String(fallback);
}

function formatOptionalQuickNumber(value: number | null | undefined) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? String(normalized) : '';
}

function shouldShowPenaltyFields(form: Pick<QuickResultFormState, 'status' | 'homeScore' | 'awayScore'>) {
  if (form.status !== 'final') return false;
  const homeScore = Number.parseInt(form.homeScore, 10);
  const awayScore = Number.parseInt(form.awayScore, 10);
  return Number.isFinite(homeScore) && Number.isFinite(awayScore) && homeScore === awayScore;
}

/**
 * El marcador tal como lo entiende el reglamento: puntos, la cifra secundaria
 * del deporte y los penales. Es lo que se le pasa a `explainMatchPoints` y lo
 * que termina guardado, así que la cuenta que se muestra y la que se persiste
 * salen del mismo lugar.
 *
 * La clave de la cifra secundaria la da el deporte: rugby escribe `homeTries`
 * (idéntico a antes), fútbol americano escribiría `homeTouchdowns`, y hockey
 * no escribe nada porque no tiene.
 */
function quickScoreOf(form: QuickResultFormState, metric: SecondaryScoreMetric | null) {
  const homeSecondary = parseOptionalQuickNumber(form.homeSecondary);
  const awaySecondary = parseOptionalQuickNumber(form.awaySecondary);
  const secondaryKeys = metric ? getSecondaryScoreKeys(metric) : null;
  const hasPenalties = form.homePenalties.trim() !== '' && form.awayPenalties.trim() !== '';

  return {
    home: Math.max(0, parseQuickNumber(form.homeScore)),
    away: Math.max(0, parseQuickNumber(form.awayScore)),
    ...(secondaryKeys && homeSecondary !== null ? { [secondaryKeys.home]: homeSecondary } : {}),
    ...(secondaryKeys && awaySecondary !== null ? { [secondaryKeys.away]: awaySecondary } : {}),
    ...(hasPenalties
      ? {
          penalties: {
            home: Math.max(0, parseQuickNumber(form.homePenalties)),
            away: Math.max(0, parseQuickNumber(form.awayPenalties)),
          },
        }
      : {}),
  };
}

/** Los puntos que el reglamento le da a este partido, con la cuenta explicada. */
function explainQuickPoints(
  form: QuickResultFormState,
  rules: PointsRules,
  metric: SecondaryScoreMetric | null,
): MatchPointsExplain {
  return explainMatchPoints(form.status, quickScoreOf(form, metric), rules);
}

/**
 * Rellena los puntos con lo que dice el reglamento. A diferencia del
 * «Autocompletar» anterior, ahora también resuelve el BONUS: el ofensivo sale
 * de los tries que ahora se cargan, y el defensivo de la diferencia.
 */
function applyQuickPointsAutofill(
  form: QuickResultFormState,
  rules: PointsRules,
  metric: SecondaryScoreMetric | null,
): QuickResultFormState {
  if (form.status !== 'final') {
    return {
      ...form,
      homeBasePoints: '0',
      awayBasePoints: '0',
      homeBonusPoints: '0',
      awayBonusPoints: '0',
      pointsAutocalculated: true,
      pointsOverrideReason: '',
    };
  }

  const explained = explainQuickPoints(form, rules, metric);

  return {
    ...form,
    homeBasePoints: String(explained.home.base),
    awayBasePoints: String(explained.away.base),
    homeBonusPoints: String(explained.home.bonus),
    awayBonusPoints: String(explained.away.bonus),
    pointsAutocalculated: true,
    pointsOverrideReason: '',
  };
}

function buildQuickResultForm(
  match: MatchWithClubs,
  rules: PointsRules,
  metric: SecondaryScoreMetric | null,
): QuickResultFormState {
  // `MatchScore` no tiene index signature: la cifra secundaria viaja con una
  // clave que depende del deporte, asi que se lee por indice.
  const rawScore = match.score as unknown as Record<string, unknown> | null | undefined;
  const secondaryKeys = metric ? getSecondaryScoreKeys(metric) : null;
  const readSecondary = (key: string | undefined) => {
    const value = key ? rawScore?.[key] : null;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const initialForm: QuickResultFormState = {
    status: match.status,
    homeScore: formatQuickNumber(match.score?.home, 0),
    awayScore: formatQuickNumber(match.score?.away, 0),
    homeSecondary: formatOptionalQuickNumber(readSecondary(secondaryKeys?.home)),
    awaySecondary: formatOptionalQuickNumber(readSecondary(secondaryKeys?.away)),
    homePenalties: formatOptionalQuickNumber(match.score?.penalties?.home),
    awayPenalties: formatOptionalQuickNumber(match.score?.penalties?.away),
    homeBasePoints: formatQuickNumber(match.homeBasePoints, 0),
    awayBasePoints: formatQuickNumber(match.awayBasePoints, 0),
    homeBonusPoints: formatQuickNumber(match.homeBonusPoints, 0),
    awayBonusPoints: formatQuickNumber(match.awayBonusPoints, 0),
    pointsAutocalculated: match.pointsAutocalculated ?? true,
    pointsOverrideReason: match.pointsOverrideReason ?? '',
    scheduledDate: toInputDateInTimeZone(match.dateTime, APP_TIMEZONE),
    scheduledTime: toInputTimeInTimeZone(match.dateTime, APP_TIMEZONE),
  };

  return initialForm.pointsAutocalculated
    ? applyQuickPointsAutofill(initialForm, rules, metric)
    : initialForm;
}

function getMatchTone(status: MatchStatus) {
  if (status === 'live') return 'fixture-status-live';
  if (status === 'final') return 'fixture-status-finished';
  if (status === 'scheduled') return 'fixture-status-scheduled';
  return 'fixture-status-draft';
}

function getContainerTone(round: RoundWithMatches): ManageContainer['tone'] {
  if (round.matches.length === 0) return 'empty';
  if (round.isCompleted) return 'complete';
  return 'active';
}

function buildSearchBlob(entry: ManageEntry) {
  const { match, round } = entry;
  return [
    round.name,
    match.homeClub?.name || '',
    match.homeClub?.shortName || '',
    match.awayClub?.name || '',
    match.awayClub?.shortName || '',
    match.venue || '',
    match.groupId || '',
    getStatusLabel(match.status),
  ].join(' ').toLowerCase();
}

export function TournamentOperationFixtureWorkspace({
  tournament,
  selectedPhaseId,
  onSelectPhase,
}: {
  tournament: TournamentRow;
  selectedPhaseId: string | null;
  onSelectPhase?: (phaseId: string) => void;
}) {
  // La segunda cifra del marcador sale del deporte del torneo. Rugby devuelve
  // los tries de siempre; hockey y futbol devuelven null y el campo no se pinta.
  const secondaryScoreMetric = useMemo(
    () => getSecondaryScoreMetric(tournament.sport_id),
    [tournament.sport_id],
  );
  const {
    fixture,
    isLoadingFixture,
    fixtureError,
    selectPhase,
    refreshFixture,
    generateFixture,
    generateMatches,
    validateFixture,
    saveMatch,
    saveRound,
    deleteMatch,
    deleteMatches,
  } = useFixture();
  const [activeSubtab, setActiveSubtab] = useState<WorkspaceSubtabId>('add_matches');
  const [selectedMethod, setSelectedMethod] = useState<MethodId>('manual_match');
  const [manualForm, setManualForm] = useState<ManualFormState>(() => defaultManualForm());
  const [manualErrors, setManualErrors] = useState<Record<string, string>>({});
  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);
  const [quickResultMatchId, setQuickResultMatchId] = useState<string | null>(null);
  const [quickResultForm, setQuickResultForm] = useState<QuickResultFormState | null>(null);
  const [quickResultErrors, setQuickResultErrors] = useState<Record<string, string>>({});
  /**
   * Qué editor está abierto AHORA, legible desde un `await`.
   *
   * Guardar un resultado tarda; mientras el PATCH viaja, el operador sigue
   * trabajando y abre el siguiente partido. Al volver, el handler cerraba «el
   * editor» a secas y le arrancaba de las manos el partido nuevo, a medio
   * escribir. El estado leído desde el closure es el de cuando se apretó
   * Guardar, no el de ahora; el ref sí es el de ahora.
   */
  const quickResultMatchIdRef = useRef<string | null>(null);
  const [structureForm, setStructureForm] = useState({ numRounds: 9, namePattern: 'Fecha {n}' });
  const [bergerForm, setBergerForm] = useState({ clubIds: [] as string[], startDate: todayInputValue(), matchTime: '16:00', venue: '', homeAndAway: false });
  const [importPreview, setImportPreview] = useState<FixtureImportPreviewResult | null>(null);
  const [validationData, setValidationData] = useState<ValidationResult>(null);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'warn' | 'error'; message: string } | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [manageSearch, setManageSearch] = useState('');
  const [manageRoundFilter, setManageRoundFilter] = useState('all');
  const [manageGroupFilter, setManageGroupFilter] = useState('all');
  const [manageStatusFilter, setManageStatusFilter] = useState<MatchStatus | 'all'>('all');
  const [manageView, setManageView] = useState<ManageViewMode>('cards');
  const [manageGrouping, setManageGrouping] = useState<ManageGroupingMode>('rounds');
  const [selectedManageMatchIds, setSelectedManageMatchIds] = useState<Set<string>>(new Set());
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [mobileInsightsOpen, setMobileInsightsOpen] = useState(false);
  const [collapsedContainerIds, setCollapsedContainerIds] = useState<Set<string>>(new Set());
  /**
   * Cuántos partidos se dibujan de cada bloque. Una fase regular de Super
   * Rugby Americas son 56 partidos sin jornada asignada: todos en un mismo
   * bloque, todos en el DOM, 11.400px de scroll en un teléfono. Trece
   * pantallas para llegar al último, y el navegador montando 56 filas con
   * cinco botones cada una antes de pintar la primera.
   *
   * No se recorta el fixture: se recorta lo que se dibuja de una, con el
   * resto a un botón que dice cuántos quedan. Es por bloque y no global
   * porque cada jornada se abre y se cierra por su cuenta.
   */
  const [manageVisibleByContainer, setManageVisibleByContainer] = useState<Record<string, number>>({});
  const [roundDraft, setRoundDraft] = useState<RoundDraftState | null>(null);
  const [availableGroups, setAvailableGroups] = useState<Array<{ id: string; name: string; phaseId: string | null; orderIndex: number | null }>>([]);
  const deferredManageSearch = useDeferredValue(manageSearch);
  const mobileInsightsSheet = useAnimatedDisclosure(mobileInsightsOpen, 180);

  useEffect(() => {
    if (selectedPhaseId) selectPhase(selectedPhaseId);
  }, [selectedPhaseId, selectPhase]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(getStorageKey(tournament.id));
    if (stored === 'add_matches' || stored === 'manage_fixture') {
      setActiveSubtab(stored);
    }
  }, [tournament.id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(getStorageKey(tournament.id), activeSubtab);
  }, [activeSubtab, tournament.id]);

  useEffect(() => {
    let cancelled = false;

    const loadGroups = async () => {
      if (!selectedPhaseId) {
        setAvailableGroups([]);
        return;
      }

      try {
        const response = await fetch(`/api/tournaments/${tournament.id}/groups?phaseId=${selectedPhaseId}`, {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();
        const nextGroups = Array.isArray(payload)
          ? payload.map((group: { id?: unknown; name?: unknown; phase_id?: unknown; order_index?: unknown }) => ({
              id: String(group.id),
              name: String(group.name || 'Grupo'),
              phaseId: typeof group.phase_id === 'string' ? group.phase_id : null,
              orderIndex: typeof group.order_index === 'number' ? group.order_index : null,
            }))
          : [];

        if (!cancelled) {
          setAvailableGroups(nextGroups);
        }
      } catch (error) {
        console.error('Error loading phase groups for fixture workspace:', error);
        if (!cancelled) {
          setAvailableGroups([]);
        }
      }
    };

    void loadGroups();

    return () => {
      cancelled = true;
    };
  }, [selectedPhaseId, tournament.id]);

  const selectedPhase = useMemo(
    () => fixture?.phases.find((phase) => phase.id === selectedPhaseId) || null,
    [fixture, selectedPhaseId],
  );
  const pointsRules = useMemo(
    () => resolvePointsRules((selectedPhase?.settings as RulesConfig | null | undefined), tournament.ruleset as RulesConfig | null | undefined),
    [selectedPhase?.settings, tournament.ruleset],
  );

  const realRounds = useMemo(
    () => (selectedPhase?.rounds || []).filter((round) => !round.id.startsWith('orphaned-')),
    [selectedPhase],
  );
  const isSelectedPhasePlayoff = selectedPhase?.phaseType === 'playoff' || selectedPhase?.phaseType === 'knockout';
  const playoffTeamsCount = Number((selectedPhase?.settings as { teamsCount?: number } | undefined)?.teamsCount || 0);
  const playoffBracketColumns = useMemo(
    () => realRounds.map((round) => ({
      round,
      matches: round.matches,
    })),
    [realRounds],
  );

  const roundDateById = useMemo(
    () => new Map(realRounds.map((round) => [round.id, round.startDate ? toInputDate(round.startDate) : ''])),
    [realRounds],
  );

  const clubOptions = useMemo(() => {
    const seen = new Set<string>();
    return (fixture?.participants || [])
      .filter((participant) => participant.clubId && !seen.has(participant.clubId))
      .map((participant) => {
        seen.add(participant.clubId as string);
        return { value: participant.clubId as string, label: participant.name };
      });
  }, [fixture?.participants]);

  const phaseMatches = useMemo(
    () => selectedPhase?.rounds.flatMap((round) => round.matches) || [],
    [selectedPhase],
  );

  const groupOptions = useMemo(() => {
    const groups = new Map<string, string>();
    availableGroups.forEach((group) => {
      groups.set(group.id, group.name);
    });
    phaseMatches.forEach((match) => {
      if (match.groupId && !groups.has(match.groupId)) {
        groups.set(match.groupId, `Grupo ${match.groupId.slice(0, 8)}`);
      }
    });
    return Array.from(groups, ([value, label]) => ({ value, label }));
  }, [availableGroups, phaseMatches]);

  const groupLabelById = useMemo(
    () => new Map(groupOptions.map((group) => [group.value, group.label])),
    [groupOptions],
  );

  const getGroupLabel = useCallback(
    (groupId: string | null | undefined) => formatGroupLabel(groupId, groupLabelById),
    [groupLabelById],
  );

  const manageEntries = useMemo<ManageEntry[]>(
    () => selectedPhase?.rounds.flatMap((round) => round.matches.map((match) => ({ match, round }))) || [],
    [selectedPhase],
  );

  const summary = useMemo(() => {
    const realRoundIds = new Set(realRounds.map((round) => round.id));
    return {
      matchesPlayed: phaseMatches.filter((match) => match.status === 'final').length,
      matchesPending: phaseMatches.filter((match) => match.status !== 'final').length,
      // Un partido sin jornada es el que no cayó en ninguna ronda real: vive en
      // la ronda huérfana que arma el endpoint para los que no tienen round_id.
      matchesOrphan: phaseMatches.filter((match) => !match.roundId || !realRoundIds.has(match.roundId)).length,
      matchesUndated: phaseMatches.filter((match) => !match.dateTime).length,
      roundsCreated: realRounds.length,
      roundsEmpty: realRounds.filter((round) => round.matches.length === 0).length,
    };
  }, [phaseMatches, realRounds]);

  const structuralChecks = useMemo(() => {
    const phaseConfigured = Boolean(selectedPhaseId && selectedPhase);
    const teamsReady = clubOptions.length >= 2;
    const groupsReady = selectedPhase?.phaseType !== 'group_stage' || groupOptions.length > 0 || phaseMatches.length === 0;
    const calendarReady = validationData?.isValid ?? (phaseMatches.length === 0 || phaseMatches.every((match) => Boolean(match.dateTime)));

    return [
      { label: 'Fase configurada', ok: phaseConfigured, description: phaseConfigured ? `Trabajando sobre ${selectedPhase?.name || 'la fase actual'}.` : 'Selecciona una fase para operar.' },
      { label: 'Equipos disponibles', ok: teamsReady, description: teamsReady ? `${clubOptions.length} clubes listos para programar.` : 'Necesitas al menos dos equipos activos.' },
      { label: 'Grupos validos', ok: groupsReady, description: groupsReady ? 'La estructura de grupos no bloquea la carga.' : 'La fase por grupos no tiene referencias detectadas.' },
      { label: 'Calendario valido', ok: calendarReady, description: calendarReady ? 'No hay conflictos duros detectados.' : 'Revisa cruces o jornadas antes de publicar.' },
    ];
  }, [clubOptions.length, groupOptions.length, phaseMatches, selectedPhase, selectedPhaseId, validationData]);

  useEffect(() => {
    if (clubOptions.length > 0 && bergerForm.clubIds.length === 0) {
      setBergerForm((current) => ({ ...current, clubIds: clubOptions.map((club) => club.value) }));
    }
  }, [bergerForm.clubIds.length, clubOptions]);

  useEffect(() => {
    let cancelled = false;
    const runValidation = async () => {
      const result = (await validateFixture()) as ValidationResult;
      if (!cancelled) setValidationData(result);
    };
    void runValidation();
    return () => {
      cancelled = true;
    };
  }, [fixture, selectedPhaseId, validateFixture]);

  useEffect(() => {
    setManualForm((current) => {
      if (isSelectedPhasePlayoff) {
        const firstRoundId = realRounds[0]?.id || '';
        return {
          ...current,
          roundMode: 'existing',
          roundId: realRounds.some((round) => round.id === current.roundId) ? current.roundId : firstRoundId,
          roundLabel: '',
          matchDate: current.roundId ? current.matchDate : (roundDateById.get(firstRoundId) || current.matchDate),
        };
      }
      if (realRounds.length === 0) {
        return { ...current, roundMode: 'new', roundId: '', roundLabel: current.roundLabel || 'Fecha 1' };
      }
      if (current.roundMode === 'existing' && !realRounds.some((round) => round.id === current.roundId)) {
        const firstRoundId = realRounds[0]?.id || '';
        return { ...current, roundId: firstRoundId, matchDate: roundDateById.get(firstRoundId) || '' };
      }
      return current;
    });
  }, [isSelectedPhasePlayoff, realRounds, roundDateById]);

  useEffect(() => {
    setManualForm((current) => {
      if (!current.groupId) return current;
      return groupOptions.some((group) => group.value === current.groupId)
        ? current
        : { ...current, groupId: '' };
    });
  }, [groupOptions]);

  const filteredManageEntries = useMemo(() => {
    const normalizedQuery = deferredManageSearch.trim().toLowerCase();
    return manageEntries.filter((entry) => {
      if (manageGrouping === 'orphans' && !entry.round.id.startsWith('orphaned-')) return false;
      if (manageGrouping !== 'orphans' && manageRoundFilter !== 'all' && entry.round.id !== manageRoundFilter) return false;
      if (manageGroupFilter !== 'all') {
        if (manageGroupFilter === 'none' && entry.match.groupId) return false;
        if (manageGroupFilter !== 'none' && entry.match.groupId !== manageGroupFilter) return false;
      }
      if (manageStatusFilter !== 'all' && entry.match.status !== manageStatusFilter) return false;
      if (normalizedQuery && !buildSearchBlob(entry).includes(normalizedQuery)) return false;
      return true;
    });
  }, [deferredManageSearch, manageEntries, manageGroupFilter, manageGrouping, manageRoundFilter, manageStatusFilter]);

  const manageContainers = useMemo<ManageContainer[]>(() => {
    if (!selectedPhase) return [];

    if (manageGrouping === 'groups') {
      const map = new Map<string, ManageContainer>();
      filteredManageEntries.forEach((entry) => {
        const key = entry.match.groupId || 'none';
        const title = entry.match.groupId
          ? getGroupLabel(entry.match.groupId)
          : 'Sin grupo';
        const current = map.get(key);
        if (current) {
          current.matches.push(entry);
          return;
        }
        map.set(key, {
          id: `group-${key}`,
          title,
          subtitle: 'Partidos agrupados por grupo',
          matches: [entry],
          roundId: null,
          editable: false,
          tone: 'active',
        });
      });
      return Array.from(map.values()).sort((left, right) => left.title.localeCompare(right.title, 'es'));
    }

    const sourceRounds = manageGrouping === 'orphans'
      ? selectedPhase.rounds.filter((round) => round.id.startsWith('orphaned-'))
      : selectedPhase.rounds;

    const hasFilters = deferredManageSearch.trim() || manageRoundFilter !== 'all' || manageGroupFilter !== 'all' || manageStatusFilter !== 'all' || manageGrouping !== 'rounds';

    return sourceRounds
      .filter((round) => manageGrouping === 'orphans' || manageRoundFilter === 'all' || round.id === manageRoundFilter)
      .map((round) => ({
        id: round.id,
        title: round.name,
        subtitle: round.startDate ? `${formatLongDateLabel(round.startDate)} · ${round.matches.length} partidos` : `${round.matches.length} partidos · Sin fecha general`,
        matches: filteredManageEntries.filter((entry) => entry.round.id === round.id),
        roundId: round.id.startsWith('orphaned-') ? null : round.id,
        editable: !round.id.startsWith('orphaned-'),
        tone: getContainerTone(round),
      }))
      .filter((container) => !hasFilters || manageRoundFilter !== 'all' || container.matches.length > 0 || container.roundId !== null);
  }, [deferredManageSearch, filteredManageEntries, getGroupLabel, manageGroupFilter, manageGrouping, manageRoundFilter, manageStatusFilter, selectedPhase]);

  const activeFilterCount = useMemo(
    () => [
      manageSearch.trim() ? 1 : 0,
      manageRoundFilter !== 'all' ? 1 : 0,
      manageGroupFilter !== 'all' ? 1 : 0,
      manageStatusFilter !== 'all' ? 1 : 0,
      manageGrouping !== 'rounds' ? 1 : 0,
    ].reduce((sum, value) => sum + value, 0),
    [manageGroupFilter, manageGrouping, manageRoundFilter, manageSearch, manageStatusFilter],
  );

  const selectedPhaseMatchCount = useMemo(
    () => selectedPhase?.rounds.reduce((sum, round) => sum + round.matches.length, 0) || 0,
    [selectedPhase],
  );
  const visibleManageMatchIds = useMemo(
    () => filteredManageEntries.map((entry) => entry.match.id),
    [filteredManageEntries],
  );
  const visibleSelectedManageMatchIds = useMemo(
    () => visibleManageMatchIds.filter((matchId) => selectedManageMatchIds.has(matchId)),
    [selectedManageMatchIds, visibleManageMatchIds],
  );
  const allVisibleManageMatchesSelected = visibleManageMatchIds.length > 0 && visibleSelectedManageMatchIds.length === visibleManageMatchIds.length;

  const orphanMatchCount = useMemo(
    () => selectedPhase?.rounds
      .filter((round) => round.id.startsWith('orphaned-'))
      .reduce((sum, round) => sum + round.matches.length, 0) || 0,
    [selectedPhase],
  );

  useEffect(() => {
    setMobileInsightsOpen(false);
  }, [activeSubtab, selectedMethod, selectedPhaseId]);

  // El espejo del editor abierto. Un solo lugar lo escribe, así que da igual
  // por cuál de los seis caminos se haya cerrado o cambiado.
  useEffect(() => {
    quickResultMatchIdRef.current = quickResultMatchId;
  }, [quickResultMatchId]);

  useEffect(() => {
    if (activeSubtab !== 'manage_fixture') {
      setQuickResultMatchId(null);
      setQuickResultForm(null);
      setQuickResultErrors({});
    }
  }, [activeSubtab, selectedPhaseId]);

  useEffect(() => {
    const currentPhaseMatchIds = new Set(phaseMatches.map((match) => match.id));
    setSelectedManageMatchIds((current) => {
      const next = new Set(Array.from(current).filter((matchId) => currentPhaseMatchIds.has(matchId)));
      return next.size === current.size ? current : next;
    });
  }, [phaseMatches]);

  const setManualField = <K extends keyof ManualFormState>(field: K, value: ManualFormState[K]) => {
    setManualForm((current) => {
      if (field === 'roundMode') {
        const nextMode = value as ManualFormState['roundMode'];
        return { ...current, roundMode: nextMode, matchDate: nextMode === 'existing' ? roundDateById.get(current.roundId) || '' : current.matchDate };
      }
      if (field === 'roundId') {
        const nextRoundId = value as string;
        return { ...current, roundId: nextRoundId, matchDate: roundDateById.get(nextRoundId) || '' };
      }
      return { ...current, [field]: value };
    });
    setManualErrors((current) => {
      if (!current[field as string]) return current;
      const next = { ...current };
      delete next[field as string];
      return next;
    });
  };

  const resetManualForm = (overrides?: Partial<ManualFormState>) => {
    const firstRoundId = realRounds[0]?.id || '';
    const nextRoundMode = overrides?.roundMode ?? (realRounds.length > 0 ? 'existing' : 'new');
    const nextRoundId = overrides?.roundId ?? firstRoundId;
    setManualForm({
      ...defaultManualForm(),
      roundMode: nextRoundMode,
      roundId: nextRoundId,
      roundLabel: realRounds.length > 0 ? '' : 'Fecha 1',
      matchDate: overrides?.matchDate ?? (nextRoundMode === 'existing' ? roundDateById.get(nextRoundId) || '' : ''),
      ...overrides,
    });
    setManualErrors({});
    setEditingMatchId(null);
  };

  const openManualCreate = (overrides?: Partial<ManualFormState>) => {
    setActiveSubtab('add_matches');
    setSelectedMethod('manual_match');
    resetManualForm(overrides);
    setFeedback(null);
  };

  const openEditMatch = (match: MatchWithClubs, mode: 'edit' | 'move') => {
    setActiveSubtab('add_matches');
    setSelectedMethod('manual_match');
    setEditingMatchId(match.id);
    setManualErrors({});
    setFeedback(mode === 'move' ? { tone: 'warn', message: 'Cambia la jornada y guarda para mover el partido.' } : null);
    setManualForm({
      roundMode: match.roundId ? 'existing' : 'new',
      roundId: match.roundId || '',
      roundLabel: match.roundId ? '' : match.roundLabel || '',
      groupId: match.groupId || '',
      homeClubId: match.homeClubId || '',
      awayClubId: match.awayClubId || '',
      matchDate: toInputDate(match.dateTime),
      matchTime: toInputTime(match.dateTime),
      venue: match.venue || '',
      status: match.status,
    });
  };

  const openDuplicateMatch = (match: MatchWithClubs) => {
    setActiveSubtab('add_matches');
    setSelectedMethod('manual_match');
    setEditingMatchId(null);
    setManualErrors({});
    setFeedback({ tone: 'ok', message: 'Revisa los datos y guarda para confirmar la copia.' });
    setManualForm({
      roundMode: match.roundId ? 'existing' : 'new',
      roundId: match.roundId || '',
      roundLabel: match.roundId ? '' : match.roundLabel || '',
      groupId: match.groupId || '',
      homeClubId: match.homeClubId || '',
      awayClubId: match.awayClubId || '',
      matchDate: toInputDate(match.dateTime),
      matchTime: toInputTime(match.dateTime),
      venue: match.venue || '',
      status: match.status,
    });
  };

  const openRoundEditor = (round: RoundWithMatches) => {
    if (round.id.startsWith('orphaned-')) return;
    setRoundDraft({
      id: round.id,
      name: round.name,
      startDate: toInputDate(round.startDate),
      endDate: toInputDate(round.endDate),
      notes: round.notes || '',
    });
  };

  const openQuickResultEditor = (match: MatchWithClubs) => {
    setQuickResultErrors({});
    setFeedback(null);
    if (quickResultMatchId === match.id) {
      setQuickResultMatchId(null);
      setQuickResultForm(null);
      return;
    }
    setQuickResultMatchId(match.id);
    setQuickResultForm(buildQuickResultForm(match, pointsRules, secondaryScoreMetric));
  };

  // Todo lo que el reglamento usa para puntuar. Al tocar cualquiera de estos
  // campos, los puntos se vuelven a calcular en el acto —salvo que estén
  // corregidos a mano, en cuyo caso se respeta lo escrito.
  const SCORING_FIELDS: Array<keyof QuickResultFormState> = [
    'status', 'homeScore', 'awayScore', 'homeSecondary', 'awaySecondary', 'homePenalties', 'awayPenalties',
  ];

  const setQuickResultField = <K extends keyof QuickResultFormState>(field: K, value: QuickResultFormState[K]) => {
    setQuickResultForm((current) => {
      if (!current) return current;
      const next = { ...current, [field]: value };
      if ((field === 'status' || field === 'homeScore' || field === 'awayScore') && !shouldShowPenaltyFields(next)) {
        next.homePenalties = '';
        next.awayPenalties = '';
      }
      if (SCORING_FIELDS.includes(field) && next.pointsAutocalculated) {
        return applyQuickPointsAutofill(next, pointsRules, secondaryScoreMetric);
      }
      return next;
    });
    setQuickResultErrors((current) => {
      if (!current[field as string]) return current;
      const next = { ...current };
      delete next[field as string];
      return next;
    });
  };

  const setQuickPointsField = (
    field: 'homeBasePoints' | 'awayBasePoints' | 'homeBonusPoints' | 'awayBonusPoints' | 'pointsOverrideReason',
    value: string,
  ) => {
    setQuickResultForm((current) => {
      if (!current) return current;
      return {
        ...current,
        [field]: value,
        pointsAutocalculated: false,
      };
    });
    setQuickResultErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const autofillQuickPoints = () => {
    setQuickResultForm((current) => {
      if (!current) return current;
      return applyQuickPointsAutofill({ ...current, pointsAutocalculated: true }, pointsRules, secondaryScoreMetric);
    });
    setQuickResultErrors((current) => {
      const next = { ...current };
      delete next.homeBasePoints;
      delete next.awayBasePoints;
      delete next.homeBonusPoints;
      delete next.awayBonusPoints;
      return next;
    });
  };

  const validateQuickResultForm = () => {
    if (!quickResultForm) return false;
    const nextErrors: Record<string, string> = {};
    const homeScore = Number.parseInt(quickResultForm.homeScore, 10);
    const awayScore = Number.parseInt(quickResultForm.awayScore, 10);

    if (!Number.isFinite(homeScore) || homeScore < 0) nextErrors.homeScore = 'Ingresa un marcador local valido.';
    if (!Number.isFinite(awayScore) || awayScore < 0) nextErrors.awayScore = 'Ingresa un marcador visitante valido.';

    if (shouldShowPenaltyFields(quickResultForm)) {
      const homePenalties = parseOptionalQuickNumber(quickResultForm.homePenalties);
      const awayPenalties = parseOptionalQuickNumber(quickResultForm.awayPenalties);
      const hasOnePenalty = homePenalties !== null || awayPenalties !== null;

      if (hasOnePenalty && homePenalties === null) nextErrors.homePenalties = 'Completa los penales del local o deja ambos vacios.';
      if (hasOnePenalty && awayPenalties === null) nextErrors.awayPenalties = 'Completa los penales del visitante o deja ambos vacios.';
    }

    if (quickResultForm.status === 'final') {
      const homeBasePoints = parseQuickPointNumber(quickResultForm.homeBasePoints, Number.NaN);
      const awayBasePoints = parseQuickPointNumber(quickResultForm.awayBasePoints, Number.NaN);

      if (!Number.isFinite(homeBasePoints) || homeBasePoints < 0) nextErrors.homeBasePoints = 'Los puntos base del local deben ser 0 o mas.';
      if (!Number.isFinite(awayBasePoints) || awayBasePoints < 0) nextErrors.awayBasePoints = 'Los puntos base del visitante deben ser 0 o mas.';
      if (!Number.isFinite(parseQuickPointNumber(quickResultForm.homeBonusPoints, Number.NaN))) nextErrors.homeBonusPoints = 'Ingresa un bonus local valido.';
      if (!Number.isFinite(parseQuickPointNumber(quickResultForm.awayBonusPoints, Number.NaN))) nextErrors.awayBonusPoints = 'Ingresa un bonus visitante valido.';

      // El motivo de una corrección de puntos NO bloquea el guardado. Sirve para
      // que dentro de tres meses se sepa de dónde salió ese punto, pero cargar
      // una fecha entera no puede depender de escribir cuarenta frases: el
      // operador que está apurado termina poniendo "correccion" en todas y el
      // campo miente igual. Queda como campo opcional y a la vista.
    }

    setQuickResultErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const validateManualForm = () => {
    const nextErrors: Record<string, string> = {};
    if (!selectedPhaseId) nextErrors.phase = 'Debes seleccionar una fase.';
    if (!manualForm.homeClubId) nextErrors.homeClubId = 'Selecciona el equipo local.';
    if (!manualForm.awayClubId) nextErrors.awayClubId = 'Selecciona el equipo visitante.';
    if (manualForm.homeClubId && manualForm.awayClubId && manualForm.homeClubId === manualForm.awayClubId) {
      nextErrors.awayClubId = 'Local y visitante no pueden ser el mismo club.';
    }
    if (!manualForm.matchDate) nextErrors.matchDate = 'Debes seleccionar una fecha para el partido.';
    if (isSelectedPhasePlayoff && !manualForm.roundId) nextErrors.roundId = 'Selecciona una etapa de eliminacion.';
    if (!isSelectedPhasePlayoff && manualForm.roundMode === 'existing' && realRounds.length > 0 && !manualForm.roundId) nextErrors.roundId = 'Selecciona una jornada.';
    setManualErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const afterMutation = async (message: string, tone: 'ok' | 'warn' | 'error' = 'ok') => {
    setValidationData((await validateFixture()) as ValidationResult);
    setFeedback({ tone, message });
  };

  const handleQuickResultSave = async (match: MatchWithClubs) => {
    if (!quickResultForm || !validateQuickResultForm()) return;
    setBusyAction(`quick-save-${match.id}`);
    setFeedback(null);
    try {
      const homeScore = Math.max(0, parseQuickNumber(quickResultForm.homeScore));
      const awayScore = Math.max(0, parseQuickNumber(quickResultForm.awayScore));
      const isFinal = quickResultForm.status === 'final';
      const penaltiesVisible = shouldShowPenaltyFields(quickResultForm);
      const homePenalties = penaltiesVisible ? parseOptionalQuickNumber(quickResultForm.homePenalties) : null;
      const awayPenalties = penaltiesVisible ? parseOptionalQuickNumber(quickResultForm.awayPenalties) : null;
      // La cifra secundaria va al marcador, que es donde el motor de bonus la
      // busca (`countTeamEventMetric` lee `score.homeTries` cuando no hay
      // eventos). Vacío se guarda como null: "no lo sé" no es "cero".
      // Si el deporte no tiene cifra secundaria, no se escribe nada.
      const secondaryKeys = secondaryScoreMetric ? getSecondaryScoreKeys(secondaryScoreMetric) : null;
      const homeSecondary = secondaryKeys ? parseOptionalQuickNumber(quickResultForm.homeSecondary) : null;
      const awaySecondary = secondaryKeys ? parseOptionalQuickNumber(quickResultForm.awaySecondary) : null;

      // El horario se manda SÓLO si lo tocaron.
      //
      // El formulario nace con la fecha y la hora del partido ya puestas, así
      // que la condición «hay fecha y hora» es verdadera siempre y el PATCH
      // venía llevando `dateTime` en cada resultado cargado, aunque nadie
      // hubiera abierto «Editar horario». Eso costaba dos cosas: un UPDATE
      // extra por guardado (`scheduleEdited` en `FixtureService.updateMatch`
      // dispara la escritura de `scheduling_status`), y —peor— dejaba marcado
      // como `manual` a todo partido de cuadro cuyo resultado se cargara, que
      // es la marca que le pide al reprogramador automático de la fase que no
      // lo toque. Cargar resultados iba sacando el cuadro del auto-armado sin
      // que nadie lo decidiera.
      //
      // La comparación va contra los mismos campos con los que `buildQuickResultForm`
      // sembró el formulario: si siguen iguales, el horario no se tocó.
      const scheduleUntouched =
        quickResultForm.scheduledDate === toInputDateInTimeZone(match.dateTime, APP_TIMEZONE) &&
        quickResultForm.scheduledTime === toInputTimeInTimeZone(match.dateTime, APP_TIMEZONE);
      const newDateTime = quickResultForm.scheduledDate && quickResultForm.scheduledTime && !scheduleUntouched
        ? combineLocalDateTimeToUtcIso(quickResultForm.scheduledDate, quickResultForm.scheduledTime, APP_TIMEZONE)
        : undefined;

      await saveMatch({
        id: match.id,
        status: quickResultForm.status,
        score: {
          home: homeScore,
          away: awayScore,
          ...(secondaryKeys
            ? { [secondaryKeys.home]: homeSecondary, [secondaryKeys.away]: awaySecondary }
            : {}),
          ...(homePenalties !== null && awayPenalties !== null
            ? { penalties: { home: homePenalties, away: awayPenalties } }
            : {}),
        },
        homeBasePoints: isFinal ? Math.max(0, parseQuickPointNumber(quickResultForm.homeBasePoints)) : 0,
        awayBasePoints: isFinal ? Math.max(0, parseQuickPointNumber(quickResultForm.awayBasePoints)) : 0,
        homeBonusPoints: isFinal ? parseQuickPointNumber(quickResultForm.homeBonusPoints) : 0,
        awayBonusPoints: isFinal ? parseQuickPointNumber(quickResultForm.awayBonusPoints) : 0,
        pointsAutocalculated: isFinal ? quickResultForm.pointsAutocalculated : true,
        pointsOverrideReason: isFinal && !quickResultForm.pointsAutocalculated
          ? quickResultForm.pointsOverrideReason.trim() || null
          : null,
        ...(newDateTime ? { dateTime: newDateTime } : {}),
      });
      // Cerramos el editor SÓLO si sigue siendo el de este partido. Si el
      // operador ya pasó al siguiente mientras el PATCH viajaba, el suyo se
      // queda abierto con lo que llevaba escrito.
      if (quickResultMatchIdRef.current === match.id) {
        setQuickResultMatchId(null);
        setQuickResultForm(null);
        setQuickResultErrors({});
      }
      setFeedback({ tone: 'ok', message: 'Resultado y puntos guardados.' });
      void validateFixture()
        .then((result) => setValidationData(result as ValidationResult))
        .catch((error) => {
          console.error('Error validating fixture after quick save:', error);
        });
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudo guardar el resultado rapido.' });
    } finally {
      // Sólo suelto el testigo si sigue siendo mío. `busyAction` es un lugar
      // solo para todo el workspace: si mientras este PATCH viajaba el operador
      // ya mandó a guardar el partido siguiente, un `setBusyAction(null)` a
      // secas le apagaría el spinner y le reactivaría el botón a un guardado
      // que todavía está en el aire — con el doble envío servido.
      setBusyAction((current) => (current === `quick-save-${match.id}` ? null : current));
    }
  };

  const handleManualSave = async (keepWorking: boolean) => {
    if (!validateManualForm() || !selectedPhaseId) return;
    setBusyAction(keepWorking ? 'manual-continue' : 'manual-save');
    setFeedback(null);
    try {
      await saveMatch({
        id: editingMatchId || undefined,
        phaseId: selectedPhaseId,
        roundId: manualForm.roundMode === 'existing' ? manualForm.roundId || null : null,
        roundLabel: manualForm.roundMode === 'new' ? manualForm.roundLabel.trim() : undefined,
        groupId: manualForm.groupId || null,
        homeClubId: manualForm.homeClubId,
        awayClubId: manualForm.awayClubId,
        dateTime: buildDateTime(manualForm.matchDate, manualForm.matchTime),
        venue: manualForm.venue,
        status: manualForm.status,
      });
      await afterMutation(editingMatchId ? 'Partido actualizado.' : 'Partido creado.');
      if (editingMatchId) {
        setEditingMatchId(null);
      } else if (keepWorking) {
        setManualForm((current) => ({ ...current, homeClubId: '', awayClubId: '', venue: '', matchTime: '', status: 'scheduled' }));
      } else {
        resetManualForm({ roundMode: manualForm.roundMode, roundId: manualForm.roundId, roundLabel: manualForm.roundLabel, groupId: manualForm.groupId });
      }
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudo guardar el partido.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleGenerateStructure = async () => {
    if (!selectedPhaseId) return;
    setBusyAction('structure');
    setFeedback(null);
    const ok = await generateFixture(structureForm);
    if (ok) {
      await afterMutation(isSelectedPhasePlayoff ? 'Se armo el cuadro playoff.' : 'Se genero la estructura base.');
      openManualCreate({ roundMode: 'existing', roundId: '' });
    } else {
      setFeedback({ tone: 'error', message: isSelectedPhasePlayoff ? 'No se pudo armar el cuadro playoff.' : 'No se pudieron generar las jornadas.' });
    }
    setBusyAction(null);
  };

  const handleGenerateBerger = async () => {
    if (!selectedPhaseId || bergerForm.clubIds.length < 2) {
      setFeedback({ tone: 'warn', message: 'Selecciona al menos dos clubes para generar cruces.' });
      return;
    }
    setBusyAction('berger');
    setFeedback(null);
    try {
      const ok = await generateMatches({ phaseId: selectedPhaseId, ...bergerForm });
      if (ok) {
        await afterMutation('Los cruces Berger quedaron cargados.');
        setActiveSubtab('manage_fixture');
      } else {
        setFeedback({ tone: 'error', message: 'No se pudieron generar los cruces.' });
      }
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudo ejecutar Berger.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDeleteMatch = async (match: MatchWithClubs) => {
    if (!window.confirm(`Eliminar ${match.homeClub?.name || 'Local'} vs ${match.awayClub?.name || 'Visitante'}?`)) return;
    setBusyAction(`delete-${match.id}`);
    setFeedback(null);
    try {
      await deleteMatch(match.id);
      setSelectedManageMatchIds((current) => {
        const next = new Set(current);
        next.delete(match.id);
        return next;
      });
      await afterMutation('El partido fue eliminado.');
      if (quickResultMatchId === match.id) {
        setQuickResultMatchId(null);
        setQuickResultForm(null);
        setQuickResultErrors({});
      }
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudo eliminar el partido.' });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleManageMatchSelection = (matchId: string) => {
    setSelectedManageMatchIds((current) => {
      const next = new Set(current);
      if (next.has(matchId)) next.delete(matchId);
      else next.add(matchId);
      return next;
    });
  };

  const toggleSelectAllVisibleManageMatches = () => {
    setSelectedManageMatchIds((current) => {
      const next = new Set(current);
      if (allVisibleManageMatchesSelected) {
        visibleManageMatchIds.forEach((matchId) => next.delete(matchId));
      } else {
        visibleManageMatchIds.forEach((matchId) => next.add(matchId));
      }
      return next;
    });
  };

  const handleBulkDeleteMatches = async () => {
    if (selectedManageMatchIds.size === 0) return;
    if (!window.confirm(`Eliminar ${selectedManageMatchIds.size} partidos seleccionados? Esta accion no se puede deshacer.`)) return;

    const selectedIds = Array.from(selectedManageMatchIds);
    const totalSelected = selectedIds.length;
    setBusyAction('delete-selected');
    setFeedback(null);
    try {
      await deleteMatches(selectedIds);
      setSelectedManageMatchIds(new Set());
      if (quickResultMatchId && selectedIds.includes(quickResultMatchId)) {
        setQuickResultMatchId(null);
        setQuickResultForm(null);
        setQuickResultErrors({});
      }
      setValidationData((await validateFixture()) as ValidationResult);
      setFeedback({ tone: 'warn', message: `${totalSelected} partidos eliminados.` });
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudieron eliminar los partidos seleccionados.' });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRoundSave = async () => {
    if (!roundDraft) return;
    setBusyAction(`round-${roundDraft.id}`);
    setFeedback(null);
    try {
      await saveRound(roundDraft.id, {
        name: roundDraft.name,
        startDate: roundDraft.startDate || null,
        endDate: roundDraft.endDate || null,
        notes: roundDraft.notes || null,
      });
      await afterMutation('La jornada fue actualizada.');
      setRoundDraft(null);
    } catch (error) {
      setFeedback({ tone: 'error', message: error instanceof Error ? error.message : 'No se pudo guardar la jornada.' });
    } finally {
      setBusyAction(null);
    }
  };

  const toggleContainer = (containerId: string) => {
    setCollapsedContainerIds((current) => {
      const next = new Set(current);
      if (next.has(containerId)) next.delete(containerId);
      else next.add(containerId);
      return next;
    });
  };

  const revealMoreMatches = (containerId: string, total: number) => {
    setManageVisibleByContainer((current) => ({
      ...current,
      [containerId]: Math.min(total, (current[containerId] ?? MANAGE_PAGE_SIZE) + MANAGE_PAGE_SIZE),
    }));
  };

  const revealAllMatches = (containerId: string, total: number) => {
    setManageVisibleByContainer((current) => ({ ...current, [containerId]: total }));
  };

  if (!fixture) {
    if (fixtureError && !isLoadingFixture) {
      return (
        <section className="operation-fixture-loading">
          <AlertTriangle size={22} />
          <div className="flex flex-col items-center gap-3 text-center">
            <strong>No se pudo cargar el workspace de fixture.</strong>
            <p className="text-sm text-dim max-w-xl">{fixtureError}</p>
            <button type="button" className="basalt-btn basalt-btn-primary" onClick={() => void refreshFixture()}>
              <RefreshCw size={15} />
              Reintentar
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="operation-fixture-loading">
        <Loader2 size={22} className="spin" />
        <span>Cargando workspace de fixture...</span>
      </section>
    );
  }

  const activeMeta = WORKSPACE_SUBTABS.find((item) => item.id === activeSubtab) || WORKSPACE_SUBTABS[0];
  const mobileInsightsSummary = activeSubtab === 'manage_fixture'
    ? `${filteredManageEntries.length} partidos visibles${activeFilterCount > 0 ? ` · ${activeFilterCount} filtros` : ''}`
    : `${summary.roundsCreated} jornadas · ${summary.matchesPending} pendientes`;

  const renderSidebarContent = () => (
    <>
      <section className="operation-side-panel basalt-card">
        <div className="operation-fixture-panel-head">
          <div>
            <span className="operation-fixture-kicker">Resumen</span>
            <h4>Estado de la fase</h4>
          </div>
        </div>
        {/* Las cifras dicen lo que pasó, no un estado interno.
            «Partidos listos» contaba sólo los `scheduled` con todo cargado: en
            un torneo terminado marcaba 0 con 56 partidos jugados, y se leía
            como "no hay nada". Ahora habla el mismo idioma que la barra de
            arriba, y todo se deriva de los partidos de la fase. */}
        <div className="operation-summary-grid">
          <div className="operation-summary-card"><span>Jugados</span><strong>{summary.matchesPlayed}</strong></div>
          <div className="operation-summary-card"><span>Por jugar</span><strong>{summary.matchesPending}</strong></div>
          <div className="operation-summary-card"><span>Sin jornada</span><strong>{summary.matchesOrphan}</strong></div>
          <div className="operation-summary-card"><span>Sin fecha</span><strong>{summary.matchesUndated}</strong></div>
        </div>
      </section>

      {activeSubtab === 'manage_fixture' ? (
        <section className="operation-side-panel basalt-card">
          <div className="operation-fixture-panel-head">
            <div>
              <span className="operation-fixture-kicker">Vista actual</span>
              <h4>Gestion sobre el fixture</h4>
            </div>
          </div>
          <div className="operation-summary-grid">
            <div className="operation-summary-card"><span>Partidos visibles</span><strong>{filteredManageEntries.length}</strong></div>
            <div className="operation-summary-card"><span>Bloques visibles</span><strong>{manageContainers.length}</strong></div>
            <div className="operation-summary-card"><span>Filtros activos</span><strong>{activeFilterCount}</strong></div>
            <div className="operation-summary-card"><span>Vista</span><strong>{manageView === 'cards' ? 'Cards' : 'Lista'}</strong></div>
          </div>
        </section>
      ) : null}

      <section className="operation-side-panel basalt-card">
        <div className="operation-fixture-panel-head">
          <div>
            <span className="operation-fixture-kicker">Chequeo estructural</span>
            <h4>Validacion de la operacion</h4>
          </div>
          <button type="button" className="basalt-btn basalt-btn-ghost" onClick={() => void afterMutation('Chequeo estructural actualizado.', 'ok')}>
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="operation-validation-list">
          {structuralChecks.map((item) => (
            <div key={item.label} className={`operation-validation-item ${item.ok ? 'tone-ok' : 'tone-warn'}`}>
              <span className="operation-validation-icon">{item.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}</span>
              <div>
                <strong>{item.label}</strong>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {activeSubtab === 'add_matches' && selectedMethod === 'import_fixture' ? (
        <section className="operation-side-panel basalt-card">
          <div className="operation-fixture-panel-head">
            <div>
              <span className="operation-fixture-kicker">Preview actual</span>
              <h4>Estado de la importacion</h4>
            </div>
          </div>
          <div className="operation-summary-grid">
            <div className="operation-summary-card"><span>Clubes vinculados</span><strong>{Math.max((importPreview?.summary.totalRows || 0) - (importPreview?.summary.unmatchedEntities || 0), 0)}</strong></div>
            <div className="operation-summary-card"><span>Clubes sin match</span><strong>{importPreview?.summary.unmatchedEntities || 0}</strong></div>
            <div className="operation-summary-card"><span>Duplicados</span><strong>{importPreview?.summary.duplicateRows || 0}</strong></div>
            <div className="operation-summary-card"><span>Filas invalidas</span><strong>{importPreview?.summary.errorRows || 0}</strong></div>
          </div>
        </section>
      ) : null}

      {activeSubtab === 'manage_fixture' && roundDraft ? (
        <section className="operation-side-panel basalt-card">
          <div className="operation-fixture-panel-head">
            <div>
              <span className="operation-fixture-kicker">Editar jornada</span>
              <h4>Ajustes rapidos</h4>
            </div>
          </div>
          <div className="operation-form-grid">
            <label className="operation-form-field operation-form-field-span-2">
              <span>Nombre</span>
              <input className="basalt-input" type="text" value={roundDraft.name} onChange={(event) => setRoundDraft((current) => current ? { ...current, name: event.target.value } : current)} />
            </label>
            <label className="operation-form-field">
              <span>Fecha inicial</span>
              <input className="basalt-input" type="date" value={roundDraft.startDate} onChange={(event) => setRoundDraft((current) => current ? { ...current, startDate: event.target.value } : current)} />
            </label>
            <label className="operation-form-field">
              <span>Fecha final</span>
              <input className="basalt-input" type="date" value={roundDraft.endDate} onChange={(event) => setRoundDraft((current) => current ? { ...current, endDate: event.target.value } : current)} />
            </label>
          </div>
          <div className="operation-inline-actions">
            <button type="button" className="basalt-btn" onClick={() => setRoundDraft(null)}>Cancelar</button>
            <button type="button" className="basalt-btn basalt-btn-primary" disabled={busyAction === `round-${roundDraft.id}`} onClick={() => void handleRoundSave()}>
              {busyAction === `round-${roundDraft.id}` ? <RefreshCw size={15} className="spin" /> : <Pencil size={15} />}
              Guardar jornada
            </button>
          </div>
        </section>
      ) : null}

      {validationData?.diagnostics?.length ? (
        <section className="operation-side-panel basalt-card">
          <div className="operation-fixture-panel-head">
            <div>
              <span className="operation-fixture-kicker">Alertas</span>
              <h4>Diagnostico actual</h4>
            </div>
          </div>
          <div className="operation-context-list">
            {validationData.diagnostics.slice(0, 5).map((item, index) => (
              <div key={`${item.message}-${index}`} className="operation-context-row">
                <AlertTriangle size={15} />
                <span>{item.message || item.context || 'Advertencia estructural'}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );

  return (
    <div className={`operation-fixture-workspace${activeSubtab === 'manage_fixture' ? ' is-manage-full' : ''}`}>
      <div className="operation-fixture-main">
        {/* Riel del workspace: la elección de modo, qué hace ese modo y la
            única cifra propia del panel (las de la fase ya viven en la barra
            de Operación, y el nombre del torneo en el header).

            Antes eran dos piezas: un hero acristalado y, más abajo, dos
            tarjetas de 320px en un contenedor `flex-wrap`. Ese ancho mínimo
            hacía que se apilaran en cuanto la columna se angostaba —con el
            cajón de fase abierto, o en cualquier pantalla media—. El segmento
            es UNA pieza con dos botones adentro: no puede partirse de fila. */}
        <div className="op-seg-rail">
          <div className="op-seg" role="tablist" aria-label="Modo de trabajo del fixture">
            {WORKSPACE_SUBTABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={activeSubtab === tab.id}
                className="op-seg-btn"
                onClick={() => setActiveSubtab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <p className="op-seg-note">{activeMeta.description}</p>
          <div className="op-bar-figures">
            <span className="op-fig">
              <span className="op-fig-key">Jornadas</span>
              <b>{summary.roundsCreated}</b>
            </span>
          </div>
        </div>

        <section className="operation-mobile-side-trigger basalt-card" aria-label="Panel compacto de fase">
          <div className="operation-mobile-side-trigger-copy">
            <span className="operation-fixture-kicker">Panel de fase</span>
            <strong>{mobileInsightsSummary}</strong>
            <small>Resumen, chequeos y alertas sin sacar foco del flujo principal.</small>
          </div>
          <button type="button" className="basalt-btn basalt-btn-primary" onClick={() => setMobileInsightsOpen(true)}>
            <ClipboardList size={15} />
            Ver panel
          </button>
        </section>

        {feedback ? (
          <div className={`operation-feedback operation-feedback-${feedback.tone}`}>
            {feedback.tone === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            <span>{feedback.message}</span>
          </div>
        ) : null}

        {activeSubtab === 'add_matches' ? (
          <>
            <section className="operation-fixture-panel basalt-card">
              <div className="operation-fixture-panel-head">
                <div>
                  <span className="operation-fixture-kicker">Metodos</span>
                  <h4>Como quieres agregar partidos</h4>
                  <p>Selecciona una card y el panel activo se abre debajo sin salir de la sub-tab.</p>
                </div>
              </div>
              <div className="operation-method-grid">
                {METHOD_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`operation-method-card ${option.tone} ${selectedMethod === option.id ? 'is-active' : ''}`}
                      onClick={() => setSelectedMethod(option.id)}
                    >
                      <span className="operation-method-icon"><Icon size={20} /></span>
                      <div className="operation-method-copy">
                        <strong>{option.title}</strong>
                        <p>{option.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* La descripción del método ELEGIDO, una sola vez y debajo de la
                  grilla. En el teléfono cada tarjeta lleva sólo ícono y título:
                  cuatro descripciones a la vez son cuatro párrafos compitiendo
                  por una pantalla en la que todavía no se eligió nada. Acá
                  aparece la que corresponde, cuando ya hay una elección que
                  explicar. En escritorio no se muestra —ahí cada tarjeta tiene
                  ancho de sobra para la suya— y por eso vive en CSS y no en un
                  segundo bloque de JSX para mobile. */}
              <p className="operation-method-hint">
                {METHOD_OPTIONS.find((option) => option.id === selectedMethod)?.description}
              </p>
            </section>

            {selectedMethod === 'manual_match' ? (
              <section className="operation-fixture-panel basalt-card">
                <div className="operation-fixture-panel-head">
                  <div>
                    <span className="operation-fixture-kicker">Carga manual</span>
                    <h4>{editingMatchId ? 'Editar partido' : 'Crear partido manualmente'}</h4>
                    <p>El campo fecha del partido es obligatorio y queda visible junto a la hora.</p>
                  </div>
                  {editingMatchId ? (
                    <button type="button" className="basalt-btn" onClick={() => openManualCreate()}>
                      <Plus size={15} />
                      Nuevo
                    </button>
                  ) : null}
                </div>

                <div className="operation-manual-round-mode">
                  <button type="button" className={`operation-mode-chip ${manualForm.roundMode === 'existing' ? 'is-active' : ''}`} onClick={() => setManualField('roundMode', 'existing')} disabled={realRounds.length === 0}>
                    <ClipboardList size={15} />
                    <span>{isSelectedPhasePlayoff ? 'Usar etapa definida' : 'Usar jornada existente'}</span>
                  </button>
                  <button type="button" className={`operation-mode-chip ${manualForm.roundMode === 'new' ? 'is-active' : ''}`} onClick={() => setManualField('roundMode', 'new')} disabled={isSelectedPhasePlayoff}>
                    <CalendarPlus2 size={15} />
                    <span>Crear jornada rapida</span>
                  </button>
                </div>

                <div className="operation-manual-grid">
                  {manualForm.roundMode === 'existing' ? (
                    <label className="operation-form-field">
                      <span>{isSelectedPhasePlayoff ? 'Etapa de eliminacion' : 'Jornada'}</span>
                      <select className="basalt-input" value={manualForm.roundId} onChange={(event) => setManualField('roundId', event.target.value)}>
                        <option value="">{realRounds.length ? (isSelectedPhasePlayoff ? 'Selecciona una etapa' : 'Selecciona una jornada') : (isSelectedPhasePlayoff ? 'No hay etapas definidas' : 'No hay jornadas todavia')}</option>
                        {realRounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
                      </select>
                      {manualErrors.roundId ? <small className="operation-field-error">{manualErrors.roundId}</small> : null}
                    </label>
                  ) : (
                    <label className="operation-form-field">
                      <span>Nueva jornada</span>
                      <input className="basalt-input" type="text" value={manualForm.roundLabel} onChange={(event) => setManualField('roundLabel', event.target.value)} placeholder="Fecha 1" />
                      {manualErrors.roundLabel ? <small className="operation-field-error">{manualErrors.roundLabel}</small> : null}
                    </label>
                  )}

                  {/* La jornada y la zona NO se comportan igual, y el
                      formulario los dibujaba como si sí.

                      La jornada se crea escribiéndola: `findOrCreateRound` la
                      da de alta en la fase si no existe. La zona no: acá sólo
                      se ASIGNA una de las que ya están definidas en Estructura.
                      Cuando la fase no tiene ninguna, el desplegable quedaba con
                      "Sin grupo" como única opción y sin decir por qué — parecía
                      roto. Ahora se deshabilita y dice qué falta, que es el
                      estándar del gestor. */}
                  <label className="operation-form-field">
                    <span>Grupo o zona</span>
                    <select
                      className="basalt-input"
                      value={manualForm.groupId}
                      disabled={groupOptions.length === 0}
                      onChange={(event) => setManualField('groupId', event.target.value)}
                    >
                      <option value="">Sin grupo</option>
                      {groupOptions.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
                    </select>
                    {groupOptions.length === 0 ? (
                      <small className="operation-field-hint">Esta fase no tiene zonas. Se definen en Estructura.</small>
                    ) : null}
                  </label>

                  <label className="operation-form-field">
                    <span>Equipo local</span>
                    <select className="basalt-input" value={manualForm.homeClubId} onChange={(event) => setManualField('homeClubId', event.target.value)}>
                      <option value="">Selecciona el local</option>
                      {clubOptions.map((club) => <option key={club.value} value={club.value}>{club.label}</option>)}
                    </select>
                    {manualErrors.homeClubId ? <small className="operation-field-error">{manualErrors.homeClubId}</small> : null}
                  </label>

                  <label className="operation-form-field">
                    <span>Equipo visitante</span>
                    <select className="basalt-input" value={manualForm.awayClubId} onChange={(event) => setManualField('awayClubId', event.target.value)}>
                      <option value="">Selecciona el visitante</option>
                      {clubOptions.map((club) => <option key={club.value} value={club.value}>{club.label}</option>)}
                    </select>
                    {manualErrors.awayClubId ? <small className="operation-field-error">{manualErrors.awayClubId}</small> : null}
                  </label>

                  {/* Cuándo se juega es UN dato, no dos. Iban como campos
                      sueltos y la grilla los repartía donde caían —la fecha al
                      final de una fila, la hora arrancando la siguiente—, con
                      una frase debajo de cada uno repitiendo lo que ya decía el
                      rótulo. Ahora son un grupo con su propio título y sin
                      ayudas redundantes: lo único que el rótulo no dice es que
                      la hora se puede dejar vacía, y eso queda en su leyenda.

                      La fecha usa `DdMmYyyyDateField` como el resto del gestor.
                      El `<input type="date">` crudo que había acá mostraba
                      mm/dd/yyyy en cualquier sistema en inglés, sin importar el
                      lang de la página. */}
                  <div
                    className="operation-form-field operation-form-field-span-2"
                    role="group"
                    aria-labelledby="manual-when-label"
                  >
                    <span id="manual-when-label">Fecha y horario</span>
                    <div className="operation-datetime-pair">
                      <label className="operation-datetime-slot">
                        <small>Fecha</small>
                        <DdMmYyyyDateField
                          className="basalt-input"
                          value={manualForm.matchDate}
                          onChange={(iso) => setManualField('matchDate', iso)}
                        />
                      </label>
                      <label className="operation-datetime-slot">
                        <small>Hora · opcional</small>
                        <input className="basalt-input" type="time" value={manualForm.matchTime} onChange={(event) => setManualField('matchTime', event.target.value)} />
                      </label>
                    </div>
                    {manualErrors.matchDate ? <small className="operation-field-error">{manualErrors.matchDate}</small> : null}
                  </div>

                  <label className="operation-form-field">
                    <span>Sede o cancha</span>
                    <input className="basalt-input" type="text" value={manualForm.venue} onChange={(event) => setManualField('venue', event.target.value)} placeholder="Cancha 1" />
                  </label>

                  <label className="operation-form-field">
                    <span>Estado</span>
                    <select className="basalt-input" value={manualForm.status} onChange={(event) => setManualField('status', event.target.value as MatchStatus)}>
                      {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                    </select>
                  </label>
                </div>

                {manualErrors.phase ? <small className="operation-field-error">{manualErrors.phase}</small> : null}

                <div className="operation-inline-note">
                  <ShieldCheck size={16} />
                  <span>El partido quedara vinculado a la fase actual y se refrescara dentro de Gestionar fixture.</span>
                </div>

                <div className="operation-inline-actions">
                  {editingMatchId ? (
                    <>
                      <button type="button" className="basalt-btn" onClick={() => openManualCreate()}>Cancelar edicion</button>
                      <button type="button" className="basalt-btn basalt-btn-primary" disabled={busyAction === 'manual-save'} onClick={() => void handleManualSave(false)}>
                        {busyAction === 'manual-save' ? <RefreshCw size={15} className="spin" /> : <Pencil size={15} />}
                        Guardar cambios
                      </button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="basalt-btn basalt-btn-primary" disabled={busyAction === 'manual-save'} onClick={() => void handleManualSave(false)}>
                        {busyAction === 'manual-save' ? <RefreshCw size={15} className="spin" /> : <Plus size={15} />}
                        Crear partido
                      </button>
                      <button type="button" className="basalt-btn" disabled={busyAction === 'manual-continue'} onClick={() => void handleManualSave(true)}>
                        {busyAction === 'manual-continue' ? <RefreshCw size={15} className="spin" /> : <PlusCircle size={15} />}
                        Crear y agregar otro
                      </button>
                    </>
                  )}
                </div>
              </section>
            ) : null}

            {selectedMethod === 'structure_only' ? (
              <section className="operation-fixture-panel basalt-card">
                <div className="operation-fixture-panel-head">
                  <div>
                    <span className="operation-fixture-kicker">Estructura base</span>
                    <h4>{isSelectedPhasePlayoff ? 'Armar cuadro playoff' : 'Generar jornadas vacias'}</h4>
                    <p>{isSelectedPhasePlayoff ? 'Crea los partidos vacios del bracket segun los equipos y etapas definidos en la fase.' : 'Crea bloques de jornadas para completar despues desde la sub-tab de gestion.'}</p>
                  </div>
                </div>
                {isSelectedPhasePlayoff ? (
                  <div className="operation-inline-note">
                    <LayoutGrid size={16} />
                    <span>{playoffTeamsCount || 0} equipos configurados · {realRounds.length} etapas disponibles · se completaran los slots faltantes sin equipos asignados.</span>
                  </div>
                ) : (
                  <div className="operation-form-grid">
                    <label className="operation-form-field">
                      <span>Cantidad de jornadas</span>
                      <input className="basalt-input" type="number" min={1} value={structureForm.numRounds} onChange={(event) => setStructureForm((current) => ({ ...current, numRounds: Number(event.target.value) || 1 }))} />
                    </label>
                    <label className="operation-form-field">
                      <span>Patron de nombre</span>
                      <input className="basalt-input" type="text" value={structureForm.namePattern} onChange={(event) => setStructureForm((current) => ({ ...current, namePattern: event.target.value }))} placeholder="Fecha {n}" />
                    </label>
                  </div>
                )}
                <div className="operation-inline-actions">
                  <button type="button" className="basalt-btn basalt-btn-primary" disabled={busyAction === 'structure'} onClick={() => void handleGenerateStructure()}>
                    {busyAction === 'structure' ? <RefreshCw size={15} className="spin" /> : <LayoutGrid size={15} />}
                    {isSelectedPhasePlayoff ? 'Completar cuadro' : 'Generar jornadas'}
                  </button>
                </div>
              </section>
            ) : null}

            {selectedMethod === 'berger_algorithm' ? (
              <section className="operation-fixture-panel basalt-card">
                <div className="operation-fixture-panel-head">
                  <div>
                    <span className="operation-fixture-kicker">Generacion automatica</span>
                    <h4>Cruces Berger</h4>
                    <p>Selecciona clubes, fecha base y sede por defecto antes de crear el calendario.</p>
                  </div>
                </div>
                <div className="operation-team-picker">
                  {clubOptions.map((club) => {
                    const selected = bergerForm.clubIds.includes(club.value);
                    return (
                      <label key={club.value} className={`operation-team-chip ${selected ? 'is-selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => setBergerForm((current) => ({
                            ...current,
                            clubIds: selected ? current.clubIds.filter((id) => id !== club.value) : [...current.clubIds, club.value],
                          }))}
                        />
                        <span>{club.label}</span>
                      </label>
                    );
                  })}
                </div>
                <div className="operation-form-grid">
                  <label className="operation-form-field">
                    <span>Fecha de inicio</span>
                    <input className="basalt-input" type="date" value={bergerForm.startDate} onChange={(event) => setBergerForm((current) => ({ ...current, startDate: event.target.value }))} />
                  </label>
                  <label className="operation-form-field">
                    <span>Hora base</span>
                    <input className="basalt-input" type="time" value={bergerForm.matchTime} onChange={(event) => setBergerForm((current) => ({ ...current, matchTime: event.target.value }))} />
                  </label>
                  <label className="operation-form-field operation-form-field-span-2">
                    <span>Sede por defecto</span>
                    <input className="basalt-input" type="text" value={bergerForm.venue} onChange={(event) => setBergerForm((current) => ({ ...current, venue: event.target.value }))} placeholder="Sede principal" />
                  </label>
                </div>
                <label className="operation-toggle">
                  <input type="checkbox" checked={bergerForm.homeAndAway} onChange={(event) => setBergerForm((current) => ({ ...current, homeAndAway: event.target.checked }))} />
                  <span>Crear ida y vuelta</span>
                </label>
                <div className="operation-inline-actions">
                  <button type="button" className="basalt-btn basalt-btn-primary" disabled={busyAction === 'berger'} onClick={() => void handleGenerateBerger()}>
                    {busyAction === 'berger' ? <RefreshCw size={15} className="spin" /> : <WandSparkles size={15} />}
                    Generar cruces
                  </button>
                </div>
              </section>
            ) : null}

            {selectedMethod === 'import_fixture' ? (
              <section className="operation-fixture-panel basalt-card">
                <div className="operation-fixture-panel-head">
                  <div>
                    <span className="operation-fixture-kicker">Importacion guiada</span>
                    <h4>Importar fixture con preview</h4>
                    <p>La fuente se analiza primero, luego se corrige fila por fila y solo despues se confirma.</p>
                  </div>
                </div>
                <div className="operation-import-steps">
                  {IMPORT_STEPS.map((step, index) => (
                    <div key={step.id} className={`operation-import-step ${importPreview || index === 0 ? 'is-active' : ''}`}>
                      <span>{index + 1}</span>
                      <strong>{step.label}</strong>
                    </div>
                  ))}
                </div>
                <div className="operation-form-grid" style={{ marginBottom: 16 }}>
                  <label className="operation-form-field operation-form-field-span-2">
                    <span>Fase destino</span>
                    <select
                      className="basalt-input"
                      value={selectedPhaseId || ''}
                      onChange={(event) => {
                        const nextPhaseId = event.target.value;
                        setImportPreview(null);
                        selectPhase(nextPhaseId);
                        onSelectPhase?.(nextPhaseId);
                      }}
                    >
                      {(fixture?.phases || []).map((phase) => (
                        <option key={phase.id} value={phase.id}>
                          {phase.name}
                        </option>
                      ))}
                    </select>
                    <small className="operation-field-hint">
                      Todos los partidos del archivo entran acá.
                    </small>
                  </label>
                </div>
                <FixtureImportWizard
                  phaseId={selectedPhaseId || ''}
                  onBack={() => setSelectedMethod('manual_match')}
                  onPreviewChange={setImportPreview}
                  onComplete={() => {
                    void afterMutation('La importación quedó confirmada.');
                    setActiveSubtab('manage_fixture');
                  }}
                />
              </section>
            ) : null}

          </>
        ) : (
          <section className="operation-fixture-panel basalt-card operation-manage-panel">
            <div className="operation-fixture-panel-head">
              <div>
                <span className="operation-fixture-kicker">Herramientas de gestion</span>
                <h4>Vista operativa del fixture</h4>
                <p>Recupera el sistema visual por cards y evita bajar por toda la pantalla para administrar partidos.</p>
              </div>
            </div>

            {isSelectedPhasePlayoff ? (
              <div className="operation-playoff-bracket">
                <div className="operation-playoff-bracket-head">
                  <div>
                    <span className="operation-fixture-kicker">Bracket playoff</span>
                    <h4>Cuadro completo</h4>
                    <p>{playoffTeamsCount || 0} equipos configurados · {playoffBracketColumns.length} etapas</p>
                  </div>
                  <button type="button" className="basalt-btn basalt-btn-primary" disabled={busyAction === 'structure'} onClick={() => void handleGenerateStructure()}>
                    {busyAction === 'structure' ? <RefreshCw size={15} className="spin" /> : <LayoutGrid size={15} />}
                    Completar slots
                  </button>
                </div>
                <div className="operation-playoff-bracket-grid">
                  {playoffBracketColumns.map(({ round, matches }) => (
                    <section key={round.id} className="operation-playoff-round">
                      <div className="operation-playoff-round-head">
                        <strong>{round.name}</strong>
                        <span>{matches.length} partido{matches.length !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="operation-playoff-slots">
                        {matches.length > 0 ? matches.map((match, index) => (
                          <button
                            key={match.id}
                            type="button"
                            className="operation-playoff-slot"
                            onClick={() => openEditMatch(match, 'edit')}
                          >
                            <span className="operation-playoff-slot-index">#{index + 1}</span>
                            <span>{match.homeClub?.name || 'Equipo por definir'}</span>
                            <span>{match.awayClub?.name || 'Equipo por definir'}</span>
                          </button>
                        )) : (
                          <div className="operation-playoff-empty-slot">
                            <Calendar size={18} />
                            <span>Sin slots todavia</span>
                          </div>
                        )}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="operation-manage-toolbar">
              <label className="operation-manage-search">
                <Search size={16} />
                {/* El campo se muestra a 16px —abajo de eso iOS hace zoom al
                    enfocarlo— y con el ícono al lado quedan unos 28 caracteres
                    de ancho útil en un teléfono. "Buscar por equipo, sede o
                    estado..." son 34 y llegaba cortado en la mitad. */}
                <input type="search" value={manageSearch} onChange={(event) => setManageSearch(event.target.value)} placeholder="Buscar equipo, sede o estado" />
              </label>

              <div className="operation-manage-mobile-row">
                {/* El contador sale sólo cuando hay algo que contar. "Compactos"
                    era relleno: no describe el estado del botón ni lo que pasa al
                    tocarlo, y en 390px le comía la mitad del ancho al rótulo que
                    sí importa — el botón terminaba diciendo "Filt... Compac...". */}
                <button type="button" className="operation-manage-mobile-toggle" onClick={() => setShowMobileFilters((current) => !current)} aria-expanded={showMobileFilters}>
                  <span>Filtros</span>
                  {activeFilterCount > 0 ? <small>{activeFilterCount} activos</small> : null}
                </button>
                <button type="button" className="basalt-btn basalt-btn-primary operation-manage-create-mobile" onClick={() => openManualCreate()}>
                  <Plus size={15} />
                  Crear partido
                </button>
              </div>

              <div className={`operation-manage-toolbar-grid ${showMobileFilters ? 'is-open' : ''}`}>
                <label className="operation-form-field">
                  <span>Jornada</span>
                  <select className="basalt-input" value={manageRoundFilter} onChange={(event) => setManageRoundFilter(event.target.value)}>
                    <option value="all">Todas las jornadas</option>
                    {selectedPhase?.rounds.map((round) => <option key={round.id} value={round.id}>{round.name}</option>)}
                  </select>
                </label>

                <label className="operation-form-field">
                  <span>Grupo</span>
                  <select className="basalt-input" value={manageGroupFilter} onChange={(event) => setManageGroupFilter(event.target.value)}>
                    <option value="all">Todos los grupos</option>
                    <option value="none">Sin grupo</option>
                    {groupOptions.map((group) => <option key={group.value} value={group.value}>{group.label}</option>)}
                  </select>
                </label>

                <label className="operation-form-field">
                  <span>Estado</span>
                  <select className="basalt-input" value={manageStatusFilter} onChange={(event) => setManageStatusFilter(event.target.value as MatchStatus | 'all')}>
                    <option value="all">Todos los estados</option>
                    {STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                  </select>
                </label>

                <div className="operation-manage-inline-groups">
                  <span className="operation-manage-inline-label">Agrupar por</span>
                  <div className="operation-manage-toggle">
                    {GROUPING_OPTIONS.map((option) => (
                      <button key={option.id} type="button" className={manageGrouping === option.id ? 'active' : ''} onClick={() => setManageGrouping(option.id)}>
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="operation-manage-inline-groups">
                  <span className="operation-manage-inline-label">Vista</span>
                  <div className="operation-manage-toggle">
                    <button type="button" className={manageView === 'cards' ? 'active' : ''} onClick={() => setManageView('cards')}>
                      <LayoutGrid size={15} />
                      <span>Cards</span>
                    </button>
                    <button type="button" className={manageView === 'list' ? 'active' : ''} onClick={() => setManageView('list')}>
                      <List size={15} />
                      <span>Lista</span>
                    </button>
                  </div>
                </div>

                <button type="button" className="basalt-btn basalt-btn-primary operation-manage-create" onClick={() => openManualCreate()}>
                  <Plus size={15} />
                  Crear partido
                </button>
              </div>
            </div>

            {manageView === 'list' && filteredManageEntries.length > 0 ? (
              <div className="operation-manage-bulkbar fixture-glass">
                <label className="operation-manage-bulkselect">
                  <input
                    type="checkbox"
                    checked={allVisibleManageMatchesSelected}
                    onChange={toggleSelectAllVisibleManageMatches}
                  />
                  <span>Seleccionar visibles ({visibleSelectedManageMatchIds.length}/{visibleManageMatchIds.length})</span>
                </label>

                <div className="operation-manage-bulkactions">
                  <span className="operation-manage-badge">
                    {selectedManageMatchIds.size} seleccionados
                  </span>
                  <button type="button" className="btn-secondary" onClick={() => setSelectedManageMatchIds(new Set())} disabled={selectedManageMatchIds.size === 0 || busyAction === 'delete-selected'}>
                    Limpiar
                  </button>
                  <button type="button" className="btn-danger-outline" onClick={() => void handleBulkDeleteMatches()} disabled={selectedManageMatchIds.size === 0 || busyAction === 'delete-selected'}>
                    {busyAction === 'delete-selected' ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                    <span>Eliminar seleccionados</span>
                  </button>
                </div>
              </div>
            ) : null}

            {manageContainers.length > 0 ? (
              manageView === 'cards' ? (
                <div className="operation-manage-cards-stack">
                  {manageContainers.map((container) => {
                    const collapsed = collapsedContainerIds.has(container.id);
                    const totalInContainer = container.matches.length;
                    const shownCount = Math.min(
                      totalInContainer,
                      manageVisibleByContainer[container.id] ?? MANAGE_PAGE_SIZE,
                    );
                    const shownMatches = container.matches.slice(0, shownCount);
                    const remaining = totalInContainer - shownCount;
                    return (
                      <section key={container.id} className={`fixture-round-section ${collapsed ? 'is-collapsed' : 'is-expanded'}`}>
                        <div
                          className="fixture-round-summary"
                          onClick={() => toggleContainer(container.id)}
                          role="button"
                          tabIndex={0}
                          aria-expanded={!collapsed}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              toggleContainer(container.id);
                            }
                          }}
                        >
                          <header className="fixture-round-header">
                            <div className="fixture-round-title">
                              <span className="fixture-round-index">{String(container.matches.length).padStart(2, '0')}</span>
                              <div>
                                <h3>{container.title}</h3>
                                <p>{container.subtitle}</p>
                              </div>
                            </div>

                            <div className="fixture-round-meta">
                              <span className="fixture-round-count">
                                {remaining > 0
                                  ? `${shownCount} de ${totalInContainer}`
                                  : `${totalInContainer} visibles`}
                              </span>
                              <span className={`fixture-pill ${container.tone === 'empty' ? 'fixture-pill-draft' : container.tone === 'complete' ? 'fixture-pill-success' : 'fixture-pill-info'}`}>
                                {container.tone === 'empty' ? 'Vacia' : container.tone === 'complete' ? 'Completa' : 'Activa'}
                              </span>
                              <div className="operation-manage-round-actions">
                                {container.roundId ? (
                                  <button type="button" className="fixture-icon-btn" title="Agregar partido a esta jornada" onClick={(event) => { event.stopPropagation(); openManualCreate({ roundMode: 'existing', roundId: container.roundId as string, roundLabel: '' }); }}>
                                    <Plus size={15} />
                                  </button>
                                ) : null}
                                {container.editable ? (
                                  <button
                                    type="button"
                                    className="fixture-icon-btn"
                                    title="Editar jornada"
                                    onClick={(event) => {
                                      event.stopPropagation();
                                      const round = selectedPhase?.rounds.find((item) => item.id === container.id);
                                      if (round) openRoundEditor(round);
                                    }}
                                  >
                                    <Pencil size={15} />
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          </header>
                        </div>

                        <div className={`fixture-round-details ${!collapsed ? 'is-expanded' : ''}`}>
                          {/* Lista apilada, no grilla de columnas: cada partido
                              es una fila a ancho completo. */}
                          <div className="op-match-list">
                            {totalInContainer > 0 ? (
                              shownMatches.map((entry) => (
                                <MatchCard
                                  key={entry.match.id}
                                  entry={entry}
                                  groupLabel={entry.match.groupId ? getGroupLabel(entry.match.groupId) : null}
                                  busyAction={busyAction}
                                  quickResultForm={quickResultMatchId === entry.match.id ? quickResultForm : null}
                                  quickResultErrors={quickResultMatchId === entry.match.id ? quickResultErrors : {}}
                                  quickResultOpen={quickResultMatchId === entry.match.id}
                                  onQuickResult={() => openQuickResultEditor(entry.match)}
                                  onQuickResultFieldChange={setQuickResultField}
                                  onQuickPointsFieldChange={setQuickPointsField}
                                  onQuickPointsAutofill={autofillQuickPoints}
                                  onQuickResultSave={() => void handleQuickResultSave(entry.match)}
                                  pointsRules={pointsRules}
                                  secondaryScoreMetric={secondaryScoreMetric}
                                  onMove={() => openEditMatch(entry.match, 'move')}
                                  onDuplicate={() => openDuplicateMatch(entry.match)}
                                  onDelete={() => void handleDeleteMatch(entry.match)}
                                />
                              ))
                            ) : (
                              <div className="fixture-round-empty-card">
                                <Calendar size={28} />
                                <h4>Sin partidos visibles</h4>
                                <p>Prueba con otros filtros o agrega un partido a este bloque.</p>
                              </div>
                            )}

                            {/* El pie dice cuántos faltan antes de que los
                                pidas: «quedan 32» es la diferencia entre creer
                                que el bloque terminó y saber que sigue. */}
                            {remaining > 0 ? (
                              <div className="op-match-more">
                                <button
                                  type="button"
                                  className="basalt-btn op-match-more-btn"
                                  onClick={() => revealMoreMatches(container.id, totalInContainer)}
                                >
                                  Mostrar {Math.min(MANAGE_PAGE_SIZE, remaining)} más
                                  <span className="op-match-more-rest">quedan {remaining}</span>
                                </button>
                                <button
                                  type="button"
                                  className="basalt-btn basalt-btn-ghost"
                                  onClick={() => revealAllMatches(container.id, totalInContainer)}
                                >
                                  Ver los {totalInContainer}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                <div className="operation-manage-list">
                  {filteredManageEntries.map((entry) => (
                    <div key={entry.match.id} className={`operation-manage-list-row ${selectedManageMatchIds.has(entry.match.id) ? 'is-selected' : ''}`}>
                      <label
                        className="operation-manage-check"
                        aria-label={`Seleccionar ${entry.match.homeClub?.name || 'Local'} vs ${entry.match.awayClub?.name || 'Visitante'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedManageMatchIds.has(entry.match.id)}
                          onChange={() => toggleManageMatchSelection(entry.match.id)}
                        />
                      </label>
                      <div className="operation-manage-list-main">
                        <strong>{entry.match.homeClub?.name || 'Local'} vs {entry.match.awayClub?.name || 'Visitante'}</strong>
                        <small>
                          {entry.round.name}
                          {entry.match.groupId ? ` · ${getGroupLabel(entry.match.groupId)}` : ''}
                          {entry.match.venue ? ` · ${entry.match.venue}` : ''}
                        </small>
                      </div>
                      <div className="operation-manage-list-meta">
                        <span>{formatDateLabel(entry.match.dateTime)} · {formatTimeLabel(entry.match.dateTime)}</span>
                        <span className={`fixture-pill ${getMatchTone(entry.match.status)}`}>{getStatusLabel(entry.match.status)}</span>
                      </div>
                      <div className="operation-match-actions">
                        <button type="button" className="operation-match-action" onClick={() => openEditMatch(entry.match, 'edit')}><Pencil size={14} /></button>
                        <button type="button" className="operation-match-action" onClick={() => openEditMatch(entry.match, 'move')}><Grip size={14} /></button>
                        <button type="button" className="operation-match-action" onClick={() => openDuplicateMatch(entry.match)}><Copy size={14} /></button>
                        <button type="button" className="operation-match-action danger" disabled={busyAction === `delete-${entry.match.id}`} onClick={() => void handleDeleteMatch(entry.match)}>
                          {busyAction === `delete-${entry.match.id}` ? <RefreshCw size={14} className="spin" /> : <Trash2 size={14} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="operation-empty-state">
                <span className="operation-empty-icon"><Calendar size={24} /></span>
                <strong>
                  {manageGrouping === 'orphans' && selectedPhaseMatchCount > 0 && orphanMatchCount === 0
                    ? 'Todos los partidos ya estan asignados a jornadas'
                    : 'No hay partidos para los filtros actuales'}
                </strong>
                <p>
                  {manageGrouping === 'orphans' && selectedPhaseMatchCount > 0 && orphanMatchCount === 0
                    ? 'Esta vista solo muestra partidos sin jornada. Cambia a Por jornada para ver los encuentros ya importados.'
                    : 'Prueba con otra combinacion de filtros o vuelve a Agregar para cargar nuevos encuentros.'}
                </p>
                <div className="operation-empty-actions">
                  {manageGrouping === 'orphans' && selectedPhaseMatchCount > 0 && orphanMatchCount === 0 ? (
                    <button type="button" className="basalt-btn basalt-btn-primary" onClick={() => setManageGrouping('rounds')}>
                      <Calendar size={15} />
                      Ver por jornada
                    </button>
                  ) : (
                    <>
                      <button type="button" className="basalt-btn basalt-btn-primary" onClick={() => openManualCreate()}>
                        <Plus size={15} />
                        Crear partido manual
                      </button>
                      <button type="button" className="basalt-btn" onClick={() => { setActiveSubtab('add_matches'); setSelectedMethod('import_fixture'); }}>
                        <Upload size={15} />
                        Importar fixture
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="operation-fixture-side operation-fixture-side-desktop">
        {renderSidebarContent()}
      </aside>

      {mobileInsightsSheet.shouldRender ? (
        <>
          <button
            type="button"
            className={`basalt-sheet-backdrop operation-side-sheet-backdrop ${mobileInsightsSheet.isVisible ? 'is-open' : ''}`}
            aria-label="Cerrar panel de fase"
            onClick={() => setMobileInsightsOpen(false)}
          />
          <aside
            className={`operation-fixture-side-sheet ${mobileInsightsSheet.isVisible ? 'is-open' : ''}`}
            role="dialog"
            aria-modal="true"
            aria-label="Panel de fase"
          >
            <div className="operation-fixture-side-sheet-head">
              <div>
                <span className="operation-fixture-kicker">Panel de fase</span>
                <strong>Resumen operativo</strong>
              </div>
              <button
                type="button"
                className="basalt-btn basalt-btn-ghost operation-fixture-side-sheet-close"
                onClick={() => setMobileInsightsOpen(false)}
                aria-label="Cerrar panel"
              >
                <X size={18} />
              </button>
            </div>
            <div className="operation-fixture-side-sheet-body">
              {renderSidebarContent()}
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function MatchCard({
  entry,
  groupLabel,
  busyAction,
  quickResultForm,
  quickResultErrors,
  quickResultOpen,
  onQuickResult,
  onQuickResultFieldChange,
  onQuickPointsFieldChange,
  onQuickPointsAutofill,
  onQuickResultSave,
  pointsRules,
  secondaryScoreMetric,
  onMove,
  onDuplicate,
  onDelete,
}: {
  entry: ManageEntry;
  groupLabel: string | null;
  busyAction: string | null;
  pointsRules: PointsRules;
  /** Cifra secundaria del deporte; null si el marcador ya lo dice todo. */
  secondaryScoreMetric: SecondaryScoreMetric | null;
  quickResultForm: QuickResultFormState | null;
  quickResultErrors: Record<string, string>;
  quickResultOpen: boolean;
  onQuickResult: () => void;
  onQuickResultFieldChange: <K extends keyof QuickResultFormState>(field: K, value: QuickResultFormState[K]) => void;
  onQuickPointsFieldChange: (
    field: 'homeBasePoints' | 'awayBasePoints' | 'homeBonusPoints' | 'awayBonusPoints' | 'pointsOverrideReason',
    value: string,
  ) => void;
  onQuickPointsAutofill: () => void;
  onQuickResultSave: () => void;
  onMove: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { match, round } = entry;
  const [showScheduleEdit, setShowScheduleEdit] = useState(false);
  // Las cuatro acciones secundarias del teléfono. Vive por fila y no en el
  // workspace: abrir el menú de un partido no tiene por qué cerrar el de otro.
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const handleQuickResultToggle = () => {
    if (quickResultOpen) setShowScheduleEdit(false);
    onQuickResult();
  };
  /**
   * El click de la fila vive acá, en la LÍNEA, y no sólo en la lámina.
   *
   * La lámina (`.op-match-link`) es `position: absolute; inset: 0; z-index: 0`,
   * y sus hermanos —la fecha, los escudos, los nombres, el marcador, la sede—
   * llevan `z-index: 1`. O sea que la lámina queda DEBAJO de todo el contenido
   * y sólo recibe el click en el padding de 12px y en los huecos entre
   * elementos. Medido con `document.elementFromPoint` a 360, 390 y 1440: sobre
   * el nombre del club, el escudo, el marcador, la fecha y la sede el click lo
   * recibe un `<span>` inerte, y como la lámina es HERMANA y no ancestro, no
   * hay burbujeo que valga. La fila parecía clicable entera y era clicable en
   * una franja.
   *
   * Poniéndolo en la línea, el click de cualquier hijo burbujea hasta acá. Los
   * botones no molestan: `.op-match-actions` ya corta la propagación, y el
   * editor desplegado es hermano de la línea, no hijo.
   */
  const handleRowClick = () => {
    // Un click que termina de arrastrar una selección de texto no es un click
    // de apertura: el operador estaba copiando el nombre de un club.
    if (typeof window !== 'undefined' && window.getSelection()?.isCollapsed === false) return;
    handleQuickResultToggle();
  };
  const handleQuickResultSave = () => {
    setShowScheduleEdit(false);
    onQuickResultSave();
  };
  const quickBusy = busyAction === `quick-save-${match.id}`;
  const scoreVisible = match.status === 'live' || match.status === 'final';
  /**
   * Lo que el reglamento da por este partido, con la cuenta explicada. Se
   * recalcula en cada tecleo del marcador o de los tries, así que los términos
   * ("ganó · 4", "7 tries · +1") siempre describen los números que se ven.
   */
  const quickPointsExplain = useMemo(
    () => (quickResultForm
      ? explainQuickPoints(quickResultForm, pointsRules, secondaryScoreMetric)
      : { home: { base: 0, bonus: 0, total: 0, terms: [] }, away: { base: 0, bonus: 0, total: 0, terms: [] }, resolvedByShootout: false }),
    [quickResultForm, pointsRules, secondaryScoreMetric],
  );
  const getGroupLabel = (groupId: string | null | undefined) => groupLabel ?? formatGroupLabel(groupId);
  const manageHref = `/admin/super/partidos/${match.id}`;
  const matchLabel = `${match.homeClub?.name || 'Local'} vs ${match.awayClub?.name || 'Visitante'}`;

  // Quién ganó, para que la fila se lea sin leer el marcador: el ganador va en
  // tinta plena y el perdedor en tinta secundaria.
  const homeScore = match.score?.home ?? 0;
  const awayScore = match.score?.away ?? 0;
  const homeWon = scoreVisible && homeScore > awayScore;
  const awayWon = scoreVisible && awayScore > homeScore;

  return (
    /* Una FILA, no una tarjeta.
       Antes cada partido ocupaba un bloque de ~200px de alto con los rótulos
       LOCAL / RESULTADO / VISITANTE, la fecha repetida dos veces y la sede,
       repartidos en una grilla de columnas. Con 56 partidos eso son varias
       pantallas de scroll para ver un fixture. Ahora es una línea de 52px:
       cuándo, quién contra quién con su escudo, el marcador, y las acciones.
       El editor de resultado sigue abriéndose debajo, dentro de la misma fila. */
    <article className={`op-match-row ${getMatchTone(match.status)} ${quickResultOpen ? 'is-editing' : ''} ${moreActionsOpen ? 'has-more-actions' : ''}`}>
      <div className="op-match-line" onClick={handleRowClick}>
        {/* La fila entera carga el resultado.
            Antes abría el control de partido —eventos, alineaciones, reloj—,
            que se usa una vez por partido y con el partido delante. Lo que se
            hace cuarenta y ocho veces por fecha es escribir el marcador, y era
            justamente lo único que pedía apuntarle a un botón. Se invirtió: la
            fila abre el resultado y el control tiene su propia puerta, el botón
            con la planilla que está entre las acciones. */}
        <button
          type="button"
          className="op-match-link"
          aria-expanded={quickResultOpen}
          aria-label={
            quickResultOpen
              ? `Cerrar la carga de resultado de ${matchLabel}`
              : `${scoreVisible ? 'Editar' : 'Cargar'} el resultado de ${matchLabel}`
          }
          title={scoreVisible ? 'Editar el resultado' : 'Cargar el resultado'}
          /* Corta la propagación o el click contaría dos veces —una acá y otra
             en la línea— y el editor se abriría y se cerraría en el mismo
             gesto. La lámina se queda por el nombre accesible y por el foco de
             teclado; el área clicable de verdad la pone la línea. */
          onClick={(event) => { event.stopPropagation(); handleQuickResultToggle(); }}
        />

        <span className="op-match-when">
          {formatDateLabel(match.dateTime)} · {formatTimeLabel(match.dateTime)}
        </span>

        {/* El marcador va DOS veces, y sólo una se ve por vez.
            En escritorio el par se lee en horizontal y el «41 — 13» del medio
            es el que ordena la lectura. En el teléfono el par se apila, y ahí
            ese mismo nodo caía debajo de los dos equipos, alineado a la
            derecha: el resultado quedaba lejos de ambos y no se sabía cuál era
            de quién. La cifra por lado —cada club con su número en el mismo
            renglón— es la lectura correcta cuando hay una columna sola.
            El CSS apaga uno u otro con `display: none`, así que el lector de
            pantalla siempre encuentra exactamente una versión, nunca las dos. */}
        <div className="op-match-pair">
          <span className={`op-match-side ${homeWon ? 'is-winner' : ''} ${awayWon ? 'is-loser' : ''}`}>
            <Crest club={match.homeClub} size="md" />
            <span className="op-team-name">{match.homeClub?.name || 'Local'}</span>
            <span className={`op-match-side-score ${scoreVisible ? '' : 'is-pending'}`}>
              {scoreVisible ? homeScore : '–'}
            </span>
          </span>

          <span className={`op-match-score ${scoreVisible ? '' : 'is-pending'}`}>
            {scoreVisible ? `${homeScore} — ${awayScore}` : 'vs'}
          </span>

          <span className={`op-match-side is-away ${awayWon ? 'is-winner' : ''} ${homeWon ? 'is-loser' : ''}`}>
            <Crest club={match.awayClub} size="md" />
            <span className="op-team-name">{match.awayClub?.name || 'Visitante'}</span>
            <span className={`op-match-side-score ${scoreVisible ? '' : 'is-pending'}`}>
              {scoreVisible ? awayScore : '–'}
            </span>
          </span>
        </div>

        <span className="op-match-meta">
          {match.venue || 'Sin sede'}
          {match.groupId ? ` · ${getGroupLabel(match.groupId)}` : ''}
        </span>

        {/* La píldora de estado sólo cuando dice algo. Con 56 partidos
            finalizados, 56 etiquetas «Finalizado» son ruido: ahí el marcador ya
            lo cuenta. Se muestra cuando el partido NO está jugado. */}
        {match.status !== 'final' ? (
          <span className={`fixture-pill ${getMatchTone(match.status)}`}>{getStatusLabel(match.status)}</span>
        ) : null}

        {/* Acciones. En escritorio son cinco botones en fila, revelados al pasar
            por encima. En el teléfono esa fila se lleva un renglón entero de la
            ficha, y de las cinco la única que se usa a cada rato es cargar el
            resultado: las otras cuatro pasan detrás del `⋯`, que las despliega
            en su propia tira sin sacarte de la lista. Es el mismo DOM: `⋯` no
            existe con mouse, y la tira secundaria tampoco. */}
        <div className="op-match-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className={`basalt-btn op-match-act-primary ${quickResultOpen ? 'basalt-btn-accent' : ''}`}
            /* En el teléfono el rótulo se oculta y queda el rayo solo: sin
               nombre accesible el botón que carga el resultado sería un botón
               mudo. Acá lo lleva escrito, y el rótulo visible sigue estando
               donde hay ancho. */
            aria-label={scoreVisible ? 'Editar resultado del partido' : 'Cargar resultado del partido'}
            onClick={handleQuickResultToggle}
          >
            <Zap size={13} aria-hidden="true" />
            <span>{scoreVisible ? 'Resultado' : 'Cargar'}</span>
          </button>
          {/* La puerta al control de partido: eventos, alineaciones y reloj.
              Es la única acción de la fila que se va a otra pantalla, así que
              lleva la planilla —no el lápiz, que ahora sería mentira: editar el
              resultado es la fila entera— y su propio contorno, para que se lea
              como lo que es y no como una más de la tira.

              Lleva su propia clase, no la genérica de las que se esconden
              detrás del `⋯`: en el teléfono la fila deja de ser clicable —en
              una tarjeta de media columna el área táctil se solapa con los
              botones— y ésta pasa a ser la puerta visible. */}
          <ProtectedLink
            href={manageHref}
            className="basalt-btn op-match-act-more op-match-act-open"
            title="Abrir el control de partido: eventos, alineaciones y reloj"
            aria-label={`Abrir el control de partido de ${matchLabel}: eventos, alineaciones y reloj`}
          >
            <ClipboardList size={13} aria-hidden="true" />
          </ProtectedLink>
          <button className="basalt-btn op-match-act-more" title="Mover de jornada" aria-label="Mover de jornada" onClick={onMove}>
            <Grip size={13} />
          </button>
          <button className="basalt-btn op-match-act-more" title="Duplicar partido" aria-label="Duplicar partido" onClick={onDuplicate}>
            <Copy size={13} />
          </button>
          <button
            className="basalt-btn op-match-act-more"
            title="Eliminar partido"
            aria-label="Eliminar partido"
            onClick={onDelete}
            disabled={busyAction === `delete-${match.id}`}
          >
            {busyAction === `delete-${match.id}` ? <RefreshCw size={13} className="spin" /> : <Trash2 size={13} />}
          </button>
          <button
            type="button"
            className="basalt-btn op-match-act-toggle"
            aria-label={moreActionsOpen ? 'Ocultar acciones del partido' : 'Más acciones del partido'}
            aria-expanded={moreActionsOpen}
            title="Más acciones"
            onClick={() => setMoreActionsOpen((open) => !open)}
          >
            <MoreHorizontal size={15} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── Cargar resultado ──────────────────────────────────────────────
          El marcador es lo único grande del formulario: 112×84 con el número a
          44px, contra 34px de alto de cualquier otro campo. Antes «Local 53» y
          «Base local 4» eran la misma caja, una al lado de la otra, y nada
          decía cuál era el resultado del partido.

          Los puntos para la tabla llegan calculados por el reglamento y con la
          cuenta a la vista ("ganó · 4" + "7 tries · +1" = 5), pero siguen
          siendo campos: corregirlos no pide permiso, sólo pide un motivo. */}
      {quickResultOpen && quickResultForm ? (
        <div className="op-result-editor" onClick={(event) => event.stopPropagation()}>
          <div className="op-result-head">
            <span className="op-result-title">Cargar resultado</span>
            <span className="op-result-when">{round.name}</span>
            <button
              type="button"
              className="basalt-btn basalt-btn-ghost"
              style={{ marginLeft: 'auto' }}
              onClick={handleQuickResultToggle}
            >
              <X size={14} />
              Cerrar
            </button>
          </div>

          <div className="op-result-body">
            <div className="op-scoreboard">
              <div className="op-scoreboard-head">
                <span className="op-scoreboard-head-title">Resultado</span>
                <span className="op-result-when" style={{ marginLeft: 'auto' }}>
                  {formatLongDateLabel(match.dateTime)} · {match.venue || 'Sede por definir'}
                </span>
              </div>

              <div className="op-scoreboard-grid">
                <span className="op-scoreboard-team">
                  <Crest club={match.homeClub} size="xl" />
                  <span className="op-scoreboard-team-name">{match.homeClub?.name || 'Local'}</span>
                </span>
                <input
                  className="op-number is-score"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={quickResultForm.homeScore}
                  aria-label={`Puntos de ${match.homeClub?.name || 'local'}`}
                  onChange={(event) => onQuickResultFieldChange('homeScore', event.target.value)}
                />
                <span className="op-scoreboard-dash" aria-hidden="true">—</span>
                <input
                  className="op-number is-score"
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={quickResultForm.awayScore}
                  aria-label={`Puntos de ${match.awayClub?.name || 'visitante'}`}
                  onChange={(event) => onQuickResultFieldChange('awayScore', event.target.value)}
                />
                <span className="op-scoreboard-team is-away">
                  <Crest club={match.awayClub} size="xl" />
                  <span className="op-scoreboard-team-name">{match.awayClub?.name || 'Visitante'}</span>
                </span>

                {/* La cifra secundaria va debajo y alineada con su marcador: en
                    la escala chica, pero pegada al número al que pertenece. En
                    rugby son los tries y sin ellos el bonus ofensivo no se puede
                    calcular. En hockey y fútbol no se pinta: el marcador ya es
                    el conteo de goles. */}
                {secondaryScoreMetric ? (
                  /* `display: contents` en escritorio: el envoltorio no existe
                     para el layout y las cinco celdas siguen siendo hijas
                     directas de la grilla, como antes. En el teléfono el mismo
                     div se vuelve una fila propia —rótulo a la izquierda, las
                     dos cifras a la derecha—, que es lo que la grilla de cinco
                     columnas no podía dar sin dejar los nombres en 30px. */
                  <div className="op-scoreboard-subrow">
                    <span aria-hidden="true" />
                    <input
                      className="op-number is-small op-scoreboard-sub-input"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="—"
                      value={quickResultForm.homeSecondary}
                      aria-label={`${secondaryScoreMetric.label} de ${match.homeClub?.name || 'local'}`}
                      onChange={(event) => onQuickResultFieldChange('homeSecondary', event.target.value)}
                    />
                    <span className="op-scoreboard-sub-key">{secondaryScoreMetric.label}</span>
                    <input
                      className="op-number is-small op-scoreboard-sub-input"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="—"
                      value={quickResultForm.awaySecondary}
                      aria-label={`${secondaryScoreMetric.label} de ${match.awayClub?.name || 'visitante'}`}
                      onChange={(event) => onQuickResultFieldChange('awaySecondary', event.target.value)}
                    />
                    <span aria-hidden="true" />
                  </div>
                ) : null}

                {shouldShowPenaltyFields(quickResultForm) ? (
                  <div className="op-scoreboard-subrow">
                    <span aria-hidden="true" />
                    <input
                      className="op-number is-small op-scoreboard-sub-input"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="—"
                      value={quickResultForm.homePenalties}
                      aria-label={`Penales de ${match.homeClub?.name || 'local'}`}
                      onChange={(event) => onQuickResultFieldChange('homePenalties', event.target.value)}
                    />
                    <span className="op-scoreboard-sub-key">Penales</span>
                    <input
                      className="op-number is-small op-scoreboard-sub-input"
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="—"
                      value={quickResultForm.awayPenalties}
                      aria-label={`Penales de ${match.awayClub?.name || 'visitante'}`}
                      onChange={(event) => onQuickResultFieldChange('awayPenalties', event.target.value)}
                    />
                    <span aria-hidden="true" />
                  </div>
                ) : null}
              </div>
            </div>

            {quickResultErrors.homeScore || quickResultErrors.awayScore
              || quickResultErrors.homePenalties || quickResultErrors.awayPenalties ? (
              <div className="op-note is-error">
                <span className="op-note-icon"><AlertTriangle size={12} /></span>
                <span className="op-note-copy">
                  <span>
                    {quickResultErrors.homeScore || quickResultErrors.awayScore
                      || quickResultErrors.homePenalties || quickResultErrors.awayPenalties}
                  </span>
                </span>
              </div>
            ) : null}

            {shouldShowPenaltyFields(quickResultForm) ? (
              <div className="op-note is-info">
                <span className="op-note-icon"><ShieldCheck size={12} /></span>
                <span className="op-note-copy">
                  <strong>Empataron en tiempo reglamentario</strong>
                  <span>
                    Si se definió por penales, cargalos. Si no, dejalos vacíos y queda empate.
                  </span>
                </span>
              </div>
            ) : null}

            {quickResultForm.status === 'final' ? (
              <div className={`op-points ${quickResultForm.pointsAutocalculated ? '' : 'is-edited'}`}>
                <div className="op-points-head">
                  <span className="op-points-title">Puntos para la tabla</span>
                  <span className="op-points-source">
                    {quickResultForm.pointsAutocalculated
                      ? 'Calculados por el reglamento · podés corregirlos'
                      : 'Corregidos a mano'}
                  </span>
                </div>

                {(['home', 'away'] as const).map((side) => {
                  const club = side === 'home' ? match.homeClub : match.awayClub;
                  const explained = quickPointsExplain[side];
                  const baseField = side === 'home' ? 'homeBasePoints' : 'awayBasePoints';
                  const bonusField = side === 'home' ? 'homeBonusPoints' : 'awayBonusPoints';
                  const base = parseQuickPointNumber(quickResultForm[baseField]);
                  const bonus = parseQuickPointNumber(quickResultForm[bonusField]);
                  // Un término que el reglamento dio pero el número escrito ya
                  // no refleja se muestra tachado: se ve qué se cayó y por qué.
                  const dropped = !quickResultForm.pointsAutocalculated && bonus < explained.bonus;

                  return (
                    <div
                      key={side}
                      className={`op-points-row ${quickResultForm.pointsAutocalculated ? '' : 'is-edited'}`}
                    >
                      <span className="op-points-who">
                        <Crest club={club} size="sm" />
                        <span className="op-team-name">
                          {club?.name || (side === 'home' ? 'Local' : 'Visitante')}
                        </span>
                      </span>

                      <span className="op-points-terms">
                        {explained.terms.map((term) => (
                          <span
                            key={term.id}
                            className={`op-term ${term.active ? 'is-active' : ''} ${term.active && dropped && term.id !== 'result' ? 'is-dropped' : ''}`}
                          >
                            {term.label}
                          </span>
                        ))}
                      </span>

                      <span className="op-points-inputs">
                        <label>
                          Base
                          <input
                            className="op-number"
                            type="number"
                            step="any"
                            inputMode="numeric"
                            value={quickResultForm[baseField]}
                            aria-label={`Puntos base de ${club?.name || side}`}
                            onChange={(event) => onQuickPointsFieldChange(baseField, event.target.value)}
                          />
                        </label>
                        <label>
                          Bonus
                          <input
                            className="op-number"
                            type="number"
                            step="any"
                            inputMode="numeric"
                            value={quickResultForm[bonusField]}
                            aria-label={`Bonus de ${club?.name || side}`}
                            onChange={(event) => onQuickPointsFieldChange(bonusField, event.target.value)}
                          />
                        </label>
                      </span>

                      <span className="op-points-equals" aria-hidden="true">=</span>
                      <span className="op-points-total">{base + bonus}</span>
                    </div>
                  );
                })}
              </div>
            ) : null}

            {quickResultErrors.homeBasePoints || quickResultErrors.awayBasePoints
              || quickResultErrors.homeBonusPoints || quickResultErrors.awayBonusPoints ? (
              <div className="op-note is-error">
                <span className="op-note-icon"><AlertTriangle size={12} /></span>
                <span className="op-note-copy">
                  <span>
                    {quickResultErrors.homeBasePoints || quickResultErrors.awayBasePoints
                      || quickResultErrors.homeBonusPoints || quickResultErrors.awayBonusPoints}
                  </span>
                </span>
              </div>
            ) : null}

            {/* Corregir un punto no se bloquea: se marca. El motivo queda a mano
                para el que quiera dejar el rastro —dentro de tres meses nadie se
                acuerda de por qué ese partido tiene un punto que el reglamento no
                da—, pero no traba el guardado. */}
            {quickResultForm.status === 'final' && !quickResultForm.pointsAutocalculated ? (
              <>
                <div className="op-note is-warning">
                  <span className="op-note-icon"><AlertTriangle size={12} /></span>
                  <span className="op-note-copy">
                    <strong>Estos puntos no son los que da el reglamento</strong>
                    <span>
                      Contá por qué se corrigieron. Queda guardado con el partido.
                    </span>
                  </span>
                  <button
                    type="button"
                    className="basalt-btn basalt-btn-accent op-note-action"
                    onClick={onQuickPointsAutofill}
                  >
                    <RefreshCw size={14} />
                    Volver al reglamento
                  </button>
                </div>
                <label className="op-field">
                  <span>Por qué se corrige <span className="op-field-optional">· opcional</span></span>
                  <textarea
                    rows={2}
                    value={quickResultForm.pointsOverrideReason}
                    placeholder="Ej: sanción del tribunal, corrección de acta"
                    onChange={(event) => onQuickPointsFieldChange('pointsOverrideReason', event.target.value)}
                  />
                </label>
              </>
            ) : null}

            {/* Horario y sede: UN bloque detrás de UN botón. Antes había dos
                controles «Editar horario», uno encima del otro. */}
            {showScheduleEdit ? (
              <div className="op-schedule">
                <div className="op-schedule-head">
                  <span className="op-panel-title">Horario y sede</span>
                  <button
                    type="button"
                    className="basalt-btn basalt-btn-ghost"
                    onClick={() => setShowScheduleEdit(false)}
                  >
                    Ocultar
                  </button>
                </div>
                <div className="op-schedule-grid">
                  <label className="op-field">
                    <span>Fecha</span>
                    <DdMmYyyyDateField
                      value={quickResultForm.scheduledDate}
                      onChange={(iso) => onQuickResultFieldChange('scheduledDate', iso)}
                    />
                  </label>
                  <label className="op-field">
                    <span>Hora</span>
                    <input
                      type="time"
                      value={quickResultForm.scheduledTime}
                      onChange={(event) => onQuickResultFieldChange('scheduledTime', event.target.value)}
                    />
                  </label>
                </div>
              </div>
            ) : null}

            <div className="op-result-foot">
              <label className="op-field" style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <span>Estado</span>
                <select
                  value={quickResultForm.status}
                  aria-label="Estado del partido"
                  onChange={(event) => onQuickResultFieldChange('status', event.target.value as MatchStatus)}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              {!showScheduleEdit ? (
                <button
                  type="button"
                  className="basalt-btn basalt-btn-accent"
                  onClick={() => setShowScheduleEdit(true)}
                >
                  <Clock3 size={14} />
                  Editar horario
                </button>
              ) : null}

              <span className="op-result-foot-spacer" />

              <button type="button" className="basalt-btn" onClick={handleQuickResultToggle}>
                Cancelar
              </button>
              <button
                type="button"
                className="basalt-btn basalt-btn-primary"
                disabled={quickBusy}
                onClick={handleQuickResultSave}
              >
                {quickBusy ? <RefreshCw size={14} className="spin" /> : <CheckCircle2 size={14} />}
                Guardar resultado
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}

// TeamBlock se retiró con las tarjetas: pintaba el rótulo LOCAL/VISITANTE sobre
// un escudo de 24px y caía a un ícono genérico de escudo cuando el club no
// traía logo. La fila usa <Crest>, que resuelve el escudo real por clave y
// nunca cae a un dibujo sin identidad.
