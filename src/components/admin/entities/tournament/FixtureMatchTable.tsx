'use client';

import { useFixture } from './FixtureContext';
import type { MatchStatus } from '@/lib/types/fixture';

const STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: 'Programado',
  live: 'En Vivo',
  final: 'Finalizado',
  postponed: 'Reprogramado',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
};

const STATUS_CLASSES: Record<MatchStatus, string> = {
  scheduled: 'fixture-status-scheduled',
  live: 'fixture-status-live',
  final: 'fixture-status-final',
  postponed: 'fixture-status-postponed',
  suspended: 'fixture-status-suspended',
  cancelled: 'fixture-status-cancelled',
};

export function FixtureMatchTable() {
  const { fixture, selectedPhaseId, selectedRoundId, viewMode, setViewMode, openEditor } =
    useFixture();

  if (!fixture) return null;

  const selectedPhase = fixture.phases.find((p) => p.id === selectedPhaseId);
  const selectedRound = selectedPhase?.rounds.find((r) => r.id === selectedRoundId);

  if (!selectedRound) {
    return (
      <main className="fixture-main-content">
        <div className="fixture-empty-state">
          <div className="fixture-empty-state-icon">⚽</div>
          <div className="fixture-empty-state-title">Selecciona una jornada</div>
          <div className="fixture-empty-state-text">
            Elige una fecha del menú lateral para ver los partidos
          </div>
        </div>
      </main>
    );
  }

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return { date: `${day}/${month}`, time: `${hours}:${minutes}` };
  };

  return (
    <main className="fixture-main-content">
      <div className="fixture-content-header">
        <h2>{selectedRound.name}</h2>
        <div className="fixture-view-switch">
          <button
            className={`fixture-view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => setViewMode('list')}
          >
            Lista
          </button>
          <button
            className={`fixture-view-btn ${viewMode === 'calendar' ? 'active' : ''}`}
            onClick={() => setViewMode('calendar')}
          >
            Calendario
          </button>
        </div>
      </div>

      {selectedRound.matches.length === 0 ? (
        <div className="fixture-poly-panel" style={{ padding: '40px', textAlign: 'center' }}>
          <div className="fixture-empty-state">
            <div className="fixture-empty-state-icon">📋</div>
            <div className="fixture-empty-state-title">No hay partidos en esta jornada</div>
            <div className="fixture-empty-state-text">
              Haz clic en &quot;Crear Partido&quot; para agregar el primer partido
            </div>
          </div>
        </div>
      ) : (
        <>
          <div style={{ overflowX: 'auto' }}>
            <table className="fixture-match-list">
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>Fecha/Hora</th>
                  <th>Local</th>
                  <th>Visitante</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {selectedRound.matches.map((match) => {
                  const { date, time } = formatDateTime(match.dateTime);
                  return (
                    <tr
                      key={match.id}
                      className="fixture-match-row"
                      onClick={() => openEditor(match)}
                    >
                      <td>
                        {date}
                        <span className="fixture-match-date-minor">{time}</span>
                      </td>
                      <td>
                        <div className="fixture-team-cell">
                          {match.homeClub?.logo ? (
                            <img
                              src={match.homeClub.logo}
                              alt={match.homeClub.name}
                              className="fixture-team-logo"
                            />
                          ) : (
                            <div className="fixture-team-logo" />
                          )}
                          {match.homeClub?.name || 'TBD'}
                        </div>
                      </td>
                      <td>
                        <div className="fixture-team-cell">
                          {match.awayClub?.logo ? (
                            <img
                              src={match.awayClub.logo}
                              alt={match.awayClub.name}
                              className="fixture-team-logo"
                            />
                          ) : (
                            <div className="fixture-team-logo" />
                          )}
                          {match.awayClub?.name || 'TBD'}
                        </div>
                      </td>
                      <td>{match.venue || '—'}</td>
                      <td>
                        <span className={`fixture-status-dot ${STATUS_CLASSES[match.status]}`} />
                        {STATUS_LABELS[match.status]}
                      </td>
                      <td style={{ textAlign: 'right' }}>✏️</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mass Actions Bar */}
          <div className="fixture-mass-actions-bar">
            <span>Acciones de Fecha:</span>
            <button className="fixture-btn fixture-btn-ghost">Reprogramar Todo</button>
            <button className="fixture-btn fixture-btn-ghost">Mover a Fecha...</button>
            <button className="fixture-btn fixture-btn-danger">Resetear Jornada</button>
          </div>
        </>
      )}
    </main>
  );
}
