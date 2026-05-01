'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArchiveRestore,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  Copy,
  Loader2,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react';
import { HistoricalSeasonImportWizard } from './HistoricalSeasonImportWizard';
import './season-creation.css';

type SeasonStatus = 'draft' | 'active' | 'completed' | 'archived';
type CreationMode = 'quick' | 'copy' | 'advanced' | 'historical';

type SeasonRow = {
  id: string;
  season_code: string;
  name: string;
  display_name?: string | null;
  status: SeasonStatus | string;
  is_active?: boolean | null;
  entries_count?: number;
  rosters_count?: number;
};

type ClubOption = { id: string; label: string; meta?: string | null };

type RosterRow = {
  id: string;
  name: string;
  status: string;
  roster_type: string;
  club?: { id: string; name?: string | null; short_name?: string | null } | null;
  memberships?: Array<{
    id: string;
    status: string;
    jersey_number?: number | null;
    player?: {
      id: string;
      first_name?: string | null;
      last_name?: string | null;
      full_name?: string | null;
      name?: string | null;
    } | null;
  }>;
};
type RosterMembership = NonNullable<RosterRow['memberships']>[number];
type RosterPlayer = RosterMembership['player'];

type FormState = {
  name: string;
  year: string;
  startDate: string;
  endDate: string;
  status: SeasonStatus;
  sourceSeasonId: string;
  copyConfig: boolean;
  copyParticipants: boolean;
  copyRosters: boolean;
  copyRosterMemberships: boolean;
  markActive: boolean;
};

type AdvancedState = {
  step: number;
  description: string;
  visibility: 'private' | 'public';
  format: string;
  groupsCount: number;
  homeAndAway: boolean;
  pointsWin: number;
  pointsDraw: number;
  pointsLoss: number;
  regulation: string;
  allowMultiTeamPlayers: boolean;
  allowGuestPlayers: boolean;
  allowTransfers: boolean;
  participantSourceSeasonId: string;
  copyParticipantsFromSource: boolean;
  createEmptyRosters: boolean;
  copyRosterStructure: boolean;
  copyRosterMemberships: boolean;
};

type Toast = { type: 'ok' | 'error' | 'warning'; text: string } | null;

const nextYear = String(new Date().getFullYear() + 1);

function emptyForm(tournamentName: string): FormState {
  return {
    name: `${tournamentName} ${nextYear}`.trim(),
    year: nextYear,
    startDate: '',
    endDate: '',
    status: 'draft',
    sourceSeasonId: '',
    copyConfig: true,
    copyParticipants: true,
    copyRosters: false,
    copyRosterMemberships: false,
    markActive: false,
  };
}

function emptyAdvanced(): AdvancedState {
  return {
    step: 1,
    description: '',
    visibility: 'private',
    format: 'league',
    groupsCount: 1,
    homeAndAway: false,
    pointsWin: 4,
    pointsDraw: 2,
    pointsLoss: 0,
    regulation: '',
    allowMultiTeamPlayers: true,
    allowGuestPlayers: true,
    allowTransfers: true,
    participantSourceSeasonId: '',
    copyParticipantsFromSource: false,
    createEmptyRosters: true,
    copyRosterStructure: false,
    copyRosterMemberships: false,
  };
}

function statusLabel(status: string) {
  if (status === 'active') return 'Activa';
  if (status === 'completed') return 'Finalizada';
  if (status === 'archived') return 'Archivada';
  return 'Borrador';
}

function getPlayerName(player: RosterPlayer) {
  if (!player) return 'Jugador';
  const byParts = `${player.first_name || ''} ${player.last_name || ''}`.trim();
  return player.full_name || player.name || byParts || 'Jugador';
}

export function TournamentSeasonCreationModal({
  open,
  tournamentId,
  tournamentName,
  onClose,
  onCreated,
}: {
  open: boolean;
  tournamentId: string;
  tournamentName: string;
  onClose: () => void;
  onCreated: (seasonId: string) => void;
}) {
  const [mode, setMode] = useState<CreationMode>('quick');
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [form, setForm] = useState<FormState>(() => emptyForm(tournamentName));
  const [advanced, setAdvanced] = useState<AdvancedState>(() => emptyAdvanced());
  const [selectedClubs, setSelectedClubs] = useState<ClubOption[]>([]);
  const [clubSearch, setClubSearch] = useState('');
  const [clubResults, setClubResults] = useState<ClubOption[]>([]);
  const [selectedRosterSeasonId, setSelectedRosterSeasonId] = useState('');
  const [rosters, setRosters] = useState<RosterRow[]>([]);
  const [playerDrafts, setPlayerDrafts] = useState<Record<string, { firstName: string; lastName: string; jerseyNumber: string }>>({});
  const [loadingSeasons, setLoadingSeasons] = useState(false);
  const [loadingRosters, setLoadingRosters] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  const sourceOptions = useMemo(
    () => seasons.map((season) => ({
      id: season.id,
      label: `${season.season_code || season.name} - ${season.display_name || season.name}`,
    })),
    [seasons],
  );

  const activeSeason = useMemo(
    () => seasons.find((season) => season.is_active) || seasons[0] || null,
    [seasons],
  );

  const estimatedRosters = useMemo(() => {
    const source = seasons.find((season) => season.id === form.sourceSeasonId);
    if (mode === 'copy' || advanced.copyParticipantsFromSource) {
      return source?.entries_count ?? 0;
    }
    return selectedClubs.length;
  }, [advanced.copyParticipantsFromSource, form.sourceSeasonId, mode, seasons, selectedClubs.length]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, open]);

  const loadSeasons = useCallback(async () => {
    setLoadingSeasons(true);
    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/seasons`, { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) throw new Error(json?.error || 'No se pudieron cargar las temporadas.');
      const rows = Array.isArray(json.seasons) ? json.seasons as SeasonRow[] : [];
      const defaultSeason = rows.find((season) => season.is_active) || rows[0] || null;
      setSeasons(rows);
      setSelectedRosterSeasonId(defaultSeason?.id || '');
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'No se pudieron cargar las temporadas.' });
    } finally {
      setLoadingSeasons(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    if (!open) return;
    setMode('quick');
    setToast(null);
    setForm(emptyForm(tournamentName));
    setAdvanced(emptyAdvanced());
    setSelectedClubs([]);
    setClubSearch('');
    setClubResults([]);
    void loadSeasons();
  }, [loadSeasons, open, tournamentName]);

  useEffect(() => {
    if (!open || !clubSearch.trim()) {
      setClubResults([]);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/catalog/clubs?search=${encodeURIComponent(clubSearch)}&limit=12`, {
          signal: controller.signal,
        });
        const json = await response.json().catch(() => ({}));
        setClubResults(Array.isArray(json?.data) ? json.data : []);
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setClubResults([]);
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [clubSearch, open]);

  const loadRosters = useCallback(async (seasonId: string) => {
    if (!seasonId) {
      setRosters([]);
      return;
    }
    setLoadingRosters(true);
    try {
      const response = await fetch(`/api/tournament-seasons/${seasonId}/rosters?includeMemberships=true`, { cache: 'no-store' });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) throw new Error(json?.error || 'No se pudieron cargar los planteles.');
      setRosters(Array.isArray(json.rosters) ? json.rosters : []);
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'No se pudieron cargar los planteles.' });
    } finally {
      setLoadingRosters(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadRosters(selectedRosterSeasonId);
  }, [loadRosters, open, selectedRosterSeasonId]);

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateAdvanced = <K extends keyof AdvancedState>(key: K, value: AdvancedState[K]) => {
    setAdvanced((current) => ({ ...current, [key]: value }));
  };

  const addClub = (club: ClubOption) => {
    setSelectedClubs((current) => current.some((item) => item.id === club.id) ? current : [...current, club]);
    setClubSearch('');
    setClubResults([]);
  };

  const createSeason = async (payload: Record<string, unknown>) => {
    const response = await fetch(`/api/tournaments/${tournamentId}/seasons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || !json?.ok) throw new Error(json?.error || 'No se pudo crear la temporada.');
    return json.season?.id || json.seasonId || null;
  };

  const createSelectedEntries = async (seasonId: string) => {
    for (const club of selectedClubs) {
      const response = await fetch(`/api/tournament-seasons/${seasonId}/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createEntry',
          clubId: club.id,
          status: 'active',
          createRoster: advanced.createEmptyRosters,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) throw new Error(json?.error || `No se pudo agregar ${club.label}.`);
    }
  };

  const submitSeason = async () => {
    if (!form.year.trim()) {
      setToast({ type: 'error', text: 'El anio o periodo es requerido.' });
      return;
    }
    setSaving(true);
    setToast(null);
    try {
      const shouldCopy =
        mode === 'copy' ||
        (mode === 'quick' && Boolean(form.sourceSeasonId)) ||
        (mode === 'advanced' && advanced.copyParticipantsFromSource);
      const payload: Record<string, unknown> = {
        action: shouldCopy ? 'copy' : 'create',
        name: form.name.trim() || `${tournamentName} ${form.year}`.trim(),
        year: form.year,
        status: form.markActive ? 'active' : form.status,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };

      if (shouldCopy) {
        payload.sourceSeasonId = form.sourceSeasonId;
        payload.copyConfig = mode === 'advanced' ? true : form.copyConfig;
        payload.copyParticipants = mode === 'advanced' ? advanced.copyParticipantsFromSource : form.copyParticipants;
        payload.copyRosters = mode === 'advanced' ? advanced.copyRosterStructure : form.copyRosters;
        payload.copyRosterMemberships = mode === 'advanced' ? advanced.copyRosterMemberships : form.copyRosterMemberships;
      }

      if (mode === 'advanced') {
        payload.settings = {
          description: advanced.description,
          visibility: advanced.visibility,
          rosterRules: {
            allowMultiTeamPlayers: advanced.allowMultiTeamPlayers,
            allowGuestPlayers: advanced.allowGuestPlayers,
            allowTransfers: advanced.allowTransfers,
          },
          creationFlow: 'manual-advanced',
        };
        payload.ruleset = {
          format: advanced.format,
          groupsCount: advanced.groupsCount,
          homeAndAway: advanced.homeAndAway,
          points: {
            win: advanced.pointsWin,
            draw: advanced.pointsDraw,
            loss: advanced.pointsLoss,
          },
          regulation: advanced.regulation,
        };
      }

      const seasonId = await createSeason(payload);
      if (!seasonId) throw new Error('La temporada se creo, pero no se recibio su ID.');

      if (selectedClubs.length > 0) await createSelectedEntries(seasonId);
      if (advanced.createEmptyRosters) {
        await fetch(`/api/tournament-seasons/${seasonId}/rosters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'ensureFromEntries' }),
        });
      }

      setToast({ type: 'ok', text: 'Temporada creada correctamente.' });
      onCreated(seasonId);
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo crear la temporada.' });
    } finally {
      setSaving(false);
    }
  };

  const addPlayerToRoster = async (rosterId: string) => {
    const draft = playerDrafts[rosterId] || { firstName: '', lastName: '', jerseyNumber: '' };
    if (!draft.firstName.trim() || !draft.lastName.trim()) {
      setToast({ type: 'error', text: 'Nombre y apellido son requeridos.' });
      return;
    }

    setSaving(true);
    setToast(null);
    try {
      const response = await fetch(`/api/tournament-seasons/${selectedRosterSeasonId}/rosters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addPlayer',
          rosterId,
          firstName: draft.firstName,
          lastName: draft.lastName,
          jerseyNumber: draft.jerseyNumber ? Number(draft.jerseyNumber) : null,
        }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok || !json?.ok) throw new Error(json?.error || 'No se pudo agregar el jugador.');
      const hasWarning = Array.isArray(json.warnings) && json.warnings.some((warning: any) => warning?.code === 'player_active_elsewhere');
      setToast({
        type: hasWarning ? 'warning' : 'ok',
        text: hasWarning
          ? 'Este jugador ya esta activo en otro plantel de esta temporada. Se agrego igualmente.'
          : 'Jugador agregado al plantel.',
      });
      setPlayerDrafts((current) => ({ ...current, [rosterId]: { firstName: '', lastName: '', jerseyNumber: '' } }));
      await loadRosters(selectedRosterSeasonId);
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'No se pudo agregar el jugador.' });
    } finally {
      setSaving(false);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  const requiresSourceSeason = mode === 'copy' || (mode === 'advanced' && advanced.copyParticipantsFromSource);
  const canSubmit = Boolean((form.name.trim() || tournamentName) && form.year.trim() && (!requiresSourceSeason || form.sourceSeasonId));

  return createPortal(
    <>
      <div className="season-modal-backdrop" onClick={onClose} />
      <section className="season-modal" role="dialog" aria-modal="true" aria-label="Nueva temporada">
        <header className="season-modal-header">
          <div>
            <span className="season-modal-kicker">Temporadas</span>
            <h2>Nueva temporada</h2>
            <p>{tournamentName}</p>
          </div>
          <button type="button" className="season-icon-button" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </header>

        <div className="season-modal-layout">
          <aside className="season-modal-rail">
            <button type="button" className={`season-mode ${mode === 'quick' ? 'is-active' : ''}`} onClick={() => setMode('quick')}>
              <CalendarPlus size={16} />
              <span>Creacion rapida</span>
            </button>
            <button type="button" className={`season-mode ${mode === 'copy' ? 'is-active' : ''}`} onClick={() => {
              setMode('copy');
              updateForm('sourceSeasonId', form.sourceSeasonId || activeSeason?.id || '');
            }}>
              <Copy size={16} />
              <span>Copiar temporada</span>
            </button>
            <button type="button" className={`season-mode ${mode === 'advanced' ? 'is-active' : ''}`} onClick={() => setMode('advanced')}>
              <ClipboardList size={16} />
              <span>Manual avanzada</span>
            </button>
            <button type="button" className={`season-mode ${mode === 'historical' ? 'is-active' : ''}`} onClick={() => setMode('historical')}>
              <ArchiveRestore size={16} />
              <span>Cargar historica</span>
            </button>

            <div className="season-side-section">
              <span className="season-side-label">Disponibles</span>
              {loadingSeasons ? (
                <div className="season-side-loading"><Loader2 size={14} className="spin" /> Cargando</div>
              ) : seasons.length > 0 ? (
                <div className="season-list-mini">
                  {seasons.map((season) => (
                    <button
                      type="button"
                      key={season.id}
                      className={`season-list-mini-item ${selectedRosterSeasonId === season.id ? 'is-selected' : ''}`}
                      onClick={() => setSelectedRosterSeasonId(season.id)}
                    >
                      <strong>{season.season_code || season.name}</strong>
                      <small>{statusLabel(season.status)} - {season.rosters_count ?? 0} planteles</small>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="season-side-empty">Sin temporadas cargadas.</div>
              )}
            </div>
          </aside>

          <main className="season-modal-main">
            {toast ? (
              <div className={`season-toast tone-${toast.type}`}>
                {toast.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
                <span>{toast.text}</span>
              </div>
            ) : null}

            {mode === 'historical' ? (
              <HistoricalSeasonImportWizard
                tournamentId={tournamentId}
                onBack={() => setMode('quick')}
                onComplete={(target) => {
                  if (target.seasonId) onCreated(target.seasonId);
                }}
                showStandaloneHeader={false}
                redirectTab="resumen"
              />
            ) : (
              <div className="season-grid">
                <section className="season-panel">
                  <div className="season-panel-head">
                    <span>{mode === 'advanced' ? `Paso ${advanced.step} de 5` : 'Datos base'}</span>
                    <h3>
                      {mode === 'quick' && 'Creacion rapida'}
                      {mode === 'copy' && 'Crear copiando otra temporada'}
                      {mode === 'advanced' && ['Datos generales', 'Formato y reglas', 'Participantes', 'Planteles', 'Confirmacion'][advanced.step - 1]}
                    </h3>
                  </div>

                  {(mode !== 'advanced' || advanced.step === 1) && (
                    <div className="season-form-grid">
                      <label>
                        <span>Nombre</span>
                        <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} />
                      </label>
                      <label>
                        <span>Anio o periodo</span>
                        <input value={form.year} onChange={(event) => updateForm('year', event.target.value)} />
                      </label>
                      <label>
                        <span>Inicio</span>
                        <input type="date" value={form.startDate} onChange={(event) => updateForm('startDate', event.target.value)} />
                      </label>
                      <label>
                        <span>Fin opcional</span>
                        <input type="date" value={form.endDate} onChange={(event) => updateForm('endDate', event.target.value)} />
                      </label>
                      <label>
                        <span>Estado inicial</span>
                        <select value={form.status} onChange={(event) => updateForm('status', event.target.value as SeasonStatus)}>
                          <option value="draft">Borrador</option>
                          <option value="active">Activa</option>
                        </select>
                      </label>
                      {mode === 'advanced' ? (
                        <>
                          <label>
                            <span>Visibilidad</span>
                            <select value={advanced.visibility} onChange={(event) => updateAdvanced('visibility', event.target.value as AdvancedState['visibility'])}>
                              <option value="private">Privada</option>
                              <option value="public">Publica</option>
                            </select>
                          </label>
                          <label className="season-span-2">
                            <span>Descripcion</span>
                            <textarea value={advanced.description} onChange={(event) => updateAdvanced('description', event.target.value)} rows={3} />
                          </label>
                        </>
                      ) : null}
                    </div>
                  )}

                  {(mode === 'copy' || mode === 'quick') && (
                    <div className="season-copy-options">
                      <label>
                        <span>Temporada base opcional</span>
                        <select value={form.sourceSeasonId} onChange={(event) => updateForm('sourceSeasonId', event.target.value)}>
                          <option value="">Crear desde cero</option>
                          {sourceOptions.map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className="season-check-grid">
                        <label><input type="checkbox" checked={form.copyConfig} onChange={(event) => updateForm('copyConfig', event.target.checked)} /> Copiar configuracion</label>
                        <label><input type="checkbox" checked={form.copyParticipants} onChange={(event) => updateForm('copyParticipants', event.target.checked)} /> Copiar participantes</label>
                        <label><input type="checkbox" checked={form.copyRosters} onChange={(event) => updateForm('copyRosters', event.target.checked)} /> Copiar planteles</label>
                        <label><input type="checkbox" checked={form.copyRosterMemberships} onChange={(event) => updateForm('copyRosterMemberships', event.target.checked)} /> Copiar jugadores</label>
                        <label><input type="checkbox" checked={form.markActive} onChange={(event) => updateForm('markActive', event.target.checked)} /> Marcar activa</label>
                      </div>
                    </div>
                  )}

                  {mode === 'advanced' && advanced.step === 2 && (
                    <div className="season-form-grid">
                      <label>
                        <span>Formato</span>
                        <select value={advanced.format} onChange={(event) => updateAdvanced('format', event.target.value)}>
                          <option value="league">Liga</option>
                          <option value="group_stage">Grupos</option>
                          <option value="playoff">Playoff</option>
                          <option value="circuit">Circuito</option>
                        </select>
                      </label>
                      <label>
                        <span>Grupos o zonas</span>
                        <input type="number" min={1} value={advanced.groupsCount} onChange={(event) => updateAdvanced('groupsCount', Number(event.target.value) || 1)} />
                      </label>
                      <label>
                        <span>Puntos victoria</span>
                        <input type="number" value={advanced.pointsWin} onChange={(event) => updateAdvanced('pointsWin', Number(event.target.value) || 0)} />
                      </label>
                      <label>
                        <span>Puntos empate</span>
                        <input type="number" value={advanced.pointsDraw} onChange={(event) => updateAdvanced('pointsDraw', Number(event.target.value) || 0)} />
                      </label>
                      <label>
                        <span>Puntos derrota</span>
                        <input type="number" value={advanced.pointsLoss} onChange={(event) => updateAdvanced('pointsLoss', Number(event.target.value) || 0)} />
                      </label>
                      <div className="season-check-grid season-span-2">
                        <label><input type="checkbox" checked={advanced.homeAndAway} onChange={(event) => updateAdvanced('homeAndAway', event.target.checked)} /> Ida y vuelta</label>
                        <label><input type="checkbox" checked={advanced.allowMultiTeamPlayers} onChange={(event) => updateAdvanced('allowMultiTeamPlayers', event.target.checked)} /> Jugadores en multiples equipos</label>
                        <label><input type="checkbox" checked={advanced.allowGuestPlayers} onChange={(event) => updateAdvanced('allowGuestPlayers', event.target.checked)} /> Jugadores invitados</label>
                        <label><input type="checkbox" checked={advanced.allowTransfers} onChange={(event) => updateAdvanced('allowTransfers', event.target.checked)} /> Transferencias</label>
                      </div>
                      <label className="season-span-2">
                        <span>Reglamento</span>
                        <textarea value={advanced.regulation} onChange={(event) => updateAdvanced('regulation', event.target.value)} rows={4} />
                      </label>
                    </div>
                  )}

                  {mode === 'advanced' && advanced.step === 3 && (
                    <div className="season-stack">
                      <label>
                        <span>Copiar equipos de otra temporada</span>
                        <select value={advanced.participantSourceSeasonId} onChange={(event) => {
                          updateAdvanced('participantSourceSeasonId', event.target.value);
                          updateForm('sourceSeasonId', event.target.value);
                        }}>
                          <option value="">No copiar</option>
                          {sourceOptions.map((option) => (
                            <option key={option.id} value={option.id}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="season-inline-check">
                        <input type="checkbox" checked={advanced.copyParticipantsFromSource} onChange={(event) => updateAdvanced('copyParticipantsFromSource', event.target.checked)} />
                        Copiar participantes de la temporada base
                      </label>
                      <div className="season-search-box">
                        <Search size={15} />
                        <input placeholder="Buscar club/equipo existente" value={clubSearch} onChange={(event) => setClubSearch(event.target.value)} />
                      </div>
                      {clubResults.length > 0 ? (
                        <div className="season-search-results">
                          {clubResults.map((club) => (
                            <button key={club.id} type="button" onClick={() => addClub(club)}>
                              <strong>{club.label}</strong>
                              <small>{club.meta}</small>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="season-chip-list">
                        {selectedClubs.map((club) => (
                          <button key={club.id} type="button" onClick={() => setSelectedClubs((current) => current.filter((item) => item.id !== club.id))}>
                            {club.label}
                            <X size={12} />
                          </button>
                        ))}
                        {selectedClubs.length === 0 ? <span>No hay equipos manuales agregados.</span> : null}
                      </div>
                    </div>
                  )}

                  {mode === 'advanced' && advanced.step === 4 && (
                    <div className="season-check-grid">
                      <label><input type="checkbox" checked={advanced.createEmptyRosters} onChange={(event) => updateAdvanced('createEmptyRosters', event.target.checked)} /> Crear planteles vacios por equipo</label>
                      <label><input type="checkbox" checked={advanced.copyRosterStructure} onChange={(event) => updateAdvanced('copyRosterStructure', event.target.checked)} /> Copiar estructura de planteles</label>
                      <label><input type="checkbox" checked={advanced.copyRosterMemberships} onChange={(event) => updateAdvanced('copyRosterMemberships', event.target.checked)} /> Copiar jugadores como nuevas inscripciones</label>
                    </div>
                  )}

                  {mode === 'advanced' && advanced.step === 5 && (
                    <div className="season-confirm">
                      <div><span>Temporada</span><strong>{form.name || `${tournamentName} ${form.year}`}</strong></div>
                      <div><span>Estado</span><strong>{form.markActive ? 'Activa' : statusLabel(form.status)}</strong></div>
                      <div><span>Equipos manuales</span><strong>{selectedClubs.length}</strong></div>
                      <div><span>Planteles estimados</span><strong>{estimatedRosters}</strong></div>
                      <div><span>Jugadores copiados</span><strong>{advanced.copyRosterMemberships ? 'Segun base' : '0'}</strong></div>
                      <p>No se copiaran partidos jugados, resultados, estadisticas, eventos ni tabla de posiciones.</p>
                    </div>
                  )}

                  <div className="season-actions">
                    {mode === 'advanced' && advanced.step > 1 ? (
                      <button type="button" className="basalt-btn" onClick={() => updateAdvanced('step', Math.max(1, advanced.step - 1))}>Atras</button>
                    ) : <span />}
                    {mode === 'advanced' && advanced.step < 5 ? (
                      <button type="button" className="basalt-btn basalt-btn-primary" onClick={() => updateAdvanced('step', Math.min(5, advanced.step + 1))}>Siguiente</button>
                    ) : (
                      <button type="button" className="basalt-btn basalt-btn-primary" disabled={saving || !canSubmit} onClick={() => void submitSeason()}>
                        {saving ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
                        Crear temporada
                      </button>
                    )}
                  </div>
                </section>

                <section className="season-panel season-roster-panel">
                  <div className="season-panel-head">
                    <span>Planteles por temporada</span>
                    <h3>Archivo de planteles</h3>
                  </div>
                  <label>
                    <span>Temporada</span>
                    <select value={selectedRosterSeasonId} onChange={(event) => setSelectedRosterSeasonId(event.target.value)}>
                      {sourceOptions.map((option) => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <div className="season-roster-list">
                    {loadingRosters ? (
                      <div className="season-side-loading"><Loader2 size={14} className="spin" /> Cargando planteles</div>
                    ) : rosters.length > 0 ? rosters.map((roster) => {
                      const draft = playerDrafts[roster.id] || { firstName: '', lastName: '', jerseyNumber: '' };
                      return (
                        <article key={roster.id} className="season-roster-item">
                          <div className="season-roster-title">
                            <strong>{roster.name}</strong>
                            <small>{roster.club?.name || 'Club'} - {roster.memberships?.length ?? 0} jugadores</small>
                          </div>
                          <div className="season-roster-members">
                            {(roster.memberships || []).slice(0, 5).map((membership) => (
                              <span key={membership.id}>{membership.jersey_number ? `#${membership.jersey_number} ` : ''}{getPlayerName(membership.player)}</span>
                            ))}
                          </div>
                          <div className="season-player-form">
                            <input placeholder="Nombre" value={draft.firstName} onChange={(event) => setPlayerDrafts((current) => ({ ...current, [roster.id]: { ...draft, firstName: event.target.value } }))} />
                            <input placeholder="Apellido" value={draft.lastName} onChange={(event) => setPlayerDrafts((current) => ({ ...current, [roster.id]: { ...draft, lastName: event.target.value } }))} />
                            <input placeholder="#" value={draft.jerseyNumber} onChange={(event) => setPlayerDrafts((current) => ({ ...current, [roster.id]: { ...draft, jerseyNumber: event.target.value } }))} />
                            <button type="button" onClick={() => void addPlayerToRoster(roster.id)} disabled={saving} aria-label="Agregar jugador">
                              <Users size={14} />
                            </button>
                          </div>
                        </article>
                      );
                    }) : (
                      <div className="season-side-empty">No hay planteles para esta temporada.</div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </main>
        </div>
      </section>
    </>,
    document.body,
  );
}
