'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { TiebreakerMetricItem } from '@/types/phase-settings';

export interface TiebreakerItem extends TiebreakerMetricItem {
  label: string;
  description?: string;
  requiresRoundRobin?: boolean;
}

interface TiebreakerListProps {
  items: TiebreakerItem[];
  onChange: (items: TiebreakerItem[]) => void;
  phaseType?: string;
}

const isHeadToHeadMetric = (metric: string) =>
  metric === 'headToHead' || metric === 'head_to_head';

function SortableTiebreakerItem({
  item,
  index,
  isFirst,
  isLast,
  onToggleOrder,
  onRemove,
  onMoveUp,
  onMoveDown,
  showWarning,
}: {
  item: TiebreakerItem;
  index: number;
  isFirst: boolean;
  isLast: boolean;
  onToggleOrder: (order: 'asc' | 'desc') => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  showWarning: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.metric });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  const headToHead = isHeadToHeadMetric(item.metric);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tiebreaker-card ${isDragging ? 'is-dragging' : ''}`}
    >
      {/* ▲▼ stacked, icon-only, 28×28 each */}
      <div className="tiebreaker-reorder">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onMoveUp(); }}
          className="tiebreaker-reorder-btn"
          disabled={isFirst}
          aria-label={`Subir prioridad de ${item.label}`}
          title="Subir prioridad"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); onMoveDown(); }}
          className="tiebreaker-reorder-btn"
          disabled={isLast}
          aria-label={`Bajar prioridad de ${item.label}`}
          title="Bajar prioridad"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Drag handle (desktop) */}
      <div
        {...attributes}
        {...listeners}
        className="tiebreaker-drag-handle"
        title="Arrastrar para reordenar"
        aria-hidden="true"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="5" r="1.5" />
          <circle cx="15" cy="5" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="19" r="1.5" />
          <circle cx="15" cy="19" r="1.5" />
        </svg>
      </div>

      <div className="tiebreaker-priority-badge" aria-label={`Prioridad ${index + 1}`}>
        <span className="tiebreaker-priority-number">{index + 1}</span>
      </div>

      <div className="tiebreaker-info" title={headToHead ? 'Resuelve por el resultado entre los empatados.' : item.description}>
        <div className="tiebreaker-name">
          {item.label}
          {showWarning && (
            <span className="text-yellow-500 tiebreaker-warning-icon" title="Puede no ser válido para este tipo de fase">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
          )}
        </div>
        {item.description && (
          <div className="tiebreaker-desc-line" aria-hidden="true">{item.description}</div>
        )}
      </div>

      {/* Toggle inline, right-aligned. Hidden for headToHead (resolves by
          direct result, not by asc/desc on a numeric column). */}
      {!headToHead ? (
        <div className="order-pill-wrapper" role="group" aria-label="Sentido del desempate">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onToggleOrder('desc'); }}
            className={`order-pill-btn ${item.order === 'desc' ? 'active' : ''}`}
            title="Gana el equipo con mayor valor"
            aria-pressed={item.order === 'desc'}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="18 15 12 9 6 15" />
            </svg>
            <span>Mayor</span>
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onToggleOrder('asc'); }}
            className={`order-pill-btn ${item.order === 'asc' ? 'active' : ''}`}
            title="Gana el equipo con menor valor"
            aria-pressed={item.order === 'asc'}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            <span>Menor</span>
          </button>
        </div>
      ) : (
        <span className="tiebreaker-mode-tag" title="Resuelve por el resultado directo entre los equipos empatados">
          Directo
        </span>
      )}

      <button
        type="button"
        onClick={(e) => { e.preventDefault(); onRemove(); }}
        className="tiebreaker-remove-btn"
        title="Quitar (volver a Disponibles)"
        aria-label={`Quitar ${item.label}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export function TiebreakerList({ items, onChange, phaseType }: TiebreakerListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require a small drag distance before activating, so touch scroll
      // on the list area still works on mobile when grabbing a card body.
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const activeItems = items
    .filter(item => item.priority && item.priority > 0)
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

  const activeMetricsSet = new Set(activeItems.map(i => i.metric));

  const availableItems = items.filter(item => !activeMetricsSet.has(item.metric));

  const filteredAvailable = availableItems.filter(item =>
    item.label?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const reorderActive = (oldIndex: number, newIndex: number) => {
    if (oldIndex === newIndex || oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(activeItems, oldIndex, newIndex);
    const withUpdatedPriorities: TiebreakerItem[] = reordered.map((it, idx) => ({
      ...it,
      priority: idx + 1,
    }));
    const newItems = items.map(orig => {
      const found = withUpdatedPriorities.find(i => i.metric === orig.metric);
      return found ?? orig;
    });
    onChange(newItems);
  };

  const handleToggleOrder = (metric: string, order: 'asc' | 'desc') => {
    const newItems = items.map(item =>
      item.metric === metric ? { ...item, order } : item
    );
    onChange(newItems);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = activeItems.findIndex(item => item.metric === active.id);
      const newIndex = activeItems.findIndex(item => item.metric === over.id);
      reorderActive(oldIndex, newIndex);
    }
  };

  const handleMoveUp = (metric: string) => {
    const idx = activeItems.findIndex(i => i.metric === metric);
    if (idx <= 0) return;
    reorderActive(idx, idx - 1);
  };

  const handleMoveDown = (metric: string) => {
    const idx = activeItems.findIndex(i => i.metric === metric);
    if (idx === -1 || idx >= activeItems.length - 1) return;
    reorderActive(idx, idx + 1);
  };

  const handleAddAvailable = (metric: string) => {
    const newPriority = activeItems.length > 0
      ? Math.max(...activeItems.map(i => i.priority || 0)) + 1
      : 1;

    const newItems = items.map(item =>
      item.metric === metric
        ? { ...item, priority: newPriority, enabled: true, order: 'desc' as const }
        : item
    );
    onChange(newItems);
  };

  const handleRemoveActive = (metric: string) => {
    const remainingActive = activeItems.filter(i => i.metric !== metric);
    const withUpdatedPriorities = remainingActive.map((item, idx) => ({
      ...item,
      priority: idx + 1,
    }));

    const newItems = items.map(origItem => {
      if (origItem.metric === metric) {
        return { ...origItem, priority: 0 };
      }
      const foundActive = withUpdatedPriorities.find(i => i.metric === origItem.metric);
      return foundActive ? foundActive : origItem;
    });

    onChange(newItems);
  };

  return (
    <div className="wizard-content-grid">
      {/* Left Column: Active Tiebreakers */}
      <div className="space-y-4">
        <div className="tiebreaker-section-header">
          <h3 className="wizard-section-title tiebreaker-section-heading">
            <span className="tiebreaker-section-heading-text">Criterios activos</span>
            <span className="tiebreaker-section-count">
              {activeItems.length} activos
            </span>
            {/* Inline info tooltip — replaces the prior blue help banner.
                CSS-only hover/focus reveals the descriptor; the text lives
                in the tooltip element so screen readers pick it up. */}
            <span className="tiebreaker-info-tooltip" tabIndex={0} role="button" aria-label="Cómo funcionan los criterios">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span className="tiebreaker-info-tooltip-content">
                El sistema prueba cada criterio en orden hasta resolver el empate. Subí o bajá la prioridad con las flechas o arrastrando.
              </span>
            </span>
          </h3>
        </div>

        {activeItems.length === 0 ? (
          <div className="tiebreaker-empty-state" role="status">
            <div className="tiebreaker-empty-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h13" />
                <path d="M3 12h9" />
                <path d="M3 18h6" />
                <path d="m17 8 4 4-4 4" />
                <path d="M21 12h-9" />
              </svg>
            </div>
            <div className="tiebreaker-empty-text">
              <span className="tiebreaker-empty-title">Sin criterios activos</span>
              <span className="tiebreaker-empty-help">
                Tocá un criterio de <strong>Disponibles</strong> para agregarlo y ordenarlo por prioridad.
              </span>
            </div>
          </div>
        ) : (
          <>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={activeItems.map(item => item.metric)} strategy={verticalListSortingStrategy}>
                <div className="tiebreaker-active-list">
                  {activeItems.map((item, index) => (
                    <SortableTiebreakerItem
                      key={item.metric}
                      item={item}
                      index={index}
                      isFirst={index === 0}
                      isLast={index === activeItems.length - 1}
                      onToggleOrder={(order) => handleToggleOrder(item.metric, order)}
                      onRemove={() => handleRemoveActive(item.metric)}
                      onMoveUp={() => handleMoveUp(item.metric)}
                      onMoveDown={() => handleMoveDown(item.metric)}
                      showWarning={!!item.requiresRoundRobin && phaseType !== 'league'}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {(() => {
              const enabledActive = activeItems.filter(item => item.enabled);
              if (enabledActive.length === 0) return null;
              const first = enabledActive[0]?.label;
              const second = enabledActive[1]?.label;
              return (
                <p className="tiebreaker-cascade-summary">
                  Se aplicará primero <strong>«{first}»</strong>
                  {second && (
                    <>
                      . Si persiste el empate, se usará <strong>«{second}»</strong>
                      {enabledActive.length > 2 && ', y así sucesivamente'}
                    </>
                  )}
                  {!second && ' como único criterio'}
                  .
                </p>
              );
            })()}
          </>
        )}
      </div>

      {/* Right Column: Available Tiebreakers */}
      <div className="wizard-right-panel">
        <div className="flex flex-col h-full max-h-[400px]">
          <h3 className="wizard-section-title tiebreaker-section-heading">
            <span className="tiebreaker-section-heading-text">Disponibles</span>
            <span className="tiebreaker-section-count">
              {availableItems.length} disponibles
            </span>
          </h3>

          <div className="relative mb-4 group">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar criterio..."
              className="manager-url-input text-sm w-full pl-10 py-2.5 bg-[rgba(255,255,255,0.03)] border-[var(--border)] focus:border-[var(--accent-cyan)] transition-all rounded-lg text-white"
            />
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#888] group-focus-within:text-[var(--accent-cyan)] transition-colors"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>

          <div className="available-items-list pr-2 flex-col gap-2 flex-grow overflow-y-auto min-h-0">
            {filteredAvailable.length === 0 ? (
              <div className="tiebreaker-available-empty">
                <span className="tiebreaker-available-empty-title">
                  {availableItems.length === 0 ? 'Todos los criterios están en uso' : 'Sin coincidencias'}
                </span>
                <span className="tiebreaker-available-empty-help">
                  {availableItems.length === 0
                    ? 'Quitá uno de la izquierda para liberar criterios.'
                    : searchTerm
                      ? 'No encontramos resultados para "' + searchTerm + '".'
                      : 'No encontramos resultados.'}
                </span>
              </div>
            ) : (
              filteredAvailable.map(item => (
                <button
                  key={item.metric}
                  type="button"
                  onClick={() => handleAddAvailable(item.metric)}
                  className="available-item group/item"
                  aria-label={'Agregar ' + item.label + ' a los criterios activos'}
                >
                  <div className="available-item-text">
                    <div className="available-item-label">{item.label}</div>
                    {item.description && <div className="available-item-desc">{item.description}</div>}
                  </div>
                  <div className="available-item-add" aria-hidden="true">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
