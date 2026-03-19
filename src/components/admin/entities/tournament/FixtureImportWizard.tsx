'use client';

import { startTransition, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, RefreshCw, Upload, X } from 'lucide-react';
import { useFixture } from './FixtureContext';
import type {
  FixtureColumnMapping,
  FixtureDuplicateAction,
  FixtureImportAction,
  FixtureImportConfirmDecision,
  FixtureImportPreviewResult,
  FixtureImportPreviewRow,
} from '@/lib/types/fixture-import';

type DraftRow = FixtureImportPreviewRow & {
  action: FixtureImportAction;
  duplicateAction: FixtureDuplicateAction;
  overrides: Record<string, unknown>;
};

const MAPPING_FIELDS: Array<{ key: keyof FixtureColumnMapping; label: string }> = [
  { key: 'home_team', label: 'Club local' },
  { key: 'away_team', label: 'Club visitante' },
  { key: 'match_date', label: 'Fecha' },
  { key: 'match_time', label: 'Hora' },
  { key: 'venue', label: 'Sede' },
  { key: 'round', label: 'Fecha / Round' },
  { key: 'group', label: 'Zona / Grupo' },
  { key: 'competition_name', label: 'Competencia' },
  { key: 'category', label: 'Categoria' },
  { key: 'status', label: 'Estado' },
  { key: 'score', label: 'Resultado' },
];

const STATUS_LABELS: Record<FixtureImportPreviewRow['status'], string> = {
  valid: 'Valida',
  warning: 'Con advertencias',
  error: 'Con errores',
  duplicate: 'Posible duplicado',
  omitted: 'Omitida',
  approved: 'Aprobada',
};

export function FixtureImportWizard({
  phaseId,
  onBack,
  onComplete,
  onPreviewChange,
}: {
  phaseId: string;
  onBack: () => void;
  onComplete: () => void;
  onPreviewChange?: (preview: FixtureImportPreviewResult | null) => void;
}) {
  const { previewFixtureImport, confirmFixtureImport } = useFixture();
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [preview, setPreview] = useState<FixtureImportPreviewResult | null>(null);
  const [mapping, setMapping] = useState<FixtureColumnMapping>({});
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const metrics = useMemo(() => {
    return {
      approved: rows.filter((row) => row.action === 'approve').length,
      omitted: rows.filter((row) => row.action === 'omit').length,
    };
  }, [rows]);

  const runPreview = async (nextMapping?: FixtureColumnMapping) => {
    setIsPreviewing(true);
    setFeedback(null);

    const result = await previewFixtureImport({
      phaseId,
      file: mode === 'file' ? file : null,
      pastedText: mode === 'text' ? pastedText : null,
      mapping: nextMapping || mapping,
    });

    startTransition(() => {
      setPreview(result.ok ? result : null);
      setMapping(result.mapping.selected || {});
      setRows(
        !result.ok
          ? []
          : result.rows.map((row) => ({
              ...row,
              action: row.action,
              duplicateAction: row.duplicateAction,
              overrides: {},
            }))
      );
    });

    onPreviewChange?.(result.ok ? result : null);

    if (!result.ok) {
      setFeedback(result.issues[0]?.message || 'No se pudo analizar la fuente.');
    } else {
      setFeedback(null);
    }

    setIsPreviewing(false);
  };

  const updateRow = (previewId: string, patch: Partial<DraftRow>) => {
    setRows((current) =>
      current.map((row) => (row.previewId === previewId ? { ...row, ...patch, overrides: { ...row.overrides, ...(patch.overrides || {}) } } : row))
    );
  };

  const handleConfirm = async () => {
    if (!preview?.summary.jobId) return;
    setIsConfirming(true);
    setFeedback(null);

    const decisions: FixtureImportConfirmDecision[] = rows.map((row) => ({
      previewId: row.previewId,
      action: row.action,
      duplicateAction: row.duplicateAction,
      overrides: row.overrides,
    }));

    const result = await confirmFixtureImport({
      phaseId,
      jobId: preview.summary.jobId,
      decisions,
    });

    if (!result.ok && result.issues.length > 0) {
      setFeedback(result.issues[0].message);
      setIsConfirming(false);
      return;
    }

    setFeedback(`Importacion lista. Creados: ${result.created}, actualizados: ${result.updated}, omitidos: ${result.skipped}.`);
    setIsConfirming(false);
    onPreviewChange?.(null);
    onComplete();
  };

  return (
    <section className="fixture-panel-shell fixture-glass">
      <div className="fixture-panel-header">
        <div>
          <span className="fixture-kicker">Importar Fixture</span>
          <h3>Deteccion, validacion y confirmacion</h3>
          <p className="fixture-panel-copy">Ningun archivo crea partidos automaticamente. Todo pasa por preview y aprobacion. Formato sugerido: Jornada 1 - 19/03/2026 - Equipo A vs Equipo B - 16:30 - Cancha 1.</p>
        </div>
        <div className="fixture-panel-actions">
          <button className="fixture-icon-btn" onClick={onBack} title="Cerrar" type="button">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="fixture-confirm-grid">
        <button className={`strategy-card ${mode === 'file' ? 'active' : ''}`} onClick={() => setMode('file')} type="button">
          <Upload size={22} />
          <strong>Archivo</strong>
          <span>Excel, CSV, PDF o imagen</span>
        </button>
        <button className={`strategy-card ${mode === 'text' ? 'active' : ''}`} onClick={() => setMode('text')} type="button">
          <FileUp size={22} />
          <strong>Texto pegado</strong>
          <span>WhatsApp, web o documento</span>
        </button>
      </div>

      {mode === 'file' ? (
        <div className="fixture-upload-zone">
          <input
            type="file"
            id="smart-fixture-import"
            hidden
            accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp"
            onChange={(event) => setFile(event.target.files?.[0] || null)}
          />
          <label htmlFor="smart-fixture-import" className="upload-drop-area">
            <FileUp size={32} />
            <span>{file ? file.name : 'Selecciona una fuente para analizar'}</span>
            <em>Excel, CSV, PDF, imagenes y mas</em>
          </label>
        </div>
      ) : (
        <div className="editor-field">
          <label>Texto fuente</label>
          <textarea
            className="glass-input"
            rows={6}
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
            placeholder={'Jornada 1 - 19/03/2026 - Jockey Club vs Tala RC - 16:30 - Cancha 1\nJornada 1 - 19/03/2026 - CRAI vs Estudiantes - 18:00 - Cancha 2'}
            style={{ minHeight: 140 }}
          />
        </div>
      )}

      <div className="fixture-panel-footer">
        <button className="btn-secondary" onClick={onBack} type="button">
          Volver
        </button>
        <button
          className="btn-primary"
          onClick={() => runPreview()}
          disabled={isPreviewing || (mode === 'file' ? !file : !pastedText.trim())}
          type="button"
        >
          {isPreviewing ? <RefreshCw className="spin" size={16} /> : <Upload size={16} />}
          <span>{isPreviewing ? 'Analizando...' : 'Analizar fuente'}</span>
        </button>
      </div>

      {feedback ? (
        <div className="fixture-warning-callout">
          <AlertTriangle size={18} />
          <p>{feedback}</p>
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="fixture-confirm-grid">
            <div className="preview-stat">
              <span>Tipo detectado</span>
              <strong>{preview.summary.sourceType}</strong>
            </div>
            <div className="preview-stat">
              <span>Documento</span>
              <strong>{preview.summary.documentType}</strong>
            </div>
            <div className="preview-stat">
              <span>Confianza</span>
              <strong>{preview.summary.confidence}</strong>
            </div>
            <div className="preview-stat">
              <span>Partidos detectados</span>
              <strong>{preview.summary.totalRows}</strong>
            </div>
          </div>

          {preview.mapping.headers.length > 0 ? (
            <div className="fixture-wizard-grid" style={{ marginTop: 12 }}>
              {MAPPING_FIELDS.map((field) => (
                <div className="editor-field" key={field.key}>
                  <label>{field.label}</label>
                  <select
                    className="glass-input"
                    value={mapping[field.key] || ''}
                    onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value || null }))}
                  >
                    <option value="">Sin asignar</option>
                    {preview.mapping.headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <div className="fixture-panel-footer" style={{ gridColumn: '1 / -1', paddingTop: 0 }}>
                <button className="btn-secondary" onClick={() => runPreview(mapping)} disabled={isPreviewing} type="button">
                  {isPreviewing ? <RefreshCw className="spin" size={16} /> : <RefreshCw size={16} />}
                  <span>Reanalizar con mapeo</span>
                </button>
              </div>
            </div>
          ) : null}

          <div className="fixture-confirm-grid" style={{ marginTop: 12 }}>
            <div className="preview-stat">
              <span>Filas aprobadas</span>
              <strong>{metrics.approved}</strong>
            </div>
            <div className="preview-stat">
              <span>Filas omitidas</span>
              <strong>{metrics.omitted}</strong>
            </div>
            <div className="preview-stat">
              <span>Con advertencias</span>
              <strong>{preview.summary.warningRows}</strong>
            </div>
            <div className="preview-stat">
              <span>Con errores</span>
              <strong>{preview.summary.errorRows}</strong>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, marginTop: 16, maxHeight: 480, overflow: 'auto' }}>
            {rows.map((row) => (
              <article key={row.previewId} className="fixture-glass" style={{ padding: 16, borderRadius: 18, border: '1px solid rgba(255,255,255,.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                  <div>
                    <strong>{row.sourceLabel}</strong>
                    <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>{STATUS_LABELS[row.status]}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={`fixture-view-btn ${row.action === 'approve' ? 'active' : ''}`}
                      onClick={() => updateRow(row.previewId, { action: 'approve' })}
                      type="button"
                    >
                      Aprobar
                    </button>
                    <button
                      className={`fixture-view-btn ${row.action === 'omit' ? 'active' : ''}`}
                      onClick={() => updateRow(row.previewId, { action: 'omit' })}
                      type="button"
                    >
                      Omitir
                    </button>
                  </div>
                </div>

                <div className="fixture-wizard-grid" style={{ marginTop: 12 }}>
                  <div className="editor-field">
                    <label>Local</label>
                    <select
                      className="glass-input"
                      value={(row.overrides.homeClubId as string) || row.matched.homeClub?.id || ''}
                      onChange={(event) => updateRow(row.previewId, { overrides: { homeClubId: event.target.value || null } })}
                    >
                      <option value="">Sin asignar</option>
                      {preview.referenceData.clubs.map((club) => (
                        <option key={club.id} value={club.id}>
                          {club.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="editor-field">
                    <label>Visitante</label>
                    <select
                      className="glass-input"
                      value={(row.overrides.awayClubId as string) || row.matched.awayClub?.id || ''}
                      onChange={(event) => updateRow(row.previewId, { overrides: { awayClubId: event.target.value || null } })}
                    >
                      <option value="">Sin asignar</option>
                      {preview.referenceData.clubs.map((club) => (
                        <option key={club.id} value={club.id}>
                          {club.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="editor-field">
                    <label>Fecha</label>
                    <input
                      type="date"
                      className="glass-input"
                      value={String(row.overrides.matchDate || row.normalized.matchDate || '')}
                      onChange={(event) => updateRow(row.previewId, { overrides: { matchDate: event.target.value || null } })}
                    />
                  </div>
                  <div className="editor-field">
                    <label>Hora</label>
                    <input
                      type="time"
                      className="glass-input"
                      value={String(row.overrides.matchTime || row.normalized.matchTime || '')}
                      onChange={(event) => updateRow(row.previewId, { overrides: { matchTime: event.target.value || null } })}
                    />
                  </div>
                  <div className="editor-field">
                    <label>Sede</label>
                    <input
                      type="text"
                      className="glass-input"
                      value={String(row.overrides.venue || row.normalized.venue || '')}
                      onChange={(event) => updateRow(row.previewId, { overrides: { venue: event.target.value || null } })}
                    />
                  </div>
                  <div className="editor-field">
                    <label>Fecha / Round</label>
                    <select
                      className="glass-input"
                      value={(row.overrides.roundId as string) || row.matched.round?.id || ''}
                      onChange={(event) => updateRow(row.previewId, { overrides: { roundId: event.target.value || null } })}
                    >
                      <option value="">Crear/usar etiqueta libre</option>
                      {preview.referenceData.rounds.map((round) => (
                        <option key={round.id} value={round.id}>
                          {round.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="editor-field">
                    <label>Grupo</label>
                    <select
                      className="glass-input"
                      value={(row.overrides.groupId as string) || row.matched.group?.id || ''}
                      onChange={(event) => updateRow(row.previewId, { overrides: { groupId: event.target.value || null } })}
                    >
                      <option value="">Sin grupo</option>
                      {preview.referenceData.groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="editor-field">
                    <label>Duplicados</label>
                    <select
                      className="glass-input"
                      value={row.duplicateAction}
                      onChange={(event) => updateRow(row.previewId, { duplicateAction: event.target.value as FixtureDuplicateAction })}
                    >
                      <option value="skip_row">Omitir fila</option>
                      <option value="update_existing_match">Actualizar existente</option>
                      <option value="flag_for_manual_review">Revision manual</option>
                    </select>
                  </div>
                </div>

                {row.issues.length ? (
                  <div style={{ display: 'grid', gap: 6, marginTop: 12 }}>
                    {row.issues.map((issue) => (
                      <div key={`${row.previewId}-${issue.code}-${issue.message}`} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, opacity: 0.85 }}>
                        {issue.severity === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="fixture-panel-footer">
            <button className="btn-secondary" onClick={() => setRows((current) => current.map((row) => ({ ...row, action: 'omit' })))} type="button">
              Omitir todo
            </button>
            <button className="btn-secondary" onClick={() => setRows((current) => current.map((row) => ({ ...row, action: 'approve' })))} type="button">
              Aprobar todo lo visible
            </button>
            <button className="btn-primary" onClick={handleConfirm} disabled={isConfirming || !rows.length} type="button">
              {isConfirming ? <RefreshCw className="spin" size={16} /> : <CheckCircle2 size={16} />}
              <span>{isConfirming ? 'Importando...' : 'Confirmar importacion'}</span>
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}
