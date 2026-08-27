'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { APP_TIMEZONE, combineLocalDateTimeToUtcIso } from '@/lib/timezone';
import { invalidateCache } from '@/lib/cache/superAdminCache';
import { getActiveSports } from '@/lib/data/sports';
import '../../creation-forms.css';
import './match-form.css';
import { SearchSelect, type SearchSelectOption } from './SearchSelect';

const MATCHES_HOME = '/admin/super/partidos';

interface TournamentOption {
  id: string;
  name: string;
  season: string | null;
  sportId: string | null;
  status: string | null;
}

interface Club {
  id: string;
  name: string;
  sport: string | null;
  // `clubs.sport` cuando el filtro efectivo salió de `clubs.sport_id`: las dos
  // columnas conviven y no siempre dicen lo mismo.
  sportAlt: string | null;
}

interface Squad {
  id: string;
  name: string;
}

interface PhaseOption {
  id: string;
  name: string;
  phase_type: string;
  is_active: boolean;
}

interface RoundOption {
  id: string;
  name: string;
  phaseId: string;
}

interface GroupOption {
  id: string;
  name: string;
  phaseId: string;
}

type Mode = 'tournament' | 'friendly';
type CreatableStatus = 'scheduled' | 'postponed' | 'suspended';
type LoadState = 'idle' | 'loading' | 'ok' | 'error';
type Row = Record<string, unknown>;

interface FormState {
  mode: Mode;
  tournamentId: string;
  sportId: string;
  phaseId: string;
  roundId: string;
  roundLabel: string;
  groupId: string;
  category: string;
  homeClubId: string;
  awayClubId: string;
  homeSquadId: string;
  awaySquadId: string;
  date: string;
  time: string;
  venue: string;
  referee: string;
  watchUrl: string;
  status: CreatableStatus;
  isPublic: boolean;
}

const ACTIVE_SPORTS = getActiveSports();

const CATEGORY_OPTIONS = ['Primera División', 'Intermedia', 'Pre-Intermedia', 'M19', 'Femenino'];

const STATUS_OPTIONS: Array<{ value: CreatableStatus; label: string; help: string; tone: 'ok' | 'warn' | 'danger' }> = [
  { value: 'scheduled', label: 'Programado', help: 'Entra a la agenda con su fecha y hora.', tone: 'ok' },
  { value: 'postponed', label: 'Postergado', help: 'Queda cargado con la fecha como provisoria.', tone: 'warn' },
  { value: 'suspended', label: 'Suspendido', help: 'Nace suspendido: se ve, pero sin fecha firme.', tone: 'danger' },
];

const PHASE_TYPE_LABELS: Record<string, string> = {
  league: 'liga',
  groups: 'grupos',
  group: 'grupos',
  playoff: 'playoff',
  knockout: 'eliminación',
  cup: 'copa',
};

function getSportVariants(sport: string): string[] {
  const lower = sport.toLowerCase();
  switch (lower) {
    case 'rugby': return ['rugby', 'rugby-union', 'rugby-league'];
    case 'rugby-union': return ['rugby', 'rugby-union'];
    case 'rugby-league': return ['rugby', 'rugby-league'];
    case 'football': return ['football', 'soccer'];
    // Los dos hockeys se leen entre sí: hay clubes viejos guardados como
    // 'hockey' que en la plataforma juegan sobre césped.
    case 'hockey': return ['hockey', 'field-hockey'];
    case 'field-hockey': return ['field-hockey', 'hockey'];
    default: return [lower];
  }
}

function normalizeSportValue(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function sportMatchesSelection(clubSport: string | null | undefined, selectedSportId: string) {
  const normalizedClubSport = normalizeSportValue(clubSport);
  if (!normalizedClubSport) return false;
  return getSportVariants(selectedSportId).includes(normalizedClubSport);
}

// El filtro por deporte del amistoso ORDENA la lista, no la cierra: un club sin
// deporte cargado en la ficha no puede quedar inalcanzable para siempre. Y como
// `sport` y `sport_id` pueden estar en desacuerdo en la base, alcanza con que
// uno de los dos coincida.
function clubAllowedForFriendly(club: Club | undefined, selectedSportId: string) {
  if (!selectedSportId) return true;
  if (!club) return false;
  const declared = [club.sport, club.sportAlt]
    .map(normalizeSportValue)
    .filter((value): value is string => Boolean(value));
  if (declared.length === 0) return true;
  return declared.some((value) => sportMatchesSelection(value, selectedSportId));
}

function isPlayoffPhaseType(phaseType: string | null | undefined) {
  return phaseType === 'playoff' || phaseType === 'knockout';
}

function text(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function readArray(payload: unknown): Row[] {
  if (Array.isArray(payload)) return payload as Row[];
  if (payload && typeof payload === 'object') {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) return data as Row[];
  }
  return [];
}

function byName<T extends { name: string }>(a: T, b: T) {
  return a.name.localeCompare(b.name, 'es');
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const data = await response.json();
    const message = text(data?.error) || text(data?.message) || fallback;
    const details = text(data?.details);
    return details ? `${message} (${details})` : message;
  } catch {
    return fallback;
  }
}

// Los planteles del club elegido. Cambiar de club descarta la respuesta vieja
// aunque llegue después.
function useClubSquads(clubId: string) {
  const [squads, setSquads] = useState<Squad[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!clubId) {
      setSquads([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/admin/clubs/${clubId}/squads`, { cache: 'no-store' })
      .then(async (response) => (response.ok ? readArray(await response.json()) : []))
      .then((rows) => {
        if (cancelled) return;
        setSquads(rows.map((row) => ({ id: text(row.id), name: text(row.name) || 'Plantel' })).filter((s) => s.id));
      })
      .catch(() => {
        if (!cancelled) setSquads([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  return { squads, loading };
}

export default function CreateMatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tournamentIdParam = searchParams.get('tournamentId') || '';

  const [form, setForm] = useState<FormState>(() => ({
    mode: 'tournament',
    tournamentId: tournamentIdParam,
    sportId: '',
    phaseId: '',
    roundId: '',
    roundLabel: '',
    groupId: '',
    category: '',
    homeClubId: '',
    awayClubId: '',
    homeSquadId: '',
    awaySquadId: '',
    date: '',
    time: '',
    venue: '',
    referee: '',
    watchUrl: '',
    status: 'scheduled',
    isPublic: true,
  }));
  const patch = useCallback((changes: Partial<FormState>) => {
    setForm((prev) => ({ ...prev, ...changes }));
  }, []);

  const [tournaments, setTournaments] = useState<TournamentOption[]>([]);
  const [tournamentsState, setTournamentsState] = useState<LoadState>('idle');
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsState, setClubsState] = useState<LoadState>('idle');
  const [participants, setParticipants] = useState<Club[]>([]);
  const [participantsState, setParticipantsState] = useState<LoadState>('idle');
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [rounds, setRounds] = useState<RoundOption[]>([]);
  const [groups, setGroups] = useState<GroupOption[]>([]);
  const [structureState, setStructureState] = useState<LoadState>('idle');
  const [catalogReload, setCatalogReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { squads: homeSquads, loading: homeSquadsLoading } = useClubSquads(form.homeClubId);
  const { squads: awaySquads, loading: awaySquadsLoading } = useClubSquads(form.awayClubId);

  // ---- Catálogos: torneos y clubes.
  useEffect(() => {
    let cancelled = false;

    const loadTournaments = async () => {
      setTournamentsState('loading');
      try {
        // No va el catálogo público (/api/catalog/tournaments): corta en 10 y
        // acá hay casi mil torneos. El del gestor devuelve todos los que el
        // usuario administra.
        const response = await fetch('/api/admin/torneo/tournaments?limit=1000', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows = readArray(await response.json());
        if (cancelled) return;
        setTournaments(
          rows
            .map((row) => ({
              id: text(row.id),
              name: text(row.display_name) || text(row.name) || 'Torneo',
              season: text(row.season_id) || null,
              sportId: text(row.sport_id) || text(row.sport) || null,
              status: text(row.status) || null,
            }))
            .filter((tournament) => tournament.id)
            .sort(byName)
        );
        setTournamentsState('ok');
      } catch (error) {
        if (cancelled) return;
        console.error('[crear partido] No se pudieron cargar los torneos:', error);
        setTournaments([]);
        setTournamentsState('error');
      }
    };

    const loadClubs = async () => {
      setClubsState('loading');
      try {
        // Sin límite explícito el endpoint corta el catálogo y la mitad de los
        // clubes queda fuera del buscador.
        const response = await fetch('/api/admin/clubs?limit=10000', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const rows = readArray(await response.json());
        if (cancelled) return;
        setClubs(
          rows
            .map((row) => ({
              id: text(row.id),
              name: text(row.name) || text(row.short_name) || 'Club',
              sport: text(row.sport_id) || text(row.sport) || null,
              sportAlt: text(row.sport) || text(row.sport_id) || null,
            }))
            .filter((club) => club.id)
            .sort(byName)
        );
        setClubsState('ok');
      } catch (error) {
        if (cancelled) return;
        console.error('[crear partido] No se pudo cargar el catálogo de clubes:', error);
        setClubs([]);
        setClubsState('error');
      }
    };

    void loadTournaments();
    void loadClubs();
    return () => {
      cancelled = true;
    };
  }, [catalogReload]);

  // ---- Participantes y estructura del torneo elegido.
  useEffect(() => {
    if (form.mode !== 'tournament' || !form.tournamentId) {
      setParticipants([]);
      setParticipantsState('idle');
      setPhases([]);
      setRounds([]);
      setGroups([]);
      setStructureState('idle');
      return;
    }

    let cancelled = false;
    const id = form.tournamentId;
    setParticipantsState('loading');
    setStructureState('loading');

    (async () => {
      try {
        const response = await fetch(`/api/tournaments/${id}/participants`, { cache: 'no-store' });
        const rows = response.ok ? readArray(await response.json()) : [];
        if (cancelled) return;
        setParticipants(
          rows
            .map((row) => ({
              id: text(row.id),
              name: text(row.name) || text(row.short_name) || 'Club',
              sport: null,
              sportAlt: null,
            }))
            .filter((club) => club.id)
            .sort(byName)
        );
        setParticipantsState(response.ok ? 'ok' : 'error');
      } catch (error) {
        if (cancelled) return;
        console.error('[crear partido] No se pudieron cargar los participantes:', error);
        setParticipants([]);
        setParticipantsState('error');
      }
    })();

    (async () => {
      try {
        const [phasesResponse, fixtureResponse, groupsResponse] = await Promise.all([
          fetch(`/api/tournaments/${id}/phases`, { cache: 'no-store' }),
          fetch(`/api/tournaments/${id}/fixture`, { cache: 'no-store' }),
          fetch(`/api/tournaments/${id}/groups`, { cache: 'no-store' }),
        ]);
        const phasesJson = phasesResponse.ok ? await phasesResponse.json() : null;
        const fixtureJson = fixtureResponse.ok ? await fixtureResponse.json() : null;
        const groupsJson = groupsResponse.ok ? await groupsResponse.json() : null;

        const nextPhases: PhaseOption[] = readArray(phasesJson).map((phase) => ({
          id: text(phase.id),
          name: text(phase.name) || 'Fase',
          phase_type: text(phase.phase_type) || 'league',
          is_active: Boolean(phase.is_active),
        })).filter((phase) => phase.id);

        const fixturePhases = fixtureJson && typeof fixtureJson === 'object'
          ? readArray((fixtureJson as Row).phases)
          : [];
        const nextRounds: RoundOption[] = fixturePhases.flatMap((phase) =>
          readArray(phase.rounds)
            .map((round) => ({ id: text(round.id), name: text(round.name) || 'Jornada', phaseId: text(phase.id) }))
            .filter((round) => round.id && !round.id.startsWith('orphaned-'))
        );

        const nextGroups: GroupOption[] = readArray(groupsJson).map((group) => ({
          id: text(group.id),
          name: text(group.name) || 'Grupo',
          phaseId: text(group.phase_id),
        })).filter((group) => group.id);

        if (cancelled) return;
        setPhases(nextPhases);
        setRounds(nextRounds);
        setGroups(nextGroups);
        setStructureState('ok');

        setForm((prev) => {
          if (prev.tournamentId !== id) return prev;
          const phaseId = nextPhases.some((phase) => phase.id === prev.phaseId)
            ? prev.phaseId
            : (nextPhases.find((phase) => phase.is_active)?.id || nextPhases[0]?.id || '');
          const roundId = nextRounds.some((round) => round.phaseId === phaseId && round.id === prev.roundId)
            ? prev.roundId
            : '';
          const groupId = nextGroups.some((group) => group.phaseId === phaseId && group.id === prev.groupId)
            ? prev.groupId
            : '';
          if (phaseId === prev.phaseId && roundId === prev.roundId && groupId === prev.groupId) return prev;
          return { ...prev, phaseId, roundId, groupId };
        });
      } catch (error) {
        if (cancelled) return;
        console.error('[crear partido] No se pudo cargar la estructura del torneo:', error);
        setPhases([]);
        setRounds([]);
        setGroups([]);
        setStructureState('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [form.mode, form.tournamentId]);

  // Cambiar de fase deja fuera la jornada y el grupo que eran de la otra.
  useEffect(() => {
    setForm((prev) => {
      const roundId = rounds.some((round) => round.phaseId === prev.phaseId && round.id === prev.roundId) ? prev.roundId : '';
      const groupId = groups.some((group) => group.phaseId === prev.phaseId && group.id === prev.groupId) ? prev.groupId : '';
      if (roundId === prev.roundId && groupId === prev.groupId) return prev;
      return { ...prev, roundId, groupId };
    });
  }, [form.phaseId, rounds, groups]);

  // En un amistoso, cambiar el deporte saca solo los clubes que no entran en
  // la disciplina nueva; los que sí entran se quedan elegidos.
  useEffect(() => {
    if (form.mode !== 'friendly' || !form.sportId || clubs.length === 0) return;
    setForm((prev) => {
      const homeOk = prev.homeClubId && clubAllowedForFriendly(clubs.find((club) => club.id === prev.homeClubId), prev.sportId);
      const awayOk = prev.awayClubId && clubAllowedForFriendly(clubs.find((club) => club.id === prev.awayClubId), prev.sportId);
      const homeClubId = homeOk ? prev.homeClubId : '';
      const awayClubId = awayOk ? prev.awayClubId : '';
      if (homeClubId === prev.homeClubId && awayClubId === prev.awayClubId) return prev;
      return {
        ...prev,
        homeClubId,
        awayClubId,
        homeSquadId: homeClubId ? prev.homeSquadId : '',
        awaySquadId: awayClubId ? prev.awaySquadId : '',
      };
    });
  }, [clubs, form.mode, form.sportId]);

  useEffect(() => {
    if (!saveError) return;
    document.getElementById('save-error')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [saveError]);

  // ---- Derivados.
  const isTournament = form.mode === 'tournament';
  const selectedTournament = tournaments.find((tournament) => tournament.id === form.tournamentId) || null;
  const selectedPhase = phases.find((phase) => phase.id === form.phaseId) || null;
  const isPlayoff = isTournament && isPlayoffPhaseType(selectedPhase?.phase_type);
  const availableRounds = rounds.filter((round) => round.phaseId === form.phaseId);
  const availableGroups = groups.filter((group) => group.phaseId === form.phaseId);
  const selectedSport = ACTIVE_SPORTS.find((sport) => sport.id === form.sportId) || null;

  // Sin deporte elegido se ve el catálogo completo; con deporte elegido se ve
  // esa disciplina más los clubes sin deporte cargado. Si el filtro deja la
  // lista vacía, gana el catálogo: un selector vacío no es un filtro, es una
  // traba.
  const friendlyClubs = useMemo(() => {
    if (form.mode !== 'friendly') return clubs;
    const filtered = clubs.filter((club) => clubAllowedForFriendly(club, form.sportId));
    return filtered.length > 0 ? filtered : clubs;
  }, [clubs, form.mode, form.sportId]);

  const usingParticipants = isTournament && Boolean(form.tournamentId) && participants.length > 0;
  const availableClubs = isTournament ? (usingParticipants ? participants : clubs) : friendlyClubs;
  const clubsLoading = clubsState === 'loading' || (isTournament && Boolean(form.tournamentId) && participantsState === 'loading');

  const clubOptions: SearchSelectOption[] = useMemo(
    () => availableClubs.map((club) => ({ value: club.id, label: club.name })),
    [availableClubs]
  );
  const tournamentOptions: SearchSelectOption[] = useMemo(
    () => tournaments.map((tournament) => ({
      value: tournament.id,
      label: tournament.name,
      hint: [tournament.season, tournament.status === 'draft' ? 'borrador' : null].filter(Boolean).join(' · ') || undefined,
    })),
    [tournaments]
  );

  const sameClub = Boolean(form.homeClubId) && form.homeClubId === form.awayClubId;
  const watchUrlTrimmed = form.watchUrl.trim();
  const watchUrlInvalid = Boolean(watchUrlTrimmed) && !isHttpUrl(watchUrlTrimmed);
  const catalogError = tournamentsState === 'error' || clubsState === 'error';

  const clubsHelp = (() => {
    if (clubsState === 'loading') return 'Cargando el catálogo de clubes…';
    if (!isTournament) {
      return selectedSport
        ? `${availableClubs.length} clubes de ${selectedSport.nameEs.toLowerCase()}, más los que no tienen deporte cargado.`
        : `${availableClubs.length} clubes del catálogo. Elegí el deporte para acotar la lista.`;
    }
    if (!form.tournamentId) return 'Elegí el torneo para ver sus participantes.';
    if (participantsState === 'loading') return 'Cargando los participantes del torneo…';
    if (usingParticipants) return `Solo los ${participants.length} participantes del torneo.`;
    return `El torneo no tiene participantes cargados: se muestra el catálogo completo (${clubs.length}).`;
  })();

  // Qué falta para que el primario se habilite, en el orden del formulario.
  const blocked = (() => {
    if (isTournament) {
      if (!form.tournamentId) return 'Elegí el torneo.';
      if (structureState === 'loading') return 'Cargando la estructura del torneo…';
      if (structureState === 'error') return 'No se pudo leer la estructura del torneo. Probá de nuevo.';
      if (phases.length === 0) return 'El torneo no tiene fases. Crealas desde el gestor antes de cargar partidos.';
      if (!form.phaseId) return 'Elegí la fase.';
      if (isPlayoff && availableRounds.length === 0) return 'Esta fase de eliminación no tiene etapas definidas. Cargalas desde el gestor del torneo.';
      if (isPlayoff && !form.roundId) return 'Elegí la etapa de eliminación.';
    } else if (!form.sportId) {
      return 'Elegí el deporte del amistoso.';
    }
    if (!form.homeClubId) return 'Elegí el club local.';
    if (!form.awayClubId) return 'Elegí el club visitante.';
    if (sameClub) return 'El local y el visitante no pueden ser el mismo club.';
    if (!form.date) return 'Falta la fecha.';
    if (!form.time) return 'Falta la hora.';
    if (!form.venue.trim()) return 'Falta la sede.';
    if (watchUrlInvalid) return 'El link para verlo tiene que empezar con http:// o https://.';
    return null;
  })();

  const goToList = () => router.push(MATCHES_HOME);

  const setMode = (mode: Mode) => {
    if (mode === form.mode) return;
    if (mode === 'friendly') {
      patch({
        mode,
        sportId: form.sportId || selectedTournament?.sportId || (ACTIVE_SPORTS.length === 1 ? ACTIVE_SPORTS[0].id : ''),
        phaseId: '',
        roundId: '',
        roundLabel: '',
        groupId: '',
      });
      return;
    }
    patch({ mode });
  };

  const handleSubmit = async () => {
    if (saving || blocked) return;
    setSaving(true);
    setSaveError(null);

    try {
      const dateTime = combineLocalDateTimeToUtcIso(form.date, form.time, APP_TIMEZONE);
      if (!dateTime) throw new Error('La fecha u hora del partido no son válidas.');

      const watchUrl = watchUrlTrimmed || null;
      const payload = {
        tournamentId: isTournament ? form.tournamentId : null,
        sportId: isTournament ? null : form.sportId,
        phaseId: isTournament ? form.phaseId || null : null,
        roundId: isTournament ? form.roundId || null : null,
        roundLabel: isTournament && !isPlayoff && !form.roundId ? form.roundLabel.trim() || null : null,
        groupId: isTournament ? form.groupId || null : null,
        category: form.category || null,
        homeClubId: form.homeClubId,
        awayClubId: form.awayClubId,
        homeSquadId: form.homeSquadId || null,
        awaySquadId: form.awaySquadId || null,
        dateTime,
        venue: form.venue.trim(),
        referee: form.referee.trim() || null,
        streamUrl: watchUrl,
        watchUrl,
        status: form.status,
        isPublic: form.isPublic,
        isVisible: form.isPublic,
      };

      const endpoint = isTournament ? `/api/tournaments/${form.tournamentId}/matches` : '/api/matches';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(await readErrorMessage(response, 'No se pudo crear el partido.'));
      }

      invalidateCache('matches_list');
      router.push(MATCHES_HOME);
    } catch (error) {
      console.error('[crear partido] Error al crear:', error);
      setSaveError(error instanceof Error ? error.message : 'No se pudo crear el partido.');
      setSaving(false);
    }
  };

  const phaseTypeLabel = (phaseType: string) => PHASE_TYPE_LABELS[phaseType] || phaseType;

  return (
    <div className="creation-body match-create">
      <div className="creation-container">
        <header className="creation-header">
          <button type="button" className="btn btn-outline btn-back" onClick={goToList}>
            <ChevronLeft size={16} /> Volver a partidos
          </button>
          <h1>Crear partido</h1>
          <p>Un partido de torneo entra al fixture de su fase. Un amistoso va suelto, con su deporte.</p>
        </header>

        {catalogError && (
          <div className="notice notice-error" role="alert">
            <div className="notice-body">
              <strong>No se pudo cargar {tournamentsState === 'error' && clubsState === 'error' ? 'el catálogo' : tournamentsState === 'error' ? 'la lista de torneos' : 'la lista de clubes'}</strong>
              <p>Sin eso el formulario no se puede completar. Reintentá; si sigue, revisá la sesión.</p>
            </div>
            <div className="notice-actions">
              <button type="button" className="btn btn-primary btn-inline" onClick={() => setCatalogReload((n) => n + 1)}>
                Reintentar
              </button>
            </div>
          </div>
        )}

        {saveError && (
          <div className="notice notice-error" role="alert" id="save-error">
            <div className="notice-body">
              <strong>No se pudo crear el partido</strong>
              <p>{saveError}</p>
            </div>
            <div className="notice-actions">
              <button type="button" className="btn btn-outline btn-inline" onClick={() => setSaveError(null)}>
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* 1. Competencia */}
        <article className="partition">
          <div className="partition-header">
            <div>
              <h2>1. Competencia</h2>
              <p>Dónde se juega y en qué instancia.</p>
            </div>
          </div>
          <div className="partition-body">
            <div className="form-grid">
              <div className="field-group">
                <span className="field-label" id="mode-label">Tipo de partido</span>
                <div className="choice-pair" role="radiogroup" aria-labelledby="mode-label">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={isTournament}
                    className={isTournament ? 'selected' : ''}
                    onClick={() => setMode('tournament')}
                  >
                    Partido de torneo
                    <span className="small">Entra al fixture de una fase y suma a la tabla.</span>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={!isTournament}
                    className={!isTournament ? 'selected' : ''}
                    onClick={() => setMode('friendly')}
                  >
                    Amistoso
                    <span className="small">Sin torneo. Elegís el deporte y listo.</span>
                  </button>
                </div>
              </div>

              {isTournament ? (
                <>
                  <div className="field-group">
                    <label htmlFor="tournament">Torneo</label>
                    <SearchSelect
                      id="tournament"
                      value={form.tournamentId}
                      onChange={(value) => patch({ tournamentId: value, phaseId: '', roundId: '', roundLabel: '', groupId: '' })}
                      options={tournamentOptions}
                      placeholder="Buscar por nombre…"
                      loading={tournamentsState === 'loading'}
                      disabled={tournamentsState === 'error'}
                      emptyText="Ningún torneo coincide."
                      describedBy="tournament-help"
                    />
                    <p className="field-help" id="tournament-help">
                      {tournamentsState === 'ok'
                        ? `${tournaments.length} torneos. Escribí para buscar.`
                        : tournamentsState === 'loading'
                          ? 'Cargando torneos…'
                          : 'La lista de torneos no está disponible.'}
                    </p>
                  </div>

                  <div className="grid-2">
                    <div className="field-group">
                      <label htmlFor="phase">Fase</label>
                      <select
                        id="phase"
                        className="form-select"
                        value={form.phaseId}
                        disabled={!form.tournamentId || structureState === 'loading' || phases.length === 0}
                        onChange={(event) => patch({ phaseId: event.target.value, roundId: '', roundLabel: '', groupId: '' })}
                      >
                        <option value="">
                          {!form.tournamentId
                            ? 'Elegí el torneo primero'
                            : structureState === 'loading'
                              ? 'Cargando fases…'
                              : phases.length === 0
                                ? 'El torneo no tiene fases'
                                : 'Elegí la fase…'}
                        </option>
                        {phases.map((phase) => (
                          <option key={phase.id} value={phase.id}>
                            {phase.name} · {phaseTypeLabel(phase.phase_type)}{phase.is_active ? ' · activa' : ''}
                          </option>
                        ))}
                      </select>
                      {form.tournamentId && structureState === 'ok' && phases.length === 0 && (
                        <p className="field-help-error">Sin fases no se puede cargar el partido. Crealas desde el gestor del torneo.</p>
                      )}
                    </div>

                    <div className="field-group">
                      <label htmlFor="round">{isPlayoff ? 'Etapa de eliminación' : 'Jornada'}</label>
                      <select
                        id="round"
                        className="form-select"
                        value={form.roundId}
                        disabled={!form.phaseId}
                        onChange={(event) => patch({ roundId: event.target.value })}
                      >
                        <option value="">
                          {!form.phaseId
                            ? 'Elegí la fase primero'
                            : isPlayoff
                              ? (availableRounds.length > 0 ? 'Elegí la etapa…' : 'Sin etapas definidas')
                              : (availableRounds.length > 0 ? 'Nueva jornada (escribila abajo)' : 'Sin jornadas cargadas: escribila abajo')}
                        </option>
                        {availableRounds.map((round) => (
                          <option key={round.id} value={round.id}>{round.name}</option>
                        ))}
                      </select>
                      {isPlayoff ? (
                        availableRounds.length === 0 && form.phaseId ? (
                          <p className="field-help-error">Una fase de eliminación necesita sus etapas cargadas en el gestor.</p>
                        ) : (
                          <p className="field-help">En eliminación el partido va a una etapa ya definida.</p>
                        )
                      ) : (
                        <>
                          {!form.roundId && form.phaseId && (
                            <input
                              id="round-label"
                              type="text"
                              className="form-input"
                              placeholder="Ej: Fecha 14"
                              aria-label="Nombre de la jornada nueva"
                              value={form.roundLabel}
                              onChange={(event) => patch({ roundLabel: event.target.value })}
                            />
                          )}
                          <p className="field-help">
                            {form.roundId
                              ? 'Se agrega a esa jornada.'
                              : 'Si la dejás vacía, el partido queda sin jornada.'}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="grid-2">
                    {availableGroups.length > 0 && (
                      <div className="field-group">
                        <label htmlFor="group">Grupo o zona</label>
                        <select
                          id="group"
                          className="form-select"
                          value={form.groupId}
                          onChange={(event) => patch({ groupId: event.target.value })}
                        >
                          <option value="">Sin grupo</option>
                          {availableGroups.map((group) => (
                            <option key={group.id} value={group.id}>{group.name}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="field-group">
                      <label htmlFor="category">Categoría <span className="opt">(opcional)</span></label>
                      <select
                        id="category"
                        className="form-select"
                        value={form.category}
                        onChange={(event) => patch({ category: event.target.value })}
                      >
                        <option value="">Sin categoría</option>
                        {CATEGORY_OPTIONS.map((category) => (
                          <option key={category} value={category}>{category}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid-2">
                  <div className="field-group">
                    <label htmlFor="sport">Deporte</label>
                    <select
                      id="sport"
                      className="form-select"
                      value={form.sportId}
                      onChange={(event) => patch({ sportId: event.target.value })}
                    >
                      <option value="">Elegí el deporte…</option>
                      {ACTIVE_SPORTS.map((sport) => (
                        <option key={sport.id} value={sport.id}>{sport.nameEs}</option>
                      ))}
                    </select>
                    <p className="field-help">El amistoso se archiva y se publica bajo este deporte.</p>
                  </div>
                  <div className="field-group">
                    <label htmlFor="category">Categoría <span className="opt">(opcional)</span></label>
                    <select
                      id="category"
                      className="form-select"
                      value={form.category}
                      onChange={(event) => patch({ category: event.target.value })}
                    >
                      <option value="">Sin categoría</option>
                      {CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>
        </article>

        {/* 2. Clubes */}
        <article className="partition">
          <div className="partition-header">
            <div>
              <h2>2. Clubes</h2>
              <p>{clubsHelp}</p>
            </div>
          </div>
          <div className="partition-body">
            <div className="match-teams">
              <section className="team-card" aria-labelledby="home-title">
                <h3 className="team-card-title" id="home-title">Local</h3>
                <div className="field-group">
                  <label htmlFor="home-club">Club</label>
                  <SearchSelect
                    id="home-club"
                    value={form.homeClubId}
                    onChange={(value) => patch({ homeClubId: value, homeSquadId: '' })}
                    options={clubOptions}
                    placeholder="Buscar club…"
                    loading={clubsLoading}
                    disabled={clubsState === 'error'}
                    invalid={sameClub}
                    emptyText="Ningún club coincide."
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="home-squad">Plantel <span className="opt">(opcional)</span></label>
                  <select
                    id="home-squad"
                    className="form-select"
                    value={form.homeSquadId}
                    disabled={!form.homeClubId || homeSquadsLoading}
                    onChange={(event) => patch({ homeSquadId: event.target.value })}
                  >
                    <option value="">
                      {!form.homeClubId ? 'Elegí el club primero' : homeSquadsLoading ? 'Cargando planteles…' : 'Selección automática'}
                    </option>
                    {homeSquads.map((squad) => (
                      <option key={squad.id} value={squad.id}>{squad.name}</option>
                    ))}
                  </select>
                  {form.homeClubId && !homeSquadsLoading && homeSquads.length === 0 && (
                    <p className="field-help">Este club no tiene planteles cargados.</p>
                  )}
                </div>
              </section>

              <div className="match-vs-divider" aria-hidden="true">
                <div className="vs-line" />
                <div className="vs-circle">VS</div>
                <div className="vs-line" />
              </div>

              <section className="team-card" aria-labelledby="away-title">
                <h3 className="team-card-title" id="away-title">Visitante</h3>
                <div className="field-group">
                  <label htmlFor="away-club">Club</label>
                  <SearchSelect
                    id="away-club"
                    value={form.awayClubId}
                    onChange={(value) => patch({ awayClubId: value, awaySquadId: '' })}
                    options={clubOptions}
                    placeholder="Buscar club…"
                    loading={clubsLoading}
                    disabled={clubsState === 'error'}
                    invalid={sameClub}
                    emptyText="Ningún club coincide."
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="away-squad">Plantel <span className="opt">(opcional)</span></label>
                  <select
                    id="away-squad"
                    className="form-select"
                    value={form.awaySquadId}
                    disabled={!form.awayClubId || awaySquadsLoading}
                    onChange={(event) => patch({ awaySquadId: event.target.value })}
                  >
                    <option value="">
                      {!form.awayClubId ? 'Elegí el club primero' : awaySquadsLoading ? 'Cargando planteles…' : 'Selección automática'}
                    </option>
                    {awaySquads.map((squad) => (
                      <option key={squad.id} value={squad.id}>{squad.name}</option>
                    ))}
                  </select>
                  {form.awayClubId && !awaySquadsLoading && awaySquads.length === 0 && (
                    <p className="field-help">Este club no tiene planteles cargados.</p>
                  )}
                </div>
              </section>
            </div>
            {sameClub && (
              <p className="field-help-error" role="alert" style={{ marginTop: 14 }}>
                El local y el visitante no pueden ser el mismo club.
              </p>
            )}
          </div>
        </article>

        {/* 3. Programación y sede */}
        <article className="partition">
          <div className="partition-header">
            <div>
              <h2>3. Programación y sede</h2>
              <p>La hora se guarda en horario de Buenos Aires ({APP_TIMEZONE}).</p>
            </div>
          </div>
          <div className="partition-body">
            <div className="form-grid">
              <div className="grid-3">
                <div className="field-group">
                  <label htmlFor="date">Fecha</label>
                  <input
                    id="date"
                    type="date"
                    className="form-input"
                    value={form.date}
                    onChange={(event) => patch({ date: event.target.value })}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="time">Hora</label>
                  <input
                    id="time"
                    type="time"
                    className="form-input"
                    value={form.time}
                    onChange={(event) => patch({ time: event.target.value })}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="venue">Estadio o sede</label>
                  <input
                    id="venue"
                    type="text"
                    className="form-input"
                    placeholder="Cancha o club"
                    autoComplete="off"
                    value={form.venue}
                    onChange={(event) => patch({ venue: event.target.value })}
                  />
                </div>
              </div>
              <div className="grid-2">
                <div className="field-group">
                  <label htmlFor="referee">Árbitro <span className="opt">(opcional)</span></label>
                  <input
                    id="referee"
                    type="text"
                    className="form-input"
                    placeholder="Nombre y apellido"
                    autoComplete="off"
                    value={form.referee}
                    onChange={(event) => patch({ referee: event.target.value })}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="watch-url">Link para verlo <span className="opt">(opcional)</span></label>
                  <input
                    id="watch-url"
                    type="url"
                    inputMode="url"
                    className={`form-input${watchUrlInvalid ? ' is-error' : ''}`}
                    placeholder="https://youtube.com/…"
                    autoComplete="off"
                    aria-invalid={watchUrlInvalid || undefined}
                    aria-describedby="watch-url-help"
                    value={form.watchUrl}
                    onChange={(event) => patch({ watchUrl: event.target.value })}
                  />
                  <p className={watchUrlInvalid ? 'field-help-error' : 'field-help'} id="watch-url-help">
                    {watchUrlInvalid
                      ? 'Tiene que empezar con http:// o https://.'
                      : 'Transmisión en vivo o repetición: YouTube, Twitch, etc.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </article>

        {/* 4. Estado y publicación */}
        <article className="partition">
          <div className="partition-header">
            <div>
              <h2>4. Estado y publicación</h2>
              <p>Cómo nace el partido y quién lo ve.</p>
            </div>
          </div>
          <div className="partition-body">
            <div className="grid-2">
              <div className="field-group">
                <span className="field-label" id="status-label">Estado</span>
                <div className="segmented" role="radiogroup" aria-labelledby="status-label">
                  {STATUS_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={form.status === option.value}
                      className={`segmented-btn tone-${option.tone}${form.status === option.value ? ' is-active' : ''}`}
                      onClick={() => patch({ status: option.value })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="field-help">
                  {STATUS_OPTIONS.find((option) => option.value === form.status)?.help}
                </p>
              </div>
              <div className="field-group">
                <span className="field-label" id="public-label">Publicación</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.isPublic}
                  aria-labelledby="public-label public-text"
                  className={`toggle${form.isPublic ? ' is-on' : ''}`}
                  onClick={() => patch({ isPublic: !form.isPublic })}
                >
                  <span className="toggle-track" aria-hidden="true">
                    <span className="toggle-thumb" />
                  </span>
                  <span className="toggle-text" id="public-text">
                    <strong>{form.isPublic ? 'Visible en la web y la app' : 'Oculto: solo se ve desde el panel'}</strong>
                    <span>Se puede cambiar después desde el partido.</span>
                  </span>
                </button>
              </div>
            </div>
          </div>
        </article>

        <footer className="actions-footer">
          {blocked && <p className="footer-blocked" id="create-blocked">{blocked}</p>}
          <button type="button" className="btn btn-outline" onClick={goToList} disabled={saving}>
            Descartar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={Boolean(blocked) || saving}
            aria-describedby={blocked ? 'create-blocked' : undefined}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="spin" /> Creando…
              </>
            ) : (
              'Crear partido'
            )}
          </button>
        </footer>
      </div>
    </div>
  );
}
