'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar, ArrowLeft, Trophy, Users, MapPin, Shield, Clock, Info, CheckCircle, Star, Globe } from 'lucide-react';
import '../../creation-forms.css';
import './monolith.css';
import { CustomSelect } from './CustomSelect';

interface Tournament {
  id: string;
  name: string;
  season: string | null;
  division_id: string | null;
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
}

interface Squad {
  id: string;
  name: string;
}

type MatchStatus = 'scheduled' | 'postponed' | 'suspended';

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
    phase: '',
    round: '',
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
  const [loading, setLoading] = useState(false);
  const [contextTournament, setContextTournament] = useState<Tournament | null>(null);

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
          logo: c.logo || c.logo_url
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
    if (tournamentIdParam && tournaments.length > 0) {
      const tournament = tournaments.find(t => t.id === tournamentIdParam);
      if (tournament) {
        setContextTournament(tournament);
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

  const handleSubmit = async (redirectToMatchCenter: boolean = false) => {
    if (loading) return;
    setLoading(true);

    try {
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

      const isoDate = formData.date;
      const dateTime = new Date(`${isoDate}T${formData.time}`).toISOString();

      const matchData = {
        tournamentId: isFriendly ? null : formData.tournamentId,
        phaseId: isFriendly ? null : (formData.phase || null),
        roundId: isFriendly ? null : (formData.round || null),
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
        status: formData.status,
        isPublic: formData.isPublic,
        isFeatured: formData.isFeatured,
      };

      const response = await fetch('/api/matches', {
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

      const createdMatch = await response.json();

      if (redirectToMatchCenter) {
        router.push(`/admin/super/partidos/${createdMatch.id}`);
      } else {
        router.push('/admin/super/partidos');
      }
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

  const availableClubs = (isFriendly || !formData.tournamentId || tournamentParticipants.length === 0)
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
              onChange={(val) => setFormData({ ...formData, tournamentId: val })}
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
                  onChange={(e) => setIsFriendly(e.target.checked)}
                />
                <div className="switch-box"></div>
              </label>
              <span style={{ fontFamily: 'Space Mono', fontSize: '10px' }}>OFF / ON</span>
            </div>
          </div>
          <div className="cell col-6">
            <label>Fase / Fecha</label>
            <input
              type="text"
              placeholder="Ej: Fecha 14"
              value={formData.round}
              onChange={(e) => setFormData({ ...formData, round: e.target.value })}
              disabled={isFriendly}
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
        <div className="m-section">
          <div className="cell col-6">
            <label>Equipo Local</label>
            <CustomSelect
              style={{ fontWeight: 700, fontSize: '18px' }}
              value={formData.homeClubId}
              onChange={(val) => setFormData({ ...formData, homeClubId: val, homeSquadId: '' })}
              placeholder="-- Local --"
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
            onClick={() => handleSubmit(false)}
            disabled={loading}
            style={{ background: 'transparent', border: '1px solid var(--accent)', color: 'var(--accent)', marginRight: 'auto', marginLeft: '20px' }}
          >
            {loading ? '...' : 'Solo Crear'}
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => handleSubmit(true)}
            disabled={loading}
          >
            {loading ? 'CREANDO...' : 'Programar Partido'}
          </button>
        </footer>
      </div>
    </div>
  );
}
