'use client';

import { useState, useEffect } from 'react';
import './fixture-kinetic.css';

interface Phase {
  id: string;
  tournament_id: string;
  name: string;
  phase_type: string;
  order_index: number;
  is_active: boolean;
  created_at: string;
}

interface Participant {
  id: string;
  club_id: string;
  status: string;
  clubs: {
    id: string;
    name: string;
    short_name: string | null;
    logo: string | null;
  };
}

interface FixtureSetupProps {
  tournamentId: string;
  tournamentName: string;
  onSetupComplete: () => void;
}

export function FixtureSetup({ tournamentId, tournamentName, onSetupComplete }: FixtureSetupProps) {
  const [phases, setPhases] = useState<Phase[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state for creating phase
  const [showPhaseForm, setShowPhaseForm] = useState(false);
  const [phaseName, setPhaseName] = useState('');
  const [phaseType, setPhaseType] = useState<'league' | 'knockout' | 'group_stage' | 'playoff'>('league');
  const [creating, setCreating] = useState(false);

  // Rounds generation state
  const [generatingRounds, setGeneratingRounds] = useState<string | null>(null);
  const [numRounds, setNumRounds] = useState(7);
  const [roundPattern, setRoundPattern] = useState('Fecha {n}');

  useEffect(() => {
    loadData();
  }, [tournamentId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [phasesRes, participantsRes] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}/phases`),
        fetch(`/api/tournaments/${tournamentId}/participants?full=true`),
      ]);

      if (phasesRes.ok) {
        const phasesData = await phasesRes.json();
        setPhases(phasesData.data || []);
      }

      if (participantsRes.ok) {
        const partsData = await participantsRes.json();
        setParticipants(Array.isArray(partsData) ? partsData : []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePhase = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: phaseName,
          phase_type: phaseType,
          order_index: phases.length,
          is_active: true,
        }),
      });

      if (response.ok) {
        setPhaseName('');
        setPhaseType('league');
        setShowPhaseForm(false);
        await loadData();
      } else {
        alert('Error al crear fase');
      }
    } catch (error) {
      console.error('Error creating phase:', error);
      alert('Error al crear fase');
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePhase = async (phaseId: string) => {
    if (!confirm('¿Eliminar esta fase? Se eliminarán todas sus jornadas y partidos.')) return;

    try {
      const response = await fetch(`/api/tournaments/${tournamentId}/phases/${phaseId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        await loadData();
      } else {
        alert('Error al eliminar fase');
      }
    } catch (error) {
      console.error('Error deleting phase:', error);
      alert('Error al eliminar fase');
    }
  };

  const handleGenerateRounds = async (phaseId: string) => {
    setGeneratingRounds(phaseId);

    try {
      const response = await fetch(
        `/api/tournaments/${tournamentId}/phases/${phaseId}/generate-rounds`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            num_rounds: numRounds,
            name_pattern: roundPattern,
          }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        alert(`✅ Se crearon ${data.count} jornadas exitosamente`);
        // Reload to check if we now have a complete fixture
        onSetupComplete();
      } else {
        const error = await response.json();
        alert('Error al generar jornadas: ' + error.error);
      }
    } catch (error) {
      console.error('Error generating rounds:', error);
      alert('Error al generar jornadas');
    } finally {
      setGeneratingRounds(null);
    }
  };

  if (loading) {
    return (
      <div className="fixture-poly-panel" style={{ padding: '60px', textAlign: 'center' }}>
        <div className="fixture-empty-state">
          <div className="fixture-empty-state-icon">⚙️</div>
          <div className="fixture-empty-state-title">Cargando...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixture-app-shell" style={{ gridTemplateColumns: '1fr', gap: '20px' }}>
      {/* Header */}
      <header className="fixture-poly-panel fixture-top-bar">
        <div className="fixture-tournament-info">
          <h1>
            {tournamentName}
            <span className="fixture-badge-status" style={{ background: 'rgba(255, 193, 7, 0.1)', borderColor: '#ffc107', color: '#ffc107' }}>
              Configuración
            </span>
          </h1>
          <p>Configura las fases y jornadas del torneo antes de usar el fixture profesional</p>
        </div>
      </header>

      {/* Main Content */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '40px' }} className="setup-grid-animate setup-responsive-grid">
        {/* Left Column: Phases */}
        <div className="fixture-poly-panel setup-card-fade" style={{ padding: '48px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', marginBottom: '40px' }} className="setup-header-responsive">
            <h3 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0, color: 'var(--fixture-text-main)' }}>
              Fases del Torneo
            </h3>
            <button
              className="fixture-btn fixture-btn-primary setup-btn-responsive"
              onClick={() => setShowPhaseForm(!showPhaseForm)}
              style={{ padding: '16px 28px', fontSize: '1rem', fontWeight: 700, borderRadius: '14px', width: '100%' }}
            >
              {showPhaseForm ? '✕ Cancelar' : '+ Nueva Fase'}
            </button>
          </div>

          {/* Create Phase Form */}
          {showPhaseForm && (
            <form onSubmit={handleCreatePhase} style={{ marginBottom: '32px', padding: '28px', background: 'rgba(0, 0, 0, 0.3)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.08)' }} className="form-slide-in">
              <div className="fixture-form-group" style={{ marginBottom: '28px' }}>
                <label className="fixture-form-label" style={{ marginBottom: '12px', fontSize: '0.9rem', fontWeight: 700 }}>Nombre de la Fase</label>
                <input
                  type="text"
                  className="fixture-form-input"
                  value={phaseName}
                  onChange={(e) => setPhaseName(e.target.value)}
                  placeholder="Ej: Fase de Grupos"
                  required
                  style={{ padding: '16px', fontSize: '1rem' }}
                />
              </div>

              <div className="fixture-form-group" style={{ marginBottom: '32px' }}>
                <label className="fixture-form-label" style={{ marginBottom: '12px', fontSize: '0.9rem', fontWeight: 700 }}>Tipo de Fase</label>
                <select
                  className="fixture-form-select"
                  value={phaseType}
                  onChange={(e) => setPhaseType(e.target.value as any)}
                  style={{ padding: '16px', fontSize: '1rem' }}
                >
                  <option value="league">Liga (Round-robin)</option>
                  <option value="group_stage">Fase de Grupos</option>
                  <option value="knockout">Eliminación Directa</option>
                  <option value="playoff">Playoffs</option>
                </select>
              </div>

              <button
                type="submit"
                className="fixture-btn fixture-btn-primary"
                disabled={creating}
                style={{ width: '100%', padding: '18px 28px', fontSize: '1rem', fontWeight: 700, borderRadius: '14px', opacity: creating ? 0.6 : 1, cursor: creating ? 'not-allowed' : 'pointer' }}
              >
                {creating ? (
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                    <svg style={{ animation: 'spin 1s linear infinite', width: '20px', height: '20px' }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creando...
                  </span>
                ) : '✓ Crear Fase'}
              </button>
            </form>
          )}

          {/* Phases List */}
          {phases.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--fixture-text-dim)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '10px', opacity: 0.3 }}>📋</div>
              <p>No hay fases creadas aún</p>
              <p style={{ fontSize: '0.85rem', marginTop: '8px' }}>
                Crea la primera fase para comenzar a configurar el fixture
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {phases.map((phase, index) => (
                <div
                  key={phase.id}
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '16px',
                    padding: '28px',
                    transition: 'all 0.3s ease',
                  }}
                  className="phase-item-stagger"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--fixture-text-dim)', fontWeight: 600 }}>
                          #{index + 1}
                        </span>
                        <h4 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0, color: 'var(--fixture-text-main)' }}>
                          {phase.name}
                        </h4>
                      </div>
                      <div style={{ fontSize: '0.9rem', color: 'var(--fixture-text-dim)', paddingLeft: '32px' }}>
                        Tipo: {phase.phase_type} • {phase.is_active ? 'Activa' : 'Inactiva'}
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeletePhase(phase.id)}
                      style={{
                        background: 'rgba(255, 49, 49, 0.1)',
                        border: '1px solid rgba(255, 49, 49, 0.3)',
                        borderRadius: '10px',
                        padding: '8px 14px',
                        color: 'var(--fixture-accent-red)',
                        cursor: 'pointer',
                        fontSize: '1.2rem',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 49, 49, 0.2)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 49, 49, 0.1)';
                        e.currentTarget.style.transform = 'scale(1)';
                      }}
                      title="Eliminar fase"
                    >
                      🗑️
                    </button>
                  </div>

                  {/* Generate Rounds Section */}
                  <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                    <div style={{ fontSize: '0.85rem', color: 'var(--fixture-text-dim)', marginBottom: '16px', fontWeight: 600 }}>
                      {phase.phase_type === 'league' ? 'Generar Jornadas (Cálculo Automático Ronda de Campeones)' : 'Generar Jornadas'}
                    </div>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                      {phase.phase_type !== 'league' && (
                        <input
                          type="number"
                          min="1"
                          max="50"
                          value={numRounds}
                          onChange={(e) => setNumRounds(parseInt(e.target.value) || 7)}
                          style={{
                            width: '70px',
                            padding: '10px',
                            background: 'rgba(0, 0, 0, 0.3)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            borderRadius: '8px',
                            color: 'var(--fixture-text-main)',
                            fontSize: '0.95rem',
                          }}
                        />
                      )}
                      {phase.phase_type === 'league' && (
                        <div style={{
                          padding: '10px 14px',
                          background: 'rgba(0,0,0,0.5)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          borderRadius: '8px',
                          color: 'var(--fixture-text-dim)',
                          fontSize: '0.9rem',
                          fontFamily: 'monospace'
                        }}>
                          Automático
                        </div>
                      )}
                      <input
                        type="text"
                        value={roundPattern}
                        onChange={(e) => setRoundPattern(e.target.value)}
                        placeholder="Fecha {n}"
                        style={{
                          flex: 1,
                          padding: '10px',
                          background: 'rgba(0, 0, 0, 0.3)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '8px',
                          color: 'var(--fixture-text-main)',
                          fontSize: '0.95rem',
                        }}
                      />
                      <button
                        onClick={() => handleGenerateRounds(phase.id)}
                        disabled={generatingRounds === phase.id}
                        className="fixture-btn fixture-btn-primary"
                        style={{ padding: '10px 18px', fontSize: '0.9rem', fontWeight: 700 }}
                      >
                        {generatingRounds === phase.id ? '⏳ Generando' : '✨ Generar'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Participants */}
        <div className="fixture-poly-panel setup-card-fade" style={{ padding: '48px', animationDelay: '0.1s' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '40px', color: 'var(--fixture-text-main)' }}>
            Equipos Participantes
            <span style={{ fontSize: '1.1rem', fontWeight: 400, color: 'var(--fixture-text-dim)', marginLeft: '14px' }}>
              ({participants.length})
            </span>
          </h3>

          {participants.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--fixture-text-dim)' }}>
              <div style={{ fontSize: '3rem', marginBottom: '16px', opacity: 0.3 }}>👥</div>
              <p style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--fixture-text-main)' }}>No hay equipos registrados</p>
              <p style={{ fontSize: '0.88rem', marginTop: '10px' }}>
                Agrega equipos en la sección de Participantes
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '550px', overflowY: 'auto', paddingRight: '10px' }}>
              {participants.map((participant, idx) => (
                <div
                  key={participant.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '18px',
                    padding: '20px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    transition: 'all 0.3s ease',
                    animationDelay: `${idx * 0.05}s`,
                  }}
                  className="participant-item-stagger"
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                    e.currentTarget.style.transform = 'translateX(4px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }}
                >
                  {participant.clubs.logo ? (
                    <img
                      src={participant.clubs.logo}
                      alt={participant.clubs.name}
                      style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                    />
                  ) : (
                    <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: 700, border: '1px solid rgba(255, 255, 255, 0.15)' }}>
                      {participant.clubs.short_name || participant.clubs.name.substring(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--fixture-text-main)', marginBottom: '4px' }}>
                      {participant.clubs.name}
                    </div>
                    {participant.clubs.short_name && (
                      <div style={{ fontSize: '0.85rem', color: 'var(--fixture-text-dim)' }}>
                        {participant.clubs.short_name}
                      </div>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.8rem',
                      padding: '7px 16px',
                      borderRadius: '100px',
                      background: participant.status === 'active' ? 'rgba(57, 255, 20, 0.15)' : 'rgba(255, 255, 255, 0.1)',
                      border: `1px solid ${participant.status === 'active' ? 'var(--fixture-accent-green)' : 'var(--fixture-poly-border)'}`,
                      color: participant.status === 'active' ? 'var(--fixture-accent-green)' : 'var(--fixture-text-dim)',
                      fontWeight: 600,
                      textTransform: 'uppercase',
                    }}
                  >
                    {participant.status}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="fixture-poly-panel" style={{ padding: '48px', textAlign: 'center' }}>
        <h4 style={{ fontSize: '1.35rem', fontWeight: 700, marginBottom: '20px', color: 'var(--fixture-text-main)' }}>
          ¿Listo para usar el Fixture Profesional?
        </h4>
        <p style={{ fontSize: '1.05rem', color: 'var(--fixture-text-dim)', marginBottom: '36px', maxWidth: '650px', margin: '0 auto 36px', lineHeight: '1.6' }}>
          Una vez que hayas creado al menos una fase con jornadas, podrás acceder al sistema completo de fixture
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', justifyContent: 'center', alignItems: 'stretch', maxWidth: '400px', margin: '0 auto' }} className="setup-footer-buttons">
          <button
            className="fixture-btn fixture-btn-ghost"
            onClick={loadData}
            style={{ padding: '16px 32px', fontSize: '1rem', fontWeight: 600, borderRadius: '14px' }}
          >
            <span style={{ marginRight: '10px' }}>🔄</span>
            Actualizar
          </button>
          <button
            className="fixture-btn fixture-btn-primary"
            onClick={onSetupComplete}
            disabled={phases.length === 0}
            style={{ padding: '16px 36px', fontSize: '1rem', fontWeight: 700, borderRadius: '14px', opacity: phases.length === 0 ? 0.5 : 1, cursor: phases.length === 0 ? 'not-allowed' : 'pointer' }}
          >
            <span style={{ marginRight: '10px' }}>✅</span>
            Ir al Fixture
          </button>
        </div>
      </div>
    </div>
  );
}
