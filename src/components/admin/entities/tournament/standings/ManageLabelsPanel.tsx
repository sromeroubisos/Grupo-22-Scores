'use client';

import { useEffect, useRef, useState } from 'react';
import { LabelChip } from './LabelChip';
import { useDialog } from '../useDialog';
import type { UiLabel } from './types';
import styles from './TournamentStandingsTab.module.css';

interface Props {
  labels: UiLabel[];
  onClose: () => void;
  onCreated: (label: UiLabel) => void;
  onUpdated: (label: UiLabel) => void;
  onDeleted: (id: string) => void;
}

const PRESET_COLORS = ['#91F5AD', '#5FBFF9', '#CA3CFF', '#FFC914', '#FF2E00'];
const DEFAULT_COLOR = PRESET_COLORS[0];

export function ManageLabelsPanel({ labels, onClose, onCreated, onUpdated, onDeleted }: Props) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [scope] = useState('standings');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  /**
   * Las cinco conductas de un diálogo (foco adentro, foco atrapado, foco
   * devuelto, Escape y bloqueo de scroll). El panel se declaraba `role="dialog"`
   * con `aria-modal` sin tener ninguna de ellas: Escape no hacía nada y el Tab
   * se iba a la tabla de atrás.
   */
  const { ref: dialogRef, dialogProps } = useDialog<HTMLDivElement>({
    open: true,
    onClose,
    label: 'Gestionar etiquetas',
  });

  // El foco inicial va al campo de nombre, que es lo primero que se viene a
  // hacer acá; `useDialog` sólo lo lleva al primer foco posible del panel.
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function startEdit(label: UiLabel) {
    setEditingId(label.id);
    setName(label.name);
    setColor(label.color);
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setName('');
    setColor(DEFAULT_COLOR);
    setError(null);
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setError('El nombre es obligatorio'); return; }
    setSaving(true);
    setError(null);

    try {
      if (editingId) {
        const res = await fetch(`/api/admin/labels/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed, color }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? 'Error al guardar');
        onUpdated(json.data);
        cancelEdit();
      } else {
        const res = await fetch('/api/admin/labels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed, color, scope }),
        });
        const json = await res.json();
        if (!json.ok) throw new Error(json.error ?? 'Error al crear');
        onCreated(json.data);
        setName('');
        setColor(DEFAULT_COLOR);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/labels/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'Error al eliminar');
      onDeleted(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div
      className={styles.labelsOverlay}
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={styles.labelsPanel}
        {...dialogProps}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.labelsPanelHeader}>
          <div className={styles.labelsPanelTitle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            Etiquetas
          </div>
          <button type="button" className={styles.labelsPanelClose} onClick={onClose} aria-label="Cerrar">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Existing labels list */}
        <div className={styles.labelsList}>
          {labels.length === 0 && (
            <p className={styles.labelsEmpty}>No hay etiquetas todavía. Creá la primera.</p>
          )}
          {labels.map((label) => (
            <div key={label.id} className={styles.labelRow}>
              <LabelChip name={label.name} color={label.color} />
              <div className={styles.labelRowActions}>
                <button
                  type="button"
                  className={styles.labelActionBtn}
                  onClick={() => startEdit(label)}
                  disabled={!!deletingId}
                  title="Editar"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  type="button"
                  className={`${styles.labelActionBtn} ${styles.labelActionBtnDanger}`}
                  onClick={() => handleDelete(label.id)}
                  disabled={deletingId === label.id}
                  title="Eliminar"
                >
                  {deletingId === label.id ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={styles.spinnerIcon}>
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.3"/>
                      <path d="M12 2a10 10 0 0110 10"/>
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
                      <path d="M10 11v6"/><path d="M14 11v6"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Create / Edit form */}
        <div className={styles.labelsForm}>
          <h4 className={styles.labelsFormTitle}>
            {editingId ? 'Editar etiqueta' : 'Nueva etiqueta'}
          </h4>

          <div className={styles.labelsFormRow}>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !saving && handleSave()}
              placeholder="Ej. Clasificado"
              className={styles.labelsInput}
              maxLength={40}
              disabled={saving}
            />
            <div className={styles.colorPickerWrap}>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className={styles.colorInput}
                disabled={saving}
                title="Elegir color"
              />
              <span className={styles.colorPreviewSwatch} style={{ backgroundColor: color }} />
            </div>
          </div>

          <div className={styles.colorPresetsRow}>
            {PRESET_COLORS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`${styles.colorPresetSwatch}${color === preset ? ` ${styles.colorPresetSwatchActive}` : ''}`}
                style={{ backgroundColor: preset }}
                onClick={() => setColor(preset)}
                disabled={saving}
                title={preset}
                aria-label={`Color ${preset}`}
              />
            ))}
          </div>

          {name.trim() && (
            <div className={styles.labelPreviewRow}>
              <span className={styles.labelPreviewHint}>Vista previa:</span>
              <LabelChip name={name.trim()} color={color} />
            </div>
          )}

          {error && <p className={styles.labelsError}>{error}</p>}

          <div className={styles.labelsFormActions}>
            {editingId && (
              <button type="button" className={styles.labelsBtnSecondary} onClick={cancelEdit} disabled={saving}>
                Cancelar
              </button>
            )}
            <button
              type="button"
              className={styles.labelsBtnPrimary}
              onClick={handleSave}
              disabled={saving || !name.trim()}
            >
              {saving ? 'Guardando…' : editingId ? 'Actualizar' : 'Crear etiqueta'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
