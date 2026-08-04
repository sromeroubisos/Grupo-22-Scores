'use client';

import { startTransition, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileUp, RefreshCw, Upload, X } from 'lucide-react';
import { useFixture } from './FixtureContext';
import './operation-console.css';
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

/**
 * Lee un campo del editor de una fila respetando el «lo dejé vacío a propósito».
 *
 * `overrides.roundId || matched.round?.id || ''` —que era lo que había— hace que
 * un `null` guardado a propósito caiga de nuevo en el match automático: si la
 * fila venía enganchada a una jornada, elegir «crear una nueva» rebotaba al
 * valor anterior y el campo parecía trabado. Con `in` se distingue «el usuario
 * lo tocó y lo dejó vacío» de «nunca lo tocó».
 */
function fieldValue(
  overrides: Record<string, unknown>,
  key: string,
  automatic: string | undefined,
): string {
  if (key in overrides) return (overrides[key] as string | null) ?? '';
  return automatic ?? '';
}

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
  const [isDragging, setIsDragging] = useState(false);
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

  // Cuántas líneas trae el texto pegado. Es la única señal que se puede dar
  // ANTES de analizar: sin esto pegás un WhatsApp y no sabés si el asistente
  // está viendo 12 partidos o uno solo mal cortado.
  const pastedLines = useMemo(
    () => pastedText.split('\n').map((line) => line.trim()).filter(Boolean).length,
    [pastedText],
  );

  const ACCEPTED_EXTENSIONS = '.csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp';

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDrop = (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) {
      setFile(dropped);
      setFeedback(null);
    }
  };

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
    <section className="op-panel op-import-panel">
      {/* La cabecera tenía tres títulos para una sola caja —rótulo, un <h3>
          que decía «Deteccion, validacion y confirmacion» y un párrafo que
          volvía a contar los cuatro pasos que el riel de arriba ya dibuja—, y
          adentro de ese párrafo, escondido al final, el dato más útil de la
          pantalla: qué forma tiene que tener cada línea.

          Queda el rótulo, que es lo que la consola usa como título de panel. El
          resto se reparte donde sirve: la garantía de que nada se escribe solo
          va como aviso (es lo que te deja probar sin miedo) y el formato baja
          junto a la zona donde pegás o soltás el archivo, que es el momento en
          que lo necesitás. */}
      <div className="op-panel-head">
        <span className="op-panel-title">Importar fixture</span>
        <div className="op-panel-actions">
          <button className="op-import-close" onClick={onBack} aria-label="Cerrar el importador" type="button">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="op-panel-body op-import-body">
        <div className="op-note is-info">
          <span className="op-note-icon"><CheckCircle2 size={12} /></span>
          <span className="op-note-copy">
            <strong>Nada se crea hasta que vos lo apruebes</strong>
            <span>Analizar sólo lee la fuente y arma un preview fila por fila. Los partidos se escriben recién en el paso 4, y podés omitir las filas que quieras.</span>
          </span>
        </div>

      {/* Selector de fuente. Las clases `strategy-card` y `upload-drop-area`
          NUNCA tuvieron CSS en el proyecto, así que hasta acá el paso se
          renderizaba sin estilo: la etiqueta pegada a su descripción
          («ArchivoEXCEL, CSV, PDF O IMAGEN»), los íconos sueltos y nada que
          pareciera clicable. Ahora hablan el vocabulario de la consola. */}
      <div className="op-import-sources" role="radiogroup" aria-label="Fuente a importar">
        <button
          className={`op-import-source ${mode === 'file' ? 'is-active' : ''}`}
          onClick={() => setMode('file')}
          type="button"
          role="radio"
          aria-checked={mode === 'file'}
        >
          <span className="op-import-source-icon"><Upload size={18} /></span>
          <span className="op-import-source-copy">
            {/* Decía «Excel, CSV, PDF o imagen» como si los cuatro fueran lo
                mismo. No lo son: `parseFile` sólo tiene lector para Excel y CSV
                (XLSX.read); PDF e imagen caen al return de abajo, que devuelve
                CERO filas y el aviso «quedan en revisión obligatoria hasta
                integrar OCR». Subir un PDF y recibir un preview vacío con una
                advertencia críptica era la parte más confusa del asistente. Se
                siguen aceptando —el flujo los banca como revisión manual— pero
                la etiqueta ya no promete lo que el código no hace. */}
            <strong>Archivo</strong>
            <small>Excel o CSV · el PDF y las imágenes todavía no se leen solos</small>
          </span>
        </button>
        <button
          className={`op-import-source ${mode === 'text' ? 'is-active' : ''}`}
          onClick={() => setMode('text')}
          type="button"
          role="radio"
          aria-checked={mode === 'text'}
        >
          <span className="op-import-source-icon"><FileUp size={18} /></span>
          <span className="op-import-source-copy">
            <strong>Texto pegado</strong>
            <small>WhatsApp, web o documento</small>
          </span>
        </button>
      </div>

      {mode === 'file' ? (
        <div className="op-import-drop-wrap">
          <input
            type="file"
            id="smart-fixture-import"
            hidden
            accept={ACCEPTED_EXTENSIONS}
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setFeedback(null);
            }}
          />

          {file ? (
            /* Con el archivo elegido, la zona deja de pedir y pasa a confirmar
               QUÉ se va a analizar: nombre, peso y cómo sacarlo. Antes sólo
               cambiaba el texto por el nombre del archivo, sin forma de
               deshacer salvo volver a abrir el explorador. */
            <div className="op-import-file">
              <span className="op-import-file-icon"><CheckCircle2 size={18} /></span>
              <span className="op-import-file-copy">
                <strong>{file.name}</strong>
                <small>{formatFileSize(file.size)} · listo para analizar</small>
              </span>
              <button
                type="button"
                className="basalt-btn"
                onClick={() => setFile(null)}
              >
                Quitar
              </button>
              <label htmlFor="smart-fixture-import" className="basalt-btn">
                Cambiar
              </label>
            </div>
          ) : (
            /* Arrastrar y soltar: es el gesto natural para traer una planilla y
               el asistente no lo aceptaba — sólo abría el explorador. El
               <label> sigue funcionando con teclado y click. */
            <label
              htmlFor="smart-fixture-import"
              className={`op-import-drop ${isDragging ? 'is-dragging' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <FileUp size={26} aria-hidden="true" />
              <strong>{isDragging ? 'Soltá el archivo acá' : 'Arrastrá el archivo o hacé click'}</strong>
              <small>Una planilla por vez. Con .xlsx, .xls o .csv se leen las filas solas; un .pdf o una foto entran igual, pero hay que cargarlos a mano.</small>
            </label>
          )}
        </div>
      ) : (
        <label className="op-field">
          <span>
            Texto fuente
            {pastedLines > 0 ? (
              <span className="op-import-lines">{pastedLines} {pastedLines === 1 ? 'línea' : 'líneas'}</span>
            ) : null}
          </span>
          <textarea
            rows={6}
            value={pastedText}
            onChange={(event) => setPastedText(event.target.value)}
            placeholder={'Jornada 1 - 19/03/2026 - Jockey Club vs Tala RC - 16:30 - Cancha 1\nJornada 1 - 19/03/2026 - CRAI vs Estudiantes - 18:00 - Cancha 2'}
          />
        </label>
      )}

      {/* El formato esperado estaba enterrado al final del párrafo de la
          cabecera. Es el dato que decide si la importación sale bien o te
          devuelve 40 filas en rojo, así que va acá, en mono, pegado al campo
          donde tenés que producirlo. */}
      <p className="op-import-format">
        <span>Formato por línea</span>
        <code>Jornada 1 - 19/03/2026 - Equipo A vs Equipo B - 16:30 - Cancha 1</code>
      </p>

      <div className="op-import-foot">
        <button className="basalt-btn" onClick={onBack} type="button">
          Volver
        </button>
        {/* Azul, no verde. En esta consola el verde es la acción que ESCRIBE, y
            analizar no escribe nada: lee la fuente y arma el preview. El único
            verde del asistente es «Confirmar importación», que es el que crea
            los partidos — así se ve de un vistazo cuál de los dos botones es el
            que no tiene vuelta atrás. */}
        <button
          className="basalt-btn basalt-btn-accent"
          onClick={() => runPreview()}
          disabled={isPreviewing || (mode === 'file' ? !file : !pastedText.trim())}
          type="button"
        >
          {isPreviewing ? <RefreshCw className="spin" size={16} /> : <Upload size={16} />}
          <span>{isPreviewing ? 'Analizando…' : 'Analizar fuente'}</span>
        </button>
      </div>

      {feedback ? (
        <div className="op-note is-warning">
          <span className="op-note-icon"><AlertTriangle size={12} /></span>
          <span className="op-note-copy"><span>{feedback}</span></span>
        </div>
      ) : null}

      {preview ? (
        <>
          <div className="op-import-stats">
            <div className="op-import-stat">
              <span>Tipo detectado</span>
              <strong>{preview.summary.sourceType}</strong>
            </div>
            <div className="op-import-stat">
              <span>Documento</span>
              <strong>{preview.summary.documentType}</strong>
            </div>
            <div className="op-import-stat">
              <span>Confianza</span>
              <strong>{preview.summary.confidence}</strong>
            </div>
            <div className="op-import-stat">
              <span>Partidos detectados</span>
              <strong>{preview.summary.totalRows}</strong>
            </div>
          </div>

          {preview.mapping.headers.length > 0 ? (
            <div className="fixture-wizard-grid op-import-mapping-grid">
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
              <div className="op-import-foot op-import-mapping-foot">
                <button className="basalt-btn" onClick={() => runPreview(mapping)} disabled={isPreviewing} type="button">
                  {isPreviewing ? <RefreshCw className="spin" size={16} /> : <RefreshCw size={16} />}
                  <span>Reanalizar con mapeo</span>
                </button>
              </div>
            </div>
          ) : null}

          <div className="op-import-stats">
            <div className="op-import-stat">
              <span>Filas aprobadas</span>
              <strong>{metrics.approved}</strong>
            </div>
            <div className="op-import-stat">
              <span>Filas omitidas</span>
              <strong>{metrics.omitted}</strong>
            </div>
            <div className="op-import-stat">
              <span>Con advertencias</span>
              <strong>{preview.summary.warningRows}</strong>
            </div>
            <div className="op-import-stat">
              <span>Con errores</span>
              <strong>{preview.summary.errorRows}</strong>
            </div>
          </div>

          {/* Los estilos de estas filas estaban INLINE (padding, radio de 18px,
              borde rgba fijo, alto máximo de 480). Un estilo inline gana sobre
              cualquier hoja y no lo alcanza ningún media query, así que la lista
              del preview era la única parte del asistente imposible de adaptar a
              un teléfono. Ahora son clases. */}
          <div className="op-import-preview-list">
            {rows.map((row) => (
              <article key={row.previewId} className="op-import-preview-row">
                <div className="op-import-preview-head">
                  <div className="op-import-preview-title">
                    <strong>{row.sourceLabel}</strong>
                    <span>{STATUS_LABELS[row.status]}</span>
                  </div>
                  <div className="op-import-preview-actions">
                    <button
                      className={`basalt-btn ${row.action === 'approve' ? 'basalt-btn-primary' : ''}`}
                      onClick={() => updateRow(row.previewId, { action: 'approve' })}
                      type="button"
                    >
                      Aprobar
                    </button>
                    <button
                      className={`basalt-btn ${row.action === 'omit' ? 'basalt-btn-accent' : ''}`}
                      onClick={() => updateRow(row.previewId, { action: 'omit' })}
                      type="button"
                    >
                      Omitir
                    </button>
                  </div>
                </div>

                <div className="fixture-wizard-grid op-import-preview-grid">
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
                  {/* La jornada era DOS campos —«Fecha / Round» y «Etiqueta de
                      jornada»— con nombres que se leen igual, y el desplegable
                      caía en «Crear/usar etiqueta libre», que suena a «no
                      entendí». No es eso: son dos cosas distintas, y la que
                      confunde es la que no se estaba diciendo.

                      El desplegable ENGANCHA con una jornada que ya existe en
                      la fase. La etiqueta CREA una. Cuando el texto dice
                      «Jornada 1» y la fase todavía no tiene jornadas, la
                      detección funcionó perfecto —por eso la etiqueta dice
                      «Fecha 1»— y lo único que falta es crearla al confirmar.

                      Ahora es un solo bloque que dice qué va a pasar. */}
                  {(() => {
                    const boundRoundId = fieldValue(row.overrides, 'roundId', row.matched.round?.id);
                    const roundLabel = fieldValue(row.overrides, 'round', row.normalized.round ?? undefined);
                    const phaseRounds = preview.referenceData.rounds;

                    return (
                      <div className="editor-field op-import-round">
                        <label>Jornada</label>
                        <select
                          className="glass-input"
                          value={boundRoundId}
                          onChange={(event) => updateRow(row.previewId, { overrides: { roundId: event.target.value || null } })}
                        >
                          <option value="">
                            {roundLabel ? `Crear «${roundLabel}»` : 'Sin jornada'}
                          </option>
                          {phaseRounds.map((round) => (
                            <option key={round.id} value={round.id}>
                              {round.label}
                            </option>
                          ))}
                        </select>

                        {/* La etiqueta sólo tiene sentido cuando se va a crear:
                            al lado de una jornada ya elegida es un campo muerto
                            que invita a escribir algo que no se usa. */}
                        {!boundRoundId ? (
                          <input
                            type="text"
                            className="glass-input"
                            value={roundLabel}
                            onChange={(event) => updateRow(row.previewId, { overrides: { round: event.target.value || null } })}
                            placeholder="Fecha 1"
                            aria-label="Nombre de la jornada a crear"
                          />
                        ) : null}

                        <small className="op-import-round-hint">
                          {boundRoundId
                            ? 'Se engancha con una jornada que ya existe en la fase.'
                            : roundLabel
                              ? phaseRounds.length
                                ? `Detectada en el texto. No coincide con ninguna de las ${phaseRounds.length} de la fase, así que se crea al confirmar.`
                                : 'Detectada en el texto. La fase todavía no tiene jornadas: esta se crea al confirmar.'
                              : 'El texto no decía la jornada. Escribila acá o dejá el partido suelto.'}
                        </small>
                      </div>
                    );
                  })()}
                  <div className="editor-field">
                    <label>Grupo</label>
                    <select
                      className="glass-input"
                      value={fieldValue(row.overrides, 'groupId', row.matched.group?.id)}
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
                  <div className="op-import-preview-issues">
                    {row.issues.map((issue) => (
                      <div key={`${row.previewId}-${issue.code}-${issue.message}`} className="op-import-preview-issue">
                        {issue.severity === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                        <span>{issue.message}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>

          <div className="op-import-foot">
            <button className="basalt-btn" onClick={() => setRows((current) => current.map((row) => ({ ...row, action: 'omit' })))} type="button">
              Omitir todo
            </button>
            <button className="basalt-btn" onClick={() => setRows((current) => current.map((row) => ({ ...row, action: 'approve' })))} type="button">
              Aprobar todo lo visible
            </button>
            {/* El único verde del asistente: es el paso que escribe. */}
            <button className="basalt-btn basalt-btn-primary" onClick={handleConfirm} disabled={isConfirming || !rows.length} type="button">
              {isConfirming ? <RefreshCw className="spin" size={16} /> : <CheckCircle2 size={16} />}
              <span>
                {isConfirming
                  ? 'Importando…'
                  : `Confirmar ${metrics.approved} ${metrics.approved === 1 ? 'partido' : 'partidos'}`}
              </span>
            </button>
          </div>
        </>
      ) : null}
      </div>
    </section>
  );
}
