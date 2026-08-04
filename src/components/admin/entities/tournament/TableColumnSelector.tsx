'use client';

import { useState } from 'react';

export interface ColumnCategory {
  id: string;
  label: string;
  columns: Array<{ id: string; label: string }>;
}

interface TableColumnSelectorProps {
  categories: ColumnCategory[];
  selectedColumns: Record<string, boolean>;
  onChange: (columns: Record<string, boolean>) => void;
  /** Hide the inner "Glosario de columnas" heading + counter when the selector
      is rendered inside an already-titled disclosure / panel. */
  hideHeader?: boolean;
}

export function TableColumnSelector({
  categories,
  selectedColumns,
  onChange,
  hideHeader = false,
}: TableColumnSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('');

  const toggleColumn = (columnId: string) => {
    onChange({
      ...selectedColumns,
      [columnId]: !selectedColumns[columnId],
    });
  };

  const toggleCategory = (categoryId: string) => {
    const category = categories.find(cat => cat.id === categoryId);
    if (!category) return;

    const allSelected = category.columns.every(col => selectedColumns[col.id]);
    const newColumns = { ...selectedColumns };

    category.columns.forEach(col => {
      newColumns[col.id] = !allSelected;
    });

    onChange(newColumns);
  };

  const filteredCategories = categories.map(category => ({
    ...category,
    columns: category.columns.filter(col =>
      col.label.toLowerCase().includes(searchTerm.toLowerCase())
    ),
  })).filter(category => category.columns.length > 0);

  const selectedCount = Object.values(selectedColumns).filter(Boolean).length;
  const totalCount = categories.reduce((acc, cat) => acc + cat.columns.length, 0);

  return (
    <div className="flex flex-col relative px-[24px] py-[20px] rounded-sm bg-[var(--surface-elevated)] border border-[var(--border-basalt)] overflow-hidden">
      {/* Content wrapper */}
      <div className="relative z-10 flex flex-col h-full">
        {!hideHeader && (
          <div className="flex items-center justify-between mb-[20px]">
            <h3 className="text-[0.85rem] font-mono font-semibold text-[var(--text-secondary)] m-0 leading-none uppercase tracking-[0.14em]">
              Glosario de columnas
            </h3>
            <span className="text-[0.75rem] font-mono text-[var(--text-secondary)]">
              {selectedCount} de {totalCount} seleccionadas
            </span>
          </div>
        )}

        {/* Search bar */}
        <div className="relative mb-5 group shrink-0">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar columna..."
            className="w-full h-[44px] pl-10 pr-4 bg-[var(--bg-basalt)] border border-[rgba(255,255,255,0.12)] focus:border-[var(--accent-cyan)] transition-all rounded text-sm text-[var(--text-main)] outline-none focus:ring-1 focus:ring-[var(--accent-cyan)]"
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

        {/* Categories List */}
        <div className="pr-1 overflow-y-auto min-h-0 custom-scrollbar max-h-[520px]">
          {filteredCategories.map(category => {
            const categorySelectedCount = category.columns.filter(col => selectedColumns[col.id]).length;
            const allSelected = categorySelectedCount === category.columns.length && category.columns.length > 0;
            const someSelected = categorySelectedCount > 0 && !allSelected;

            let badgeClass = 'glossary-badge';
            if (allSelected) badgeClass += ' full';
            else if (someSelected) badgeClass += ' partial';

            return (
              <div key={category.id} className="mb-6 last:mb-0">
                {/* Category Header */}
                <div className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.1)] mb-3">
                  <label className="flex items-center gap-3 cursor-pointer select-none group">
                    <div className="relative flex items-center justify-center w-[16px] h-[16px]">
                      <input
                        type="checkbox"
                        className="peer appearance-none w-4 h-4 rounded-sm border border-[rgba(255,255,255,0.3)] bg-[var(--bg-basalt)] checked:bg-[var(--accent-cyan)] checked:border-[var(--accent-cyan)] transition-all cursor-pointer m-0"
                        checked={allSelected}
                        ref={input => {
                          if (input) {
                            input.indeterminate = someSelected;
                          }
                        }}
                        onChange={() => toggleCategory(category.id)}
                      />
                      {allSelected && (
                        <svg className="absolute w-3 h-3 text-black pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      )}
                      {someSelected && !allSelected && (
                        <div className="absolute w-2 h-[2px] bg-white rounded-full pointer-events-none"></div>
                      )}
                    </div>
                    <span className="text-[12px] font-[800] text-[var(--text-main)] uppercase tracking-[0.14em] group-hover:text-[var(--accent-cyan)] transition-colors">
                      {category.label}
                    </span>
                  </label>
                  <span className={badgeClass}>
                    {categorySelectedCount}/{category.columns.length}
                  </span>
                </div>

                {/* Category Columns */}
                <div className="grid grid-cols-2 gap-x-6 gap-y-[6px]">
                  {category.columns.map(column => {
                    const isChecked = selectedColumns[column.id] || false;
                    return (
                      <label
                        key={column.id}
                        className="cursor-pointer flex items-center gap-3 select-none text-[14px] text-[#aaa] py-1.5 rounded hover:text-[var(--text-main)] transition-colors group"
                      >
                        <div className="relative flex items-center justify-center w-[16px] h-[16px] flex-shrink-0">
                          <input
                            type="checkbox"
                            className="peer appearance-none w-4 h-4 rounded-sm border border-[rgba(255,255,255,0.2)] bg-[var(--bg-basalt)] checked:bg-[var(--accent-cyan)] checked:border-[var(--accent-cyan)] transition-all cursor-pointer m-0 group-hover:border-[rgba(255,255,255,0.4)]"
                            checked={isChecked}
                            onChange={() => toggleColumn(column.id)}
                          />
                          {isChecked && (
                            <svg className="absolute w-3 h-3 text-black pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                          )}
                        </div>
                        <span className="truncate">{column.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {searchTerm && filteredCategories.length === 0 && (
          <div className="text-center py-8 text-[14px] text-[#666]">
            No se encontraron columnas para &quot;{searchTerm}&quot;
          </div>
        )}
      </div>
    </div>
  );
}
