'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  FileCheck,
  RefreshCw,
  Trophy,
  XCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { useFixture } from './FixtureContext';
import { DarkSelect, type DarkSelectOption } from './DarkSelect';
import type { MatchStatus } from '@/lib/types/fixture';

// ─── Local types for direct API loading ──────────────────────────────────────

interface PhaseOption {
  id: string;
  name: string;
  phase_type: string;
}

interface ParticipantOption {
  id: string;
  name: string;
  clubId: string;
}

const STATUS_OPTIONS: DarkSelectOption[] = [
  { value: 'scheduled', label: 'Programado' },
  { value: 'live', label: 'En vivo' },
  { value: 'final', label: 'Finalizado' },
  { value: 'postponed', label: 'Reprogramado' },
  { value: 'suspended', label: 'Suspendido' },
  { value: 'cancelled', label: 'Cancelado' },
];

// ─── Component ───────────────────────────────────────────────────────────────

export const FixtureMatchEditor = ({
  onClose,
  initialPhaseId,
  tournamentId,
}: {
  onClose: () => void;
  initialPhaseId?: string;
  tournamentId: string;
}) => {
  const { editingMatch, saveMatch, deleteMatch, selectedPhaseId, refreshFixture } = useFixture();

  // ─── Direct data loading (independent of fixture context) ──────────────────
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [participants, setParticipants] = useState<ParticipantOption[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  // Load phases and participants DIRECTLY from API
  const loadFormData = useCallback(async () => {
    if (!tournamentId) {
      setDataLoading(false);
      return;
    }
    setDataLoading(true);
    setDataError(null);

    try {
      const [phasesRes, participantsRes] = await Promise.all([
        fetch(`/api/tournaments/${tournamentId}/phases`, { cache: 'no-store' }),
        fetch(`/api/tournaments/${tournamentId}/participants?full=true`, { cache: 'no-store' }),
      ]);

      // Parse phases
      if (phasesRes.ok) {
        const phasesJson = await phasesRes.json();
        const phasesArray = Array.isArray(phasesJson) ? phasesJson : (phasesJson.data || []);
        setPhases(phasesArray.map((p: any) => ({
          id: p.id,
          name: p.name || 'Fase sin nombre',
          phase_type: p.phase_type || 'league',
        })));
      } else {
        console.error('[MatchEditor] Failed to load phases:', phasesRes.status);
      }

      // Parse participants
      if (participantsRes.ok) {
        const participantsJson = await participantsRes.json();
        const participantsArray = Array.isArray(participantsJson) ? participantsJson : [];
        setParticipants(participantsArray
          .filter((p: any) => p.club_id || p.clubs?.id)
          .map((p: any) => ({
            id: p.id,
            name: p.clubs?.name || p.name || 'Sin nombre',
            clubId: p.club_id || p.clubs?.id || '',
          }))
        );
      } else {
        console.error('[MatchEditor] Failed to load participants:', participantsRes.status);
      }
    } catch (err: any) {
      console.error('[MatchEditor] Error loading form data:', err);
      setDataError('Error al cargar datos del torneo');
    } finally {
      setDataLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => { loadFormData(); }, [loadFormData]);

  // ─── DarkSelect option lists ───────────────────────────────────────────────
  const phaseOptions: DarkSelectOption[] = useMemo(() =>
    phases.map((p) => ({
      value: p.id,
      label: p.name,
      sublabel: p.phase_type === 'league' ? 'Liga' : p.phase_type === 'knockout' ? 'Eliminación directa' : p.phase_type,
    })),
    [phases]
  );

  const participantOptions: DarkSelectOption[] = useMemo(() =>
    participants.map((p) => ({
      value: p.clubId,
      label: p.name,
    })),
    [participants]
  );

  // ─── Form state ────────────────────────────────────────────────────────────
  const [formData, setFormData] = useState({
    phaseId: '',
    roundLabel: '',
    homeClubId: '',
    awayClubId: '',
    dateTime: new Date().toISOString().slice(0, 16),
    venue: '',
    referee: '',
    pitch: '',
    notes: '',
    streamUrl: '',
    replayUrl: '',
    status: 'scheduled' as MatchStatus,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Initialize form data once phases are loaded
  useEffect(() => {
    if (editingMatch) {
      setFormData({
        phaseId: editingMatch.phaseId || '',
        roundLabel: '',
        homeClubId: editingMatch.homeClubId || '',
        awayClubId: editingMatch.awayClubId || '',
        dateTime: editingMatch.dateTime
          ? new Date(editingMatch.dateTime).toISOString().slice(0, 16)
          : new Date().toISOString().slice(0, 16),
        venue: editingMatch.venue || '',
        referee: editingMatch.referee || '',
        pitch: editingMatch.pitch || '',
        notes: editingMatch.notes || '',
        streamUrl: editingMatch.streamUrl || '',
        replayUrl: editingMatch.replayUrl || '',
        status: editingMatch.status || 'scheduled',
      });
      return;
    }

    // New match: auto-select phase from context
    const autoPhaseId = initialPhaseId || selectedPhaseId || (phases.length > 0 ? phases[0].id : '');
    setFormData(prev => ({
      ...prev,
      phaseId: autoPhaseId,
      roundLabel: '',
      homeClubId: '',
      awayClubId: '',
      dateTime: new Date().toISOString().slice(0, 16),
      venue: '',
      referee: '',
      pitch: '',
      notes: '',
      streamUrl: '',
      replayUrl: '',
      status: 'scheduled',
    }));
    setError(null);
    setSuccessMsg(null);
    setValidationErrors({});
  }, [editingMatch, phases, initialPhaseId, selectedPhaseId]);

  // ─── Validation ────────────────────────────────────────────────────────────
  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!formData.phaseId) errors.phaseId = 'La fase es obligatoria';
    if (!formData.homeClubId) errors.homeClubId = 'El equipo local es obligatorio';
    if (!formData.awayClubId) errors.awayClubId = 'El equipo visitante es obligatorio';
    if (formData.homeClubId && formData.awayClubId && formData.homeClubId === formData.awayClubId) {
      errors.awayClubId = 'El equipo local y visitante no pueden ser el mismo';
    }
    if (!formData.dateTime) errors.dateTime = 'La fecha y hora son obligatorias';

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await saveMatch({
        ...(editingMatch || {}),
        phaseId: formData.phaseId,
        groupId: (editingMatch as any)?.groupId || null, // Preserve if exists
        roundId: editingMatch?.roundId || null,
        roundLabel: formData.roundLabel || undefined,
        homeClubId: formData.homeClubId,
        awayClubId: formData.awayClubId,
        dateTime: formData.dateTime,
        venue: formData.venue,
        referee: formData.referee,
        pitch: formData.pitch,
        notes: formData.notes,
        streamUrl: formData.streamUrl,
        replayUrl: formData.replayUrl,
        status: formData.status,
      });
      await refreshFixture();
      setSuccessMsg('Partido guardado exitosamente');
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      console.error('Error saving match:', err);
      setError(err.message || 'Error al guardar el partido');
    } finally {
      setIsSaving(false);
    }
  };

  const update = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const next = { ...prev };
        delete (next as any)[field];
        return next;
      });
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  if (dataLoading) {
    return (
      <div className="match-editor-drawer fixture-glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <div style={{ textAlign: 'center', display: 'grid', gap: '12px', justifyItems: 'center' }}>
          <Loader2 className="spin" size={28} style={{ color: 'var(--fixture-accent-primary)' }} />
          <span style={{ fontSize: '0.85rem', color: 'var(--fixture-text-muted)' }}>Cargando datos del formulario...</span>
        </div>
      </div>
    );
  }

  if (dataError) {
    return (
      <div className="match-editor-drawer fixture-glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <div style={{ textAlign: 'center', display: 'grid', gap: '12px', justifyItems: 'center' }}>
          <AlertTriangle size={28} style={{ color: '#ff9ab0' }} />
          <span style={{ fontSize: '0.85rem', color: '#ff9ab0' }}>{dataError}</span>
          <button className="btn-secondary" onClick={loadFormData}>Reintentar</button>
        </div>
      </div>
    );
  }

  if (phases.length === 0) {
    return (
      <div className="match-editor-drawer fixture-glass" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <div style={{ textAlign: 'center', display: 'grid', gap: '12px', justifyItems: 'center', maxWidth: '360px' }}>
          <AlertTriangle size={28} style={{ color: '#ffcf70' }} />
          <strong style={{ fontSize: '1rem' }}>Sin fases configuradas</strong>
          <span style={{ fontSize: '0.85rem', color: 'var(--fixture-text-muted)' }}>
            Para crear partidos, primero configurá al menos una fase en la pestaña Estructura.
          </span>
          <button className="btn-secondary" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="match-editor-drawer fixture-glass">
      <div className="drawer-header">
        <div className="drawer-title">
          <div className="drawer-icon">
            <Trophy size={18} />
          </div>
          <div>
            <span className="fixture-kicker">Match editor</span>
            <h2>{editingMatch ? 'Editar partido' : 'Nuevo partido'}</h2>
          </div>
        </div>
        <button className="drawer-close" onClick={onClose} aria-label="Cerrar editor">
          <XCircle size={18} />
        </button>
      </div>

      <div className="drawer-content">
        {successMsg && (
          <div style={{ padding: '12px', borderRadius: '12px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', color: '#4ade80', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>{successMsg}</span>
          </div>
        )}
        <div className="editor-grid">
          {/* Phase selector — DarkSelect */}
          <div className="editor-field editor-field-full">
            <label>Fase del torneo</label>
            <DarkSelect
              value={formData.phaseId}
              onChange={(v) => update('phaseId', v)}
              options={phaseOptions}
              placeholder="Seleccionar fase..."
              error={!!validationErrors.phaseId}
            />
            {validationErrors.phaseId && (
              <span className="field-error"><AlertTriangle size={12} /> {validationErrors.phaseId}</span>
            )}
          </div>

          {/* Round — manual text field */}
          <div className="editor-field editor-field-full">
            <label>Jornada / Ronda</label>
            <input
              type="text"
              value={formData.roundLabel}
              onChange={(e) => update('roundLabel', e.target.value)}
              placeholder="Ej: Fecha 1, Semifinal, Final, Jornada 3..."
              className="glass-input"
            />
            <span className="field-hint">Campo libre. Escribí el nombre de la fecha o ronda.</span>
          </div>

          <div className="editor-separator">Participantes</div>

          {participants.length === 0 ? (
            <div className="editor-field editor-field-full">
              <div className="field-error" style={{ padding: '12px', borderRadius: '12px', background: 'rgba(255,191,0,0.08)', border: '1px solid rgba(255,191,0,0.18)', color: '#ffcf70' }}>
                <AlertTriangle size={14} />
                <span>No hay participantes cargados en este torneo. Agregá participantes en la pestaña Participantes.</span>
              </div>
            </div>
          ) : (
            <>
              <div className="editor-field">
                <label>Local</label>
                <DarkSelect
                  value={formData.homeClubId}
                  onChange={(v) => update('homeClubId', v)}
                  options={participantOptions}
                  placeholder="Seleccionar local..."
                  error={!!validationErrors.homeClubId}
                />
                {validationErrors.homeClubId && (
                  <span className="field-error"><AlertTriangle size={12} /> {validationErrors.homeClubId}</span>
                )}
              </div>

              <div className="editor-field">
                <label>Visitante</label>
                <DarkSelect
                  value={formData.awayClubId}
                  onChange={(v) => update('awayClubId', v)}
                  options={participantOptions}
                  placeholder="Seleccionar visitante..."
                  error={!!validationErrors.awayClubId}
                />
                {validationErrors.awayClubId && (
                  <span className="field-error"><AlertTriangle size={12} /> {validationErrors.awayClubId}</span>
                )}
              </div>
            </>
          )}

          <div className="editor-separator">Programación</div>

          <div className="editor-field">
            <label>Estado</label>
            <DarkSelect
              value={formData.status}
              onChange={(v) => update('status', v)}
              options={STATUS_OPTIONS}
              placeholder="Estado..."
            />
          </div>

          <div className="editor-field">
            <label>Fecha y hora</label>
            <input
              type="datetime-local"
              value={formData.dateTime}
              onChange={(e) => update('dateTime', e.target.value)}
              className={`glass-input ${validationErrors.dateTime ? 'input-error' : ''}`}
            />
          </div>

          <div className="editor-field">
            <label>Sede / Venue</label>
            <input
              type="text"
              value={formData.venue}
              onChange={(e) => update('venue', e.target.value)}
              placeholder="Ej: Estadio Nacional"
              className="glass-input"
            />
          </div>


          <div className="editor-field">
            <label>Árbitro / Referee</label>
            <input
              type="text"
              value={formData.referee}
              onChange={(e) => update('referee', e.target.value)}
              placeholder="Nombre del árbitro"
              className="glass-input"
            />
          </div>

          <div className="editor-field">
            <label>Cancha / Pitch</label>
            <input
              type="text"
              value={formData.pitch}
              onChange={(e) => update('pitch', e.target.value)}
              placeholder="Ej: Cancha 1"
              className="glass-input"
            />
          </div>

          <div className="editor-field editor-field-full">
            <label>URL de Transmisión (Broadcasting) <span style={{ opacity: 0.6, fontSize: '0.8em' }}>(Opcional)</span></label>
            <input
              type="url"
              value={formData.streamUrl}
              onChange={(e) => update('streamUrl', e.target.value)}
              placeholder="https://youtube.com/..."
              className="glass-input"
            />
          </div>

          <div className="editor-field editor-field-full">
            <label>URL de Repetición (Replay) <span style={{ opacity: 0.6, fontSize: '0.8em' }}>(Opcional)</span></label>
            <input
              type="url"
              value={formData.replayUrl}
              onChange={(e) => update('replayUrl', e.target.value)}
              placeholder="https://youtube.com/..."
              className="glass-input"
            />
          </div>

          <div className="editor-field editor-field-full">
            <label>Notas</label>
            <textarea
              value={formData.notes}
              onChange={(e) => update('notes', e.target.value)}
              placeholder="Observaciones operativas del partido"
              className="glass-input"
              rows={3}
            />
          </div>

          {error && (
            <div className="editor-error-message">
              <span>{error}</span>
            </div>
          )}

          {Object.keys(validationErrors).length > 0 && (
            <div className="editor-validation-summary">
              <AlertTriangle size={14} />
              Por favor completa todos los campos obligatorios.
            </div>
          )}
        </div>
      </div>

      <div className="drawer-footer">
        {editingMatch && (
          <button
            className="btn-danger-outline"
            onClick={() => {
              if (window.confirm('Eliminar este partido?')) {
                deleteMatch(editingMatch.id);
                onClose();
              }
            }}
          >
            <XCircle size={16} />
            <span>Eliminar</span>
          </button>
        )}
        <div className="drawer-footer-spacer" />
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <RefreshCw className="spin" size={16} /> : <FileCheck size={16} />}
          <span>{editingMatch ? 'Guardar cambios' : 'Crear partido'}</span>
        </button>
      </div>
    </div>
  );
};
