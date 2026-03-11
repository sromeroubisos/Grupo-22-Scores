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

function SortableTiebreakerItem({
  item,
  index,
  onToggleEnabled,
  onToggleOrder,
  onRemove,
  showWarning
}: {
  item: TiebreakerItem;
  index: number;
  onToggleEnabled: () => void;
  onToggleOrder: (order: 'asc' | 'desc') => void;
  onRemove: () => void;
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`tiebreaker-card ${isDragging ? 'is-dragging' : ''} ${!item.enabled ? 'opacity-50 grayscale' : ''}`}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="tiebreaker-drag-handle"
        title="Arrastrar para reordenar"
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

      {/* Priority Badge */}
      <div className="tiebreaker-priority-badge">
        {String(index + 1).padStart(2, '0')}
      </div>

      {/* Name and Description */}
      <div className="tiebreaker-info">
        <div className="tiebreaker-name flex items-center gap-2">
          {item.label}
          {showWarning && (
            <span className="text-yellow-500" title="Puede no ser válido para este tipo de fase">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
          )}
        </div>
        {item.description && (
          <div className="tiebreaker-desc">{item.description}</div>
        )}
      </div>

      {/* ASC/DESC Toggle */}
      <div className="order-pill-wrapper">
        <button
          onClick={(e) => { e.preventDefault(); onToggleOrder('asc'); }}
          className={`order-pill-btn ${item.order === 'asc' ? 'active' : ''}`}
          title="Ascendente (menor a mayor)"
        >
          Asc
        </button>
        <button
          onClick={(e) => { e.preventDefault(); onToggleOrder('desc'); }}
          className={`order-pill-btn ${item.order === 'desc' ? 'active' : ''}`}
          title="Descendente (mayor a menor)"
        >
          Desc
        </button>
      </div>

      {/* Enabled Toggle Switch */}
      <label className="custom-switch-label" title={item.enabled ? 'Deshabilitar' : 'Habilitar'}>
        <input
          type="checkbox"
          checked={item.enabled}
          onChange={onToggleEnabled}
        />
        <span className="custom-switch-slider"></span>
      </label>

      {/* Remove Button */}
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); onRemove(); }}
        className="tiebreaker-remove-btn"
        title="Quitar (Mover a Disponibles)"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  );
}

export function TiebreakerList({ items, onChange, phaseType }: TiebreakerListProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // We consider an item 'active' if it has been assigned a priority (> 0)
  // Or we can just use `priority` property to distinguish active vs available
  
  // Sort active items by priority
  const activeItems = items
    .filter(item => item.priority && item.priority > 0)
    .sort((a, b) => (a.priority || 0) - (b.priority || 0));

  const activeMetricsSet = new Set(activeItems.map(i => i.metric));
  
  // Available items are those without a valid priority
  const availableItems = items.filter(item => !activeMetricsSet.has(item.metric));

  const filteredAvailable = availableItems.filter(item => 
    item.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.description && item.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleToggleOrder = (metric: string, order: 'asc' | 'desc') => {
    const newItems = items.map(item =>
      item.metric === metric ? { ...item, order } : item
    );
    onChange(newItems);
  };

  const handleToggleEnabled = (metric: string) => {
    const newItems = items.map(item =>
      item.metric === metric ? { ...item, enabled: !item.enabled } : item
    );
    onChange(newItems);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = activeItems.findIndex(item => item.metric === active.id);
      const newIndex = activeItems.findIndex(item => item.metric === over.id);

      const reorderedActive = arrayMove(activeItems, oldIndex, newIndex);
      
      // Update priorities based on new order (1 to N)
      const withUpdatedPriorities: TiebreakerItem[] = reorderedActive.map((item, idx) => ({
        ...item,
        priority: idx + 1
      }));
      
      // Merge with available
      const newItems = items.map(origItem => {
        const foundActive = withUpdatedPriorities.find(i => i.metric === origItem.metric);
        return foundActive ? foundActive : origItem;
      });

      onChange(newItems);
    }
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
    // Recompute priorities for remaining so they are consecutive
    const withUpdatedPriorities = remainingActive.map((item, idx) => ({
      ...item,
      priority: idx + 1
    }));

    const newItems = items.map(origItem => {
      if (origItem.metric === metric) {
        // Clear priority to move to available, keep other settings per requirements
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
        <div>
          <h3 className="wizard-section-title">
             Activos
            <span className="text-xs font-mono text-[#888] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 rounded ml-2 normal-case">
              {activeItems.length} seleccionados
            </span>
          </h3>
          <p className="text-xs text-[#888] mb-4">
            El sistema aplicará los criterios en este orden hasta desempatar. Arrastra desde (⋮⋮) para reordenar la prioridad real.
          </p>
        </div>

        {activeItems.length === 0 ? (
          <div className="p-8 border-2 border-dashed border-[var(--border)] rounded-xl text-center bg-[rgba(255,255,255,0.02)] flex flex-col items-center justify-center h-48">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="text-[#666] mb-3">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
            <span className="text-sm text-[#888] font-medium">
              No hay criterios activos
            </span>
            <span className="text-xs text-[#666] mt-1">
              Agrega criterios desde la lista de disponibles.
            </span>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={activeItems.map(item => item.metric)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {activeItems.map((item, index) => (
                  <SortableTiebreakerItem
                    key={item.metric}
                    item={item}
                    index={index}
                    onToggleEnabled={() => handleToggleEnabled(item.metric)}
                    onToggleOrder={(order) => handleToggleOrder(item.metric, order)}
                    onRemove={() => handleRemoveActive(item.metric)}
                    showWarning={!!item.requiresRoundRobin && phaseType !== 'league'}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Right Column: Available Tiebreakers */}
      <div className="wizard-right-panel">
        <div className="flex flex-col h-full max-h-[400px]">
          <h3 className="wizard-section-title">
            Disponibles
            <span className="text-xs font-mono text-[#888] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 rounded ml-2 normal-case">
              {availableItems.length}
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
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#666] group-focus-within:text-[var(--accent-cyan)] transition-colors"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </div>

          <div className="available-items-list pr-2 flex-col gap-2 flex-grow overflow-y-auto min-h-0">
            {filteredAvailable.length === 0 ? (
              <div className="text-center py-6 text-xs text-[#666]">
                No se encontraron criterios {searchTerm ? `para "${searchTerm}"` : ''}
              </div>
            ) : (
              filteredAvailable.map(item => (
                <div
                  key={item.metric}
                  onClick={() => handleAddAvailable(item.metric)}
                  className="available-item group/item"
                >
                  <div>
                    <div className="text-sm font-medium text-[#ccc] group-hover/item:text-white transition-colors">{item.label}</div>
                    {item.description && <div className="text-[10px] text-[#666] mt-0.5">{item.description}</div>}
                  </div>
                  <div className="w-6 h-6 rounded-full bg-[rgba(255,255,255,0.05)] flex items-center justify-center text-[#888] group-hover/item:bg-[var(--accent-cyan)] group-hover/item:text-white transition-all transform group-hover/item:scale-110 flex-shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"></line>
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
