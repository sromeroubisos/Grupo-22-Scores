'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, ArrowLeft } from 'lucide-react';
import { APP_TIMEZONE, combineLocalDateTimeToUtcIso } from '@/lib/timezone';
import { invalidateCache } from '@/lib/cache/superAdminCache';
import { getActiveSports } from '@/lib/data/sports';
import '../../creation-forms.css';
import './monolith.css';
import { CustomSelect } from './CustomSelect';

interface Tournament {
  id: string;
  name: string;
  season: string | null;
  division_id: string | null;
  sportId?: string | null;
  type?: 'internal' | 'external';
  externalId?: string;
  url?: string;
  ids?: {
    tournamentId?: string;
    stageId?: string;
    templateId?: string;
    seasonId?: string;
  };
}

interface Club {
  id: string;
  name: string;
  short_name: string | null;
  logo: string | null;
  sport?: string | null;
}

interface Squad {
  id: string;
  name: string;
}

interface TournamentPhaseOption {
  id: string;
  name: string;
  phase_type: string;
  is_active: boolean;
}

interface TournamentRoundOption {
  id: string;
  name: string;
  phaseId: string;
}

interface TournamentGroupOption {
  id: string;
  name: string;
  phaseId: string;
}

type MatchStatus = 'scheduled' | 'postponed' | 'suspended';

const ACTIVE_SPORTS = getActiveSports();

function getSportVariants(sport: string): string[] {
  const lower = sport.toLowerCase();
  switch (lower) {
    case 'rugby': return ['rugby', 'rugby-union', 'rugby-league'];
    case 'rugby-union': return ['rugby', 'rugby-union'];
    case 'rugby-league': return ['rugby', 'rugby-league'];
    case 'football': return ['football', 'soccer'];
    case 'hockey': return ['hockey', 'field-hockey'];
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

// Helpers for date conversion
const toDisplayDate = (isoDate: string) => {
  if (!isoDate) return '';
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
};

const fromDisplayDate = (val: string) => {
  // DD/MM/YYYY -> YYYY-MM-DD
  const parts = val.split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  if (!y || y.length !== 4) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
};

export default function CreateMatchPage() {
  // 1. Hooks
  const router = useRouter();
  const searchParams = useSearchParams();
  const tournamentIdParam = searchParams.get('tournamentId');
  const dateInputRef = useRef<HTMLInputElement>(null);

  // 2. State
  const [isFriendly, setIsFriendly] = useState(false);
  const [formData, setFormData] = useState({
    season: new Date().getFullYear().toString(),
    tournamentId: tournamentIdParam || '',
    sportId: '',
    phase: '',
    roundId: '',
    round: '',
    groupId: '',
    category: '',
    homeClubId: '',
    awayClubId: '',
    homeSquadId: '',
    awaySquadId: '',
    date: '',
    time: '',
    venue: '',
    city: '',
    isNeutralVenue: false,
    address: '',
    watchUrl: '',
    referee: '',
    assistants: '',
    status: 'scheduled' as MatchStatus,
    isPublic: true,
    isFeatured: false,
  });

  const [displayDate, setDisplayDate] = useState('');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [tournamentParticipants, setTournamentParticipants] = useState<Club[]>([]);
  const [homeSquads, setHomeSquads] = useState<Squad[]>([]);
  const [awaySquads, setAwaySquads] = useState<Squad[]>([]);
  const [tournamentPhases, setTournamentPhases] = useState<TournamentPhaseOption[]>([]);
  const [tournamentRounds, setTournamentRounds] = useState<TournamentRoundOption[]>([]);
  const [tournamentGroups, setTournamentGroups] = useState<TournamentGroupOption[]>([]);
  const [loading, setLoading] = useState(false);

  // 3. Functional Definitions

  const loadTournaments = async () => {
    try {
      const response = await fetch('/api/catalog/tournaments');
      if (response.ok) {
        const data = await response.json();
        const tournamentsArray = Array.isArray(data) ? data : (data.data || []);
        // Only show tournaments from the database
        const internalTournaments = tournamentsArray.filter((t: any) => t.meta !== 'fs');

        setTournaments(internalTournaments.map((t: any) => ({
          id: t.id,
          name: t.label,
          sportId: t.sportId || t.sport_id || t.sport || null,
          type: 'internal',
          externalId: t.external_id,
          url: t.url,
          ids: t.ids
        })));
      }
    } catch (error) {
      console.error('Error loading tournaments:', error);
      setTournaments([]);
    }
  };

  const loadClubs = async () => {
    try {
      const response = await fetch('/api/admin/clubs');
      if (response.ok) {
        const data = await response.json();
        const clubsArray = Array.isArray(data) ? data : (data.data || []);
        setClubs(clubsArray.map((c: any) => ({
          ...c,
          logo: c.logo || c.logo_url,
          sport: c.sport_id || c.sport || null,
        })));
      }
    } catch (error) {
      console.error('Error loading clubs:', error);
      setClubs([]);
    }
  };

  const loadTournamentParticipants = async (id: string) => {
    try {
      const tournament = tournaments.find(t => t.id === id);
      const isExternal = tournament?.type === 'external' || id.startsWith('fs-');

      let endpoint = `/api/tournaments/${id}/participants`;
      if (isExternal && tournament?.ids) {
        const { tournamentId, stageId } = tournament.ids;
        if (tournamentId || stageId) {
          const params = new URLSearchParams();
          if (tournamentId) params.append('tournamentId', tournamentId);
          if (stageId) params.append('stageId', stageId);
          endpoint += `?${params.toString()}`;
        }
      }

      const response = await fetch(endpoint);
      if (response.ok) {
        const data = await response.json();
        const participantsArray = Array.isArray(data) ? data : (data.data || []);
        setTournamentParticipants(participantsArray);
      } else {
        setTournamentParticipants([]);
      }
    } catch (error) {
      console.error('Error loading tournament participants:', error);
      setTournamentParticipants([]);
    }
  };

  const loadTournamentStructure = async (id: string) => {
    try {
      const [phasesResponse, fixtureResponse, groupsResponse] = await Promise.all([
        fetch(`/api/tournaments/${id}/phases`, { cache: 'no-store' }),
        fetch(`/api/tournaments/${id}/fixture`, { cache: 'no-store' }),
        fetch(`/api/tournaments/${id}/groups`, { cache: 'no-store' }),
      ]);

      const phasesJson = phasesResponse.ok ? await phasesResponse.json() : { data: [] };
      const fixtureJson = fixtureResponse.ok ? await fixtureResponse.json() : null;
      const groupsJson = groupsResponse.ok ? await groupsResponse.json() : [];

      const nextPhases: TournamentPhaseOption[] = Array.isArray(phasesJson?.data)
        ? phasesJson.data.map((phase: any) => ({
            id: String(phase.id),
            name: String(phase.name || 'Fase'),
            phase_type: String(phase.phase_type || 'league'),
            is_active: Boolean(phase.is_active),
          }))
        : [];

      const nextRounds: TournamentRoundOption[] = Array.isArray(fixtureJson?.phases)
        ? fixtureJson.phases.flatMap((phase: any) =>
            Array.isArray(phase?.rounds)
              ? phase.rounds
                  .filter((round: any) => typeof round?.id === 'string' && !round.id.startsWith('orphaned-'))
                  .map((round: any) => ({
                    id: String(round.id),
                    name: String(round.name || 'Jornada'),
                    phaseId: String(phase.id),
                  }))
              : []
          )
        : [];

      const nextGroups: TournamentGroupOption[] = Array.isArray(groupsJson)
        ? groupsJson.map((group: any) => ({
            id: String(group.id),
            name: String(group.name || 'Grupo'),
            phaseId: String(group.phase_id || ''),
          }))
        : [];

      setTournamentPhases(nextPhases);
      setTournamentRounds(nextRounds);
      setTournamentGroups(nextGroups);

      setFormData((prev) => {
        const resolvedPhaseId = nextPhases.some((phase) => phase.id === prev.phase)
          ? prev.phase
          : (nextPhases.find((phase) => phase.is_active)?.id || nextPhases[0]?.id || '');
        const nextRoundId = nextRounds.some((round) => round.phaseId === resolvedPhaseId && round.id === prev.roundId)
          ? prev.roundId
          : '';
        const nextGroupId = nextGroups.some((group) => group.phaseId === resolvedPhaseId && group.id === prev.groupId)
          ? prev.groupId
          : '';

        if (
          prev.phase === resolvedPhaseId &&
          prev.roundId === nextRoundId &&
          prev.groupId === nextGroupId
        ) {
          return prev;
        }

        return {
          ...prev,
          phase: resolvedPhaseId,
          roundId: nextRoundId,
          groupId: nextGroupId,
        };
      });
    } catch (error) {
      console.error('Error loading tournament structure:', error);
      setTournamentPhases([]);
      setTournamentRounds([]);
      setTournamentGroups([]);
    }
  };

  const loadSquadsForClub = async (clubId: string, type: 'home' | 'away') => {
    try {
      const response = await fetch(`/api/admin/clubs/${clubId}/squads`);
      if (response.ok) {
        const data = await response.json();
        const squadsArray = Array.isArray(data) ? data : (data.data || []);
        if (type === 'home') {
          setHomeSquads(squadsArray);
        } else {
          setAwaySquads(squadsArray);
        }
      }
    } catch (error) {
      console.error(`Error loading ${type} squads:`, error);
      if (type === 'home') {
        setHomeSquads([]);
      } else {
        setAwaySquads([]);
      }
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value;
    value = value.replace(/\D/g, '');
    if (value.length > 2 && value.length <= 4) {
      value = `${value.slice(0, 2)}/${value.slice(2)}`;
    } else if (value.length > 4) {
      value = `${value.slice(0, 2)}/${value.slice(2, 4)}/${value.slice(4, 8)}`;
    }
    setDisplayDate(value);
    if (value.length === 10) {
      const iso = fromDisplayDate(value);
      setFormData(prev => ({ ...prev, date: iso || '' }));
    } else {
      setFormData(prev => ({ ...prev, date: '' }));
    }
  };

  // 4. Effects

  useEffect(() => {
    if (formData.date) {
      const formatted = toDisplayDate(formData.date);
      if (formatted !== displayDate) {
        setDisplayDate(formatted);
      }
    }
  }, [formData.date, displayDate]);

  useEffect(() => {
    loadTournaments();
    loadClubs();
  }, []);

  useEffect(() => {
    if (formData.tournamentId && !isFriendly) {
      setTournamentParticipants([]);
      loadTournamentParticipants(formData.tournamentId);
    } else {
      setTournamentParticipants([]);
    }
  }, [formData.tournamentId, isFriendly]);

  useEffect(() => {
    if (formData.tournamentId && !isFriendly) {
      void loadTournamentStructure(formData.tournamentId);
    } else {
      setTournamentPhases([]);
      setTournamentRounds([]);
      setTournamentGroups([]);
      setFormData((prev) => {
        if (!prev.phase && !prev.roundId && !prev.groupId) {
          return prev;
        }

        return {
          ...prev,
          phase: '',
          roundId: '',
          groupId: '',
        };
      });
    }
  }, [formData.tournamentId, isFriendly]);

  useEffect(() => {
    if (tournamentIdParam && tournaments.length > 0) {
      const tournament = tournaments.find(t => t.id === tournamentIdParam);
      if (tournament) {
        setFormData(prev => ({ ...prev, tournamentId: tournament.id }));
      }
    }
  }, [tournamentIdParam, tournaments]);

  useEffect(() => {
    if (formData.homeClubId) {
      loadSquadsForClub(formData.homeClubId, 'home');
    }
  }, [formData.homeClubId]);

  useEffect(() => {
    if (formData.awayClubId) {
      loadSquadsForClub(formData.awayClubId, 'away');
    }
  }, [formData.awayClubId]);

  useEffect(() => {
    if (!isFriendly || formData.sportId) return;
    const tournamentSportId = tournaments.find((t) => t.id === formData.tournamentId)?.sportId || '';
    if (!tournamentSportId) return;

    setFormData((prev) => {
      if (prev.sportId) return prev;
      return { ...prev, sportId: tournamentSportId };
    });
  }, [formData.sportId, formData.tournamentId, isFriendly, tournaments]);

  useEffect(() => {
    if (!isFriendly || !formData.sportId) return;

    const clubsWithSport = clubs.filter((club) => normalizeSportValue(club.sport));
    if (clubsWithSport.length === 0) return;

    setFormData((prev) => {
      const nextHomeClubId = prev.homeClubId && sportMatchesSelection(clubs.find((club) => club.id === prev.homeClubId)?.sport, prev.sportId)
        ? prev.homeClubId
        : '';
      const nextAwayClubId = prev.awayClubId && sportMatchesSelection(clubs.find((club) => club.id === prev.awayClubId)?.sport, prev.sportId)
        ? prev.awayClubId
        : '';

      if (nextHomeClubId === prev.homeClubId && nextAwayClubId === prev.awayClubId) {
        return prev;
      }

      return {
        ...prev,
        homeClubId: nextHomeClubId,
        awayClubId: nextAwayClubId,
        homeSquadId: nextHomeClubId ? prev.homeSquadId : '',
        awaySquadId: nextAwayClubId ? prev.awaySquadId : '',
      };
    });
  }, [clubs, formData.sportId, isFriendly]);

  useEffect(() => {
    setFormData((prev) => {
      const nextRoundId = tournamentRounds.some((round) => round.phaseId === prev.phase && round.id === prev.roundId)
        ? prev.roundId
        : '';
      const nextGroupId = tournamentGroups.some((group) => group.phaseId === prev.phase && group.id === prev.groupId)
        ? prev.groupId
        : '';

      if (nextRoundId === prev.roundId && nextGroupId === prev.groupId) {
        return prev;
      }

      return {
        ...prev,
        roundId: nextRoundId,
        groupId: nextGroupId,
      };
    });
  }, [formData.phase, tournamentGroups, tournamentRounds]);

  const availableRounds = tournamentRounds.filter((round) => round.phaseId === formData.phase);
  const availableGroups = tournamentGroups.filter((group) => group.phaseId === formData.phase);
  const selectedTournament = tournaments.find((t) => t.id === formData.tournamentId) || null;
  const selectedFriendlySport = ACTIVE_SPORTS.find((sport) => sport.id === formData.sportId) || null;
  const availableFriendlyClubs = (() => {
    if (!formData.sportId) return [];
    const clubsWithSport = clubs.filter((club) => normalizeSportValue(club.sport));
    if (clubsWithSport.length === 0) return clubs;
    return clubsWithSport.filter((club) => sportMatchesSelection(club.sport, formData.sportId));
  })();

  const handleSubmit = async () => {
    if (loading) return;
    setLoading(true);

    try {
      if (isFriendly && !formData.sportId) {
        alert('Selecciona el deporte del amistoso');
        setLoading(false);
        return;
      }

      if (!formData.homeClubId || !formData.awayClubId) {
        alert('Por favor selecciona ambos equipos');
        setLoading(false);
        return;
      }

      if (formData.homeClubId === formData.awayClubId) {
        alert('Los equipos deben ser diferentes');
        setLoading(false);
        return;
      }

      if (!formData.date || !formData.time) {
        alert('Por favor ingresa fecha y hora');
        setLoading(false);
        return;
      }

      if (!formData.venue) {
        alert('Por favor ingresa el estadio/sede');
        setLoading(false);
        return;
      }

      if (!isFriendly && formData.tournamentId && !formData.phase) {
        alert('Selecciona la fase destino del partido.');
        setLoading(false);
        return;
      }

      const isoDate = formData.date;
      const dateTime = combineLocalDateTimeToUtcIso(isoDate, formData.time, APP_TIMEZONE);
      if (!dateTime) {
        throw new Error('La fecha u hora del partido no son validas.');
      }

      const useTournamentFixtureRoute = !isFriendly && Boolean(formData.tournamentId && formData.phase);
      const matchData = {
        tournamentId: isFriendly ? null : formData.tournamentId,
        sportId: isFriendly ? formData.sportId : null,
        phaseId: isFriendly ? null : (formData.phase || null),
        roundId: isFriendly ? null : (formData.roundId || null),
        roundLabel: isFriendly ? null : (formData.round.trim() || null),
        groupId: isFriendly ? null : (formData.groupId || null),
        homeClubId: formData.homeClubId,
        awayClubId: formData.awayClubId,
        homeSquadId: formData.homeSquadId || null,
        awaySquadId: formData.awaySquadId || null,
        dateTime,
        venue: formData.venue,
        city: formData.city || null,
        isNeutralVenue: formData.isNeutralVenue,
        address: formData.address || null,
        referee: formData.referee || null,
        watchUrl: formData.watchUrl.trim() || null,
        status: formData.status,
        isPublic: formData.isPublic,
        isFeatured: formData.isFeatured,
      };

      const endpoint = useTournamentFixtureRoute
        ? `/api/tournaments/${formData.tournamentId}/matches`
        : '/api/matches';

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matchData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || errorData.message || 'Error creating match';
        const errorDetails = errorData.details ? `\nDetalles: ${errorData.details}` : '';
        throw new Error(`${errorMessage}${errorDetails}`);
      }

      await response.json();
      invalidateCache('matches_list');
      router.push('/admin/super/partidos');
    } catch (error) {
      console.error('Error creating match:', error);
      alert(error instanceof Error ? error.message : 'Error al crear el partido');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    router.back();
  };

  const availableClubs = isFriendly
    ? availableFriendlyClubs
    : (!formData.tournamentId || tournamentParticipants.length === 0)
    ? clubs
    : tournamentParticipants;

  useEffect(() => {
    const cells = document.querySelectorAll('.cell');
    const handleMouseMove = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      const cell = mouseEvent.currentTarget as HTMLElement;
      const rect = cell.getBoundingClientRect();
      const x = mouseEvent.clientX - rect.left;
      const y = mouseEvent.clientY - rect.top;
      cell.style.background = `radial-gradient(circle at ${x}px ${y}px, rgba(255,255,255,0.05) 0%, transparent 80%)`;
    };
    const handleMouseLeave = (e: Event) => {
      const cell = e.currentTarget as HTMLElement;
      cell.style.background = 'transparent';
    };

    cells.forEach(cell => {
      cell.addEventListener('mousemove', handleMouseMove);
      cell.addEventListener('mouseleave', handleMouseLeave);
    });

    return () => {
      cells.forEach(cell => {
        cell.removeEventListener('mousemove', handleMouseMove);
        cell.removeEventListener('mouseleave', handleMouseLeave);
      });
    };
  }, []);

  return (
    <div className="monolith-wrapper">
      <div className="monolith">
        <div className="m-corner-tag">NUEVO-PARTIDO</div>

        {/* Header */}
        <header className="m-header">
          <button onClick={handleCancel} className="back-btn" style={{ background: 'transparent', border: 'none' }}>
            <ArrowLeft size={20} strokeWidth={3} />
            Volver
          </button>
          <div className="title-group">
            <div className="m-subtitle">Gestión de Competiciones</div>
            <h1 className="m-title">Nuevo Partido</h1>
          </div>
          <div style={{ width: '80px' }}></div>
        </header>

        {/* Contexto Section */}
        <div className="m-section-label">
          <span>01. CONTEXTO DE COMPETENCIA</span>
        </div>
        <div className="m-section">
          <div className="cell col-3">
            <label>Temporada</label>
            <CustomSelect
              value={formData.season}
              onChange={(val) => setFormData({ ...formData, season: val })}
              disabled={isFriendly}
              options={[
                { value: String(new Date().getFullYear()), label: String(new Date().getFullYear()) },
                { value: String(new Date().getFullYear() - 1), label: String(new Date().getFullYear() - 1) },
                { value: String(new Date().getFullYear() + 1), label: String(new Date().getFullYear() + 1) },
              ]}
            />
          </div>
          <div className="cell col-6">
            <label>Torneo / Liga</label>
            <CustomSelect
              value={formData.tournamentId}
              onChange={(val) => setFormData({ ...formData, tournamentId: val, phase: '', roundId: '', groupId: '' })}
              disabled={isFriendly}
              placeholder="Seleccionar torneo..."
              options={tournaments.map(t => ({
                value: t.id,
                label: `${t.name} ${t.season ? `(${t.season})` : ''}`.trim()
              }))}
            />
          </div>
          <div className="cell col-3">
            <label>¿Es Amistoso?</label>
            <div className="switch-container">
              <label className="switch-wrapper">
                <input
                  type="checkbox"
                  checked={isFriendly}
                  onChange={(e) => {
                    const nextFriendly = e.target.checked;
                    setIsFriendly(nextFriendly);
                    if (nextFriendly) {
                      setFormData((prev) => ({
                        ...prev,
                        sportId: prev.sportId || selectedTournament?.sportId || '',
                        phase: '',
                        roundId: '',
                        groupId: '',
                      }));
                    }
                  }}
                />
                <div className="switch-box"></div>
              </label>
              <span style={{ fontFamily: 'Space Mono', fontSize: '10px' }}>OFF / ON</span>
            </div>
          </div>
          <div className="cell col-6">
            <label>Deporte del amistoso</label>
            <CustomSelect
              value={formData.sportId}
              onChange={(val) => setFormData({
                ...formData,
                sportId: val,
                homeClubId: '',
                awayClubId: '',
                homeSquadId: '',
                awaySquadId: '',
              })}
              disabled={!isFriendly}
              placeholder={isFriendly ? 'Seleccionar deporte...' : 'Se hereda del torneo'}
              options={[
                { value: '', label: isFriendly ? 'Seleccionar deporte...' : 'Se hereda del torneo' },
                ...ACTIVE_SPORTS.map((sport) => ({
                  value: sport.id,
                  label: sport.nameEs,
                })),
              ]}
            />
          </div>
          <div className="cell col-4">
            <label>Fase</label>
            <CustomSelect
              value={formData.phase}
              onChange={(val) => setFormData({ ...formData, phase: val, roundId: '', groupId: '' })}
              disabled={isFriendly || !formData.tournamentId}
              placeholder={formData.tournamentId ? 'Seleccionar fase...' : 'Selecciona un torneo'}
              options={[
                { value: '', label: tournamentPhases.length > 0 ? 'Seleccionar fase...' : 'Sin fases disponibles' },
                ...tournamentPhases.map((phase) => ({
                  value: phase.id,
                  label: `${phase.name} (${phase.phase_type})`,
                })),
              ]}
            />
          </div>
          <div className="cell col-4">
            <label>Jornada existente</label>
            <CustomSelect
              value={formData.roundId}
              onChange={(val) => setFormData({ ...formData, roundId: val })}
              disabled={isFriendly || !formData.phase}
              placeholder={!formData.phase ? 'Selecciona una fase' : 'Crear o usar etiqueta libre'}
              options={[
                { value: '', label: availableRounds.length > 0 ? 'Crear o usar etiqueta libre' : 'Sin jornadas cargadas' },
                ...availableRounds.map((round) => ({
                  value: round.id,
                  label: round.name,
                })),
              ]}
            />
          </div>
          <div className="cell col-4">
            <label>Jornada / Etiqueta</label>
            <input
              type="text"
              placeholder="Ej: Fecha 14"
              value={formData.round}
              onChange={(e) => setFormData({ ...formData, round: e.target.value })}
              disabled={isFriendly || !formData.phase}
            />
          </div>
          <div className="cell col-6">
            <label>Grupo / Zona</label>
            <CustomSelect
              value={formData.groupId}
              onChange={(val) => setFormData({ ...formData, groupId: val })}
              disabled={isFriendly || !formData.phase}
              placeholder={!formData.phase ? 'Selecciona una fase' : 'Sin grupo'}
              options={[
                { value: '', label: 'Sin grupo' },
                ...availableGroups.map((group) => ({
                  value: group.id,
                  label: group.name,
                })),
              ]}
            />
          </div>
          <div className="cell col-6">
            <label>Categoría</label>
            <CustomSelect
              value={formData.category}
              onChange={(val) => setFormData({ ...formData, category: val })}
              placeholder="Cualquiera"
              options={[
                { value: '', label: 'Cualquiera' },
                { value: 'Primera División', label: 'Primera División' },
                { value: 'Intermedia', label: 'Intermedia' },
                { value: 'Pre-Intermedia', label: 'Pre-Intermedia' },
                { value: 'M19', label: 'M19' },
                { value: 'Femenino', label: 'Femenino' },
              ]}
            />
          </div>
        </div>

        {/* Teams Section */}
        <div className="m-section-label">
          <span>02. EQUIPOS Y PLANTELES</span>
        </div>
        {isFriendly && !formData.sportId && (
          <div className="m-section" style={{ marginBottom: 16 }}>
            <div className="cell col-12">
              <label>Deporte requerido</label>
              <div style={{ color: 'var(--text-secondary, #9ca3af)', fontSize: 12 }}>
                Define primero el deporte del amistoso para mostrar solo clubes de esa disciplina.
              </div>
            </div>
          </div>
        )}
        {isFriendly && formData.sportId && (
          <div className="m-section" style={{ marginBottom: 16 }}>
            <div className="cell col-12">
              <label>Disciplina seleccionada</label>
              <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                {selectedFriendlySport?.nameEs || formData.sportId}
              </div>
            </div>
          </div>
        )}
        <div className="m-section">
          <div className="cell col-6">
            <label>Equipo Local</label>
            <CustomSelect
              style={{ fontWeight: 700, fontSize: '18px' }}
              value={formData.homeClubId}
              onChange={(val) => setFormData({ ...formData, homeClubId: val, homeSquadId: '' })}
              placeholder="-- Local --"
              searchable
              searchPlaceholder="Buscar equipo local..."
              options={[{ value: '', label: '-- Local --' }, ...availableClubs.map(club => ({ value: club.id, label: club.name }))]}
            />
            <div style={{ marginTop: '15px' }}>
              <label>Plantel (Opcional)</label>
              <CustomSelect
                style={{ color: 'var(--accent)' }}
                value={formData.homeSquadId}
                onChange={(val) => setFormData({ ...formData, homeSquadId: val })}
                disabled={!formData.homeClubId}
                placeholder="Selección automática"
                options={[{ value: '', label: 'Selección automática' }, ...homeSquads.map(squad => ({ value: squad.id, label: squad.name }))]}
              />
            </div>
          </div>
          <div className="cell col-6">
            <label>Equipo Visitante</label>
            <CustomSelect
              style={{ fontWeight: 700, fontSize: '18px' }}
              value={formData.awayClubId}
              onChange={(val) => setFormData({ ...formData, awayClubId: val, awaySquadId: '' })}
              placeholder="-- Visitante --"
              searchable
              searchPlaceholder="Buscar equipo visitante..."
              options={[{ value: '', label: '-- Visitante --' }, ...availableClubs.map(club => ({ value: club.id, label: club.name }))]}
            />
            <div style={{ marginTop: '15px' }}>
              <label>Plantel (Opcional)</label>
              <CustomSelect
                style={{ color: 'var(--accent)' }}
                value={formData.awaySquadId}
                onChange={(val) => setFormData({ ...formData, awaySquadId: val })}
                disabled={!formData.awayClubId}
                placeholder="Selección automática"
                options={[{ value: '', label: 'Selección automática' }, ...awaySquads.map(squad => ({ value: squad.id, label: squad.name }))]}
              />
            </div>
          </div>
          <div className="vs-divider">VERSUS</div>
        </div>

        {/* Schedule Section */}
        <div className="m-section-label">
          <span>03. PROGRAMACIÓN Y SEDE</span>
        </div>
        <div className="m-section">
          <div className="cell col-3" style={{ position: 'relative' }}>
            <label>Fecha (DD/MM/YYYY)</label>
            <input
              type="text"
              value={displayDate}
              onChange={handleDateChange}
              maxLength={10}
              placeholder="12/05/2026"
            />
            <button
              type="button"
              onClick={() => dateInputRef.current?.showPicker()}
              style={{ position: 'absolute', right: '24px', top: '45px', background: 'transparent', border: 'none', color: 'var(--accent)', cursor: 'pointer' }}
            >
              <Calendar size={16} />
            </button>
            <input
              ref={dateInputRef}
              type="date"
              style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
              value={formData.date}
              onChange={(e) => setFormData(prev => ({ ...prev, date: e.target.value }))}
            />
          </div>
          <div className="cell col-3">
            <label>Hora de Inicio</label>
            <input
              type="time"
              value={formData.time}
              onChange={(e) => setFormData({ ...formData, time: e.target.value })}
            />
          </div>
          <div className="cell col-6">
            <label>Estadio / Sede</label>
            <input
              type="text"
              placeholder="Nombre de la cancha o club"
              value={formData.venue}
              onChange={(e) => setFormData({ ...formData, venue: e.target.value })}
            />
          </div>
          <div className="cell col-4">
            <label>Ciudad</label>
            <input
              type="text"
              placeholder="Ciudad o Localidad"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
          </div>
          <div className="cell col-8">
            <label>Campo Neutral</label>
            <div className="switch-container">
              <label className="switch-wrapper">
                <input
                  type="checkbox"
                  checked={formData.isNeutralVenue}
                  onChange={(e) => setFormData({ ...formData, isNeutralVenue: e.target.checked })}
                />
                <div className="switch-box"></div>
              </label>
              <span style={{ fontFamily: 'Space Mono', fontSize: '10px' }}>ACTIVAR SI EL ESTADIO NO PERTENECE AL LOCAL</span>
            </div>
          </div>
          <div className="cell col-12">
            <label>Link para verlo (Opcional)</label>
            <input
              type="url"
              placeholder="https://youtube.com/... o https://twitch.tv/..."
              value={formData.watchUrl}
              onChange={(e) => setFormData({ ...formData, watchUrl: e.target.value })}
            />
          </div>
        </div>

        {/* Authorities Section */}
        <div className="m-section-label">
          <span>04. AUTORIDADES Y ESTADO</span>
        </div>
        <div className="m-section">
          <div className="cell col-6">
            <label>Árbitro Central</label>
            <input
              type="text"
              placeholder="Ej: Federico Anselmi"
              value={formData.referee}
              onChange={(e) => setFormData({ ...formData, referee: e.target.value })}
            />
          </div>
          <div className="cell col-6">
            <label>Estado del Partido</label>
            <div className="status-group">
              <div
                className={`status-chip ${formData.status === 'scheduled' ? 'active' : ''}`}
                onClick={() => setFormData({ ...formData, status: 'scheduled' })}
              >
                PROGRAMADO
              </div>
              <div
                className={`status-chip ${formData.status === 'postponed' ? 'active postpone' : ''}`}
                onClick={() => setFormData({ ...formData, status: 'postponed' })}
              >
                POSTERGADO
              </div>
              <div
                className={`status-chip ${formData.status === 'suspended' ? 'active suspend' : ''}`}
                onClick={() => setFormData({ ...formData, status: 'suspended' })}
              >
                SUSPENDIDO
              </div>
            </div>
          </div>
        </div>

        {/* Final Config */}
        <div className="m-section-label">
          <span>05. CONFIGURACIÓN DE PUBLICACIÓN</span>
        </div>
        <div className="m-section">
          <div className="cell col-6">
            <label>Público</label>
            <div className="switch-container">
              <label className="switch-wrapper">
                <input
                  type="checkbox"
                  checked={formData.isPublic}
                  onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
                />
                <div className="switch-box"></div>
              </label>
              <span style={{ fontFamily: 'Space Mono', fontSize: '10px' }}>VISIBLE EN WEB Y APP</span>
            </div>
          </div>
          <div className="cell col-6">
            <label>Destacado</label>
            <div className="switch-container">
              <label className="switch-wrapper">
                <input
                  type="checkbox"
                  checked={formData.isFeatured}
                  onChange={(e) => setFormData({ ...formData, isFeatured: e.target.checked })}
                />
                <div className="switch-box"></div>
              </label>
              <span style={{ fontFamily: 'Space Mono', fontSize: '10px' }}>APARECE EN EL BANNER PRINCIPAL</span>
            </div>
          </div>
        </div>

        <footer className="m-footer">
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '16px 30px', fontFamily: 'Space Mono', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase' }}
          >
            Descartar
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleSubmit}
            disabled={loading}
            style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', marginLeft: 'auto' }}
          >
            {loading ? 'CREANDO...' : 'Crear Partido'}
          </button>
        </footer>
      </div>
    </div>
  );
}
